/*
 * Microscope canvas: three magnifications of the selected body region.
 *  - molecules: a field of PrP molecules; misfolded ones recruit and convert neighbours, then clump into aggregates
 *  - tissue:    an H&E-style brain section that becomes spongy (vacuoles), gains plaques and loses neurons
 *  - protein:   one PrP molecule docking onto a cross-β fibril and refolding, the core of templated misfolding
 */
(function () {
  const W = 720, H = 460;
  const NORMAL = [76, 155, 240], BAD = [255, 92, 92];

  // deterministic RNG so the tissue looks the same every time
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (c1, c2, t, a = 1) => `rgba(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(",")},${a})`;
  const tri = (x) => 1 - 4 * Math.abs(((x % 1) + 1) % 1 - 0.5); // triangle wave -1..1

  /* Shape of one PrP molecule, morphing from coiled α-helices (s=0) to a flat β zig-zag (s=1). */
  function proteinPoints(s, L, phase, n = 46) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      // α form: 3 helical coils plus a floppy N-terminal tail
      let ax, ay;
      if (t < 0.22) {
        ax = (t - 0.5) * L;
        ay = Math.sin(t * 26 + phase) * L * 0.06;
      } else {
        const u = (t - 0.22) / 0.78;
        const ang = u * 3 * Math.PI * 2;
        ax = (t - 0.5) * L + Math.cos(ang) * L * 0.07;
        ay = Math.sin(ang) * L * 0.16;
      }
      // β form: zig-zag of four strands
      const bx = (t - 0.5) * L;
      const by = tri(t * 2 + 0.25) * L * 0.22;
      pts.push([lerp(ax, bx, s), lerp(ay, by, s)]);
    }
    return pts;
  }

  function drawProtein(ctx, x, y, angle, s, L, phase, lw, glow) {
    const pts = proteinPoints(s, L, phase);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (glow && s > 0.3) {
      ctx.shadowColor = mix(NORMAL, BAD, s, 0.9);
      ctx.shadowBlur = 10 * s;
    }
    ctx.strokeStyle = mix(NORMAL, BAD, s);
    ctx.lineWidth = lw;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    ctx.restore();
  }

  class Microscope {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.view = "molecules";
      this.zoom = 1;
      this.cx = W / 2;
      this.cy = H / 2;
      this.state = { frac: 0, health: 1, brain: true };
      this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.initMolecules();
      this.initTissue();
      this.proteinT = 0;
      this.fibril = 5;
      this.bindPan();
      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || W;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(w * (H / W) * dpr);
      this.k = this.canvas.width / W;
    }

    bindPan() {
      let drag = null;
      const c = this.canvas;
      c.addEventListener("pointerdown", (e) => {
        drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy };
        c.setPointerCapture(e.pointerId);
      });
      c.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const s = (W / c.clientWidth) / this.zoom;
        this.cx = drag.cx - (e.clientX - drag.x) * s;
        this.cy = drag.cy - (e.clientY - drag.y) * s;
        this.clampPan();
      });
      const end = () => (drag = null);
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
      c.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
        this.onZoom && this.onZoom(this.zoom);
      }, { passive: false });
    }

    clampPan() {
      const hw = W / 2 / this.zoom, hh = H / 2 / this.zoom;
      this.cx = clamp(this.cx, hw, W - hw);
      this.cy = clamp(this.cy, hh, H - hh);
    }

    setZoom(z) {
      this.zoom = clamp(z, 1, 4);
      this.clampPan();
    }

    setView(v) {
      this.view = v;
    }

    setState(st) {
      this.state = st;
    }

    /* ---------- molecules ---------- */
    initMolecules() {
      const r = rng(7);
      this.N = 130;
      this.mols = [];
      for (let i = 0; i < this.N; i++) {
        this.mols.push({
          x: r() * W, y: r() * H, vx: 0, vy: 0, a: r() * Math.PI * 2, va: 0,
          s: 0, target: 0, phase: r() * 6.28, partner: null,
        });
      }
      this.specks = Array.from({ length: 90 }, () => ({ x: r() * W, y: r() * H, r: 0.5 + r() * 1.6 }));
    }

    nearestBad(p) {
      let best = null, bd = Infinity;
      for (const q of this.mols) {
        if (q === p || q.target !== 1 || q.s < 0.6) continue;
        const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bd) { bd = d; best = q; }
      }
      return best ? { q: best, d: Math.sqrt(bd) } : null;
    }

    updateMolecules(dt) {
      const want = Math.round(clamp(this.state.frac) * this.N);
      let bad = this.mols.filter((m) => m.target === 1);
      const jump = Math.abs(want - bad.length) > 12;
      let budget = jump ? 999 : 2;
      while (bad.length < want && budget-- > 0) {
        const normals = this.mols.filter((m) => m.target === 0);
        let pick = normals[Math.floor(Math.random() * normals.length)];
        let partner = null;
        if (bad.length) {
          // templating: the healthy protein closest to an existing misfolded one converts next
          let bd = Infinity;
          for (const n of normals) for (const b of bad) {
            const d = (n.x - b.x) ** 2 + (n.y - b.y) ** 2;
            if (d < bd) { bd = d; pick = n; partner = b; }
          }
        }
        pick.target = 1;
        pick.partner = partner;
        if (jump) pick.s = 1;
        bad.push(pick);
      }
      while (bad.length > want) {
        const p = bad.pop();
        p.target = 0; p.s = 0; p.partner = null;
      }

      const sp = this.reduced ? 0.2 : 1;
      for (const p of this.mols) {
        if (p.target === 0) {
          p.vx += (Math.random() - 0.5) * 40 * dt * sp;
          p.vy += (Math.random() - 0.5) * 40 * dt * sp;
          p.va += (Math.random() - 0.5) * 2 * dt * sp;
        } else if (p.s < 1) {
          // being recruited: drift to the template, then refold
          if (p.partner) {
            const dx = p.partner.x - p.x, dy = p.partner.y - p.y, d = Math.hypot(dx, dy);
            if (d > 26) { p.vx += (dx / d) * 120 * dt; p.vy += (dy / d) * 120 * dt; }
            else p.s = Math.min(1, p.s + dt / 1.1);
          } else p.s = Math.min(1, p.s + dt / 1.4);
        } else {
          // misfolded: sticky, slow, line up with neighbours into aggregates
          const nb = this.nearestBad(p);
          if (nb && nb.d < 220) {
            const dx = nb.q.x - p.x, dy = nb.q.y - p.y, d = nb.d || 1;
            const f = d > 18 ? 40 : -60;
            p.vx += (dx / d) * f * dt;
            p.vy += (dy / d) * f * dt;
            let da = (nb.q.a - p.a) % Math.PI;
            p.a += da * dt * 1.5;
          }
          p.vx += (Math.random() - 0.5) * 6 * dt;
          p.vy += (Math.random() - 0.5) * 6 * dt;
        }
        const damp = p.target === 1 && p.s >= 1 ? 0.9 : 0.96;
        p.vx *= damp; p.vy *= damp; p.va *= 0.95;
        p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
        if (p.x < -20) p.x += W + 40; if (p.x > W + 20) p.x -= W + 40;
        if (p.y < -20) p.y += H + 40; if (p.y > H + 20) p.y -= H + 40;
        p.phase += dt * 2;
      }
    }

    drawMolecules(ctx) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
      g.addColorStop(0, "#132033");
      g.addColorStop(1, "#070b12");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(160,190,230,0.12)";
      for (const s of this.specks) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill(); }
      const lw = 2.6 / Math.sqrt(this.zoom);
      for (const p of this.mols) if (p.target === 0) drawProtein(ctx, p.x, p.y, p.a, p.s, 30, p.phase, lw, false);
      for (const p of this.mols) if (p.target === 1) drawProtein(ctx, p.x, p.y, p.a, p.s, 30, p.phase, lw, true);
    }

    /* ---------- tissue ---------- */
    initTissue() {
      const r = rng(42);
      this.tex = Array.from({ length: 260 }, () => ({ x: r() * W, y: r() * H, r: 10 + r() * 40, a: 0.03 + r() * 0.05, d: r() > 0.5 }));
      this.glia = Array.from({ length: 170 }, () => ({ x: r() * W, y: r() * H, r: 2 + r() * 2.2 }));
      this.neurons = Array.from({ length: 20 }, () => {
        const x = 30 + r() * (W - 60), y = 30 + r() * (H - 60);
        const dend = [];
        const nd = 3 + Math.floor(r() * 3);
        for (let i = 0; i < nd; i++) {
          let a = r() * 6.28, px = x, py = y;
          const seg = [[px, py]];
          for (let j = 0; j < 6; j++) { a += (r() - 0.5) * 0.7; px += Math.cos(a) * 12; py += Math.sin(a) * 12; seg.push([px, py]); }
          dend.push(seg);
        }
        return { x, y, rot: r() * 6.28, size: 9 + r() * 5, dend };
      });
      this.vacuoles = Array.from({ length: 170 }, () => ({ x: r() * W, y: r() * H, r: 2.5 + r() ** 2 * 12 }));
      this.plaques = Array.from({ length: 30 }, () => {
        const x = 40 + r() * (W - 80), y = 40 + r() * (H - 80);
        return { x, y, r: 7 + r() * 6, petals: Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * 6.28 + r() * 0.4, r: 4 + r() * 4 })) };
      });
      this.granules = Array.from({ length: 600 }, () => ({ x: r() * W, y: r() * H, r: 0.6 + r() * 1.4 }));
    }

    drawTissue(ctx) {
      const { frac, health } = this.state;
      ctx.fillStyle = "#f1c3d2";
      ctx.fillRect(0, 0, W, H);
      for (const t of this.tex) {
        ctx.fillStyle = t.d ? `rgba(196,92,140,${t.a})` : `rgba(255,236,244,${t.a * 1.4})`;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.28); ctx.fill();
      }
      // neurons: lost as health drops; the next ones in line look shrunken and dark ("red neurons")
      const alive = health * this.neurons.length;
      this.neurons.forEach((n, i) => {
        if (i >= alive + 2) return;
        const dying = i >= alive ? 1 : i >= alive - 2 ? 0.5 : 0;
        ctx.strokeStyle = `rgba(150,60,130,${0.55 - dying * 0.3})`;
        ctx.lineWidth = 2;
        n.dend.forEach((seg) => {
          ctx.beginPath();
          seg.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        });
        const sz = n.size * (1 - dying * 0.35);
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.rot);
        ctx.fillStyle = dying ? "#c0306a" : "#c77bb0";
        ctx.beginPath();
        ctx.moveTo(0, -sz * 1.3); ctx.quadraticCurveTo(sz, 0, sz * 0.7, sz * 0.9);
        ctx.quadraticCurveTo(0, sz * 1.2, -sz * 0.7, sz * 0.9); ctx.quadraticCurveTo(-sz, 0, 0, -sz * 1.3);
        ctx.fill();
        ctx.fillStyle = dying ? "#4a1240" : "#5b2a86";
        ctx.beginPath(); ctx.arc(0, sz * 0.2, sz * 0.38, 0, 6.28); ctx.fill();
        ctx.restore();
      });
      ctx.fillStyle = "#4b2a7a";
      for (const g of this.glia) { ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.28); ctx.fill(); }

      // PrP immunostain: brown granular deposits
      const nGran = Math.floor(Math.min(1, frac * 1.5) * this.granules.length);
      ctx.fillStyle = "rgba(120,72,24,0.75)";
      for (let i = 0; i < nGran; i++) { const g = this.granules[i]; ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.28); ctx.fill(); }

      // spongiform change: vacuoles
      const vac = clamp(frac * 0.8 + (1 - health) * 0.9);
      const nVac = Math.floor(vac * this.vacuoles.length);
      for (let i = 0; i < nVac; i++) {
        const v = this.vacuoles[i];
        ctx.fillStyle = "#fff8fb";
        ctx.strokeStyle = "rgba(190,110,150,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r, 0, 6.28); ctx.fill(); ctx.stroke();
      }
      // florid plaques: dense core with a halo of vacuoles (the hallmark of vCJD)
      const nPl = Math.floor(clamp((frac - 0.02) * 1.4) * this.plaques.length);
      for (let i = 0; i < nPl; i++) {
        const p = this.plaques[i];
        for (const pe of p.petals) {
          ctx.fillStyle = "#fff8fb"; ctx.strokeStyle = "rgba(190,110,150,0.6)";
          ctx.beginPath(); ctx.arc(p.x + Math.cos(pe.a) * p.r * 1.7, p.y + Math.sin(pe.a) * p.r * 1.7, pe.r, 0, 6.28); ctx.fill(); ctx.stroke();
        }
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.r);
        g.addColorStop(0, "#8a1f45"); g.addColorStop(0.6, "#c8507a"); g.addColorStop(1, "rgba(220,120,160,0.2)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
        ctx.strokeStyle = "rgba(120,30,70,0.6)";
        ctx.lineWidth = 0.8;
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * 6.28;
          ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * p.r * 0.4, p.y + Math.sin(a) * p.r * 0.4);
          ctx.lineTo(p.x + Math.cos(a) * p.r * 1.15, p.y + Math.sin(a) * p.r * 1.15); ctx.stroke();
        }
      }
      if (!this.state.brain) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, H - 34, W, 34);
        ctx.fillStyle = "#fff";
        ctx.font = "13px Inter, sans-serif";
        ctx.fillText("Tissue view shows brain tissue. Pick a brain region on the body map.", 14, H - 13);
      }
    }

    /* ---------- single protein ---------- */
    drawProteinView(ctx, dt) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#0f1a2b"); g.addColorStop(1, "#080c14");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const cycle = 7;
      this.proteinT += this.reduced ? dt * 0.4 : dt;
      if (this.proteinT > cycle) {
        this.proteinT = 0;
        this.fibril = this.fibril >= 11 ? 5 : this.fibril + 1;
      }
      const t = this.proteinT;
      const fx = 520, gap = 26, L = 120;
      const top = H - 66 - this.fibril * gap;

      // cross-β fibril: stacked β zig-zags
      for (let i = 0; i < this.fibril; i++) {
        drawProtein(ctx, fx, H - 66 - i * gap, 0, 1, L, 0, 4, true);
      }
      // incoming PrP^C: drift, dock, refold, join
      const approach = clamp(t / 3);
      const ease = 1 - (1 - approach) ** 3;
      const morph = clamp((t - 3.2) / 2.2);
      const x = lerp(150, fx, ease);
      const y = lerp(170, top, ease);
      const ang = lerp(-0.5, 0, ease);
      drawProtein(ctx, x, y, ang, morph, L, t * 1.5, 4, true);

      ctx.font = "600 14px Inter, sans-serif";
      ctx.fillStyle = "#e9eef6";
      ctx.fillText(morph < 0.5 ? "PrPᶜ  (normal)" : "PrPˢᶜ  (misfolded)", x - 60, y - 74);
      ctx.font = "12px Inter, sans-serif";
      ctx.fillStyle = "#9fb0c8";
      ctx.fillText(morph < 0.5 ? "3 α-helices · 42% helix, 3% sheet" : "β-sheets · 30% helix, 43% sheet", x - 60, y - 56);
      ctx.fillStyle = "#9fb0c8";
      ctx.fillText("cross-β fibril (template)", fx - 70, H - 14);

      let caption = "1. A healthy prion protein drifts by";
      if (t > 2.6) caption = "2. It touches the misfolded fibril";
      if (t > 3.3) caption = "3. The fibril forces it to refold: helices → sheets";
      if (t > 5.4) caption = "4. Now it's part of the template, ready to convert the next one";
      ctx.font = "600 15px Inter, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(caption, 20, 32);
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const z = this.zoom * this.k;
      ctx.setTransform(z, 0, 0, z, this.canvas.width / 2 - this.cx * z, this.canvas.height / 2 - this.cy * z);
      this.updateMolecules(dt);
      if (this.view === "molecules") this.drawMolecules(ctx);
      else if (this.view === "tissue") this.drawTissue(ctx);
      else this.drawProteinView(ctx, dt);
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  window.Microscope = Microscope;
})();
