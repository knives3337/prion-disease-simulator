/* Tiny dependency-free SVG charts with hover tooltips. Re-render on resize. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const tip = () => document.getElementById("tooltip");

  function el(name, attrs, parent, style) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (style) e.setAttribute("style", style);
    if (parent) parent.appendChild(e);
    return e;
  }

  function showTip(html, x, y) {
    const t = tip();
    t.innerHTML = html;
    t.classList.add("show");
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    t.style.left = Math.max(8, left) + "px";
    t.style.top = Math.max(8, top) + "px";
  }
  function hideTip() { tip().classList.remove("show"); }

  function fmtPct(v) {
    if (v <= 0) return "0%";
    const p = v * 100;
    if (p >= 1) return p.toFixed(p >= 10 ? 0 : 1) + "%";
    if (p >= 0.001) return p.toPrecision(2) + "%";
    return "1 in " + fmtNum(Math.round(1 / v));
  }
  function fmtNum(n) {
    if (n >= 1e9) return +(n / 1e9).toPrecision(3) + "B";
    if (n >= 1e6) return +(n / 1e6).toPrecision(3) + "M";
    if (n >= 1e3) return +(n / 1e3).toPrecision(3) + "k";
    return String(n);
  }
  function fmtTime(m) {
    const y = Math.floor(m / 12), mo = m % 12;
    return y ? `Year ${y}, month ${mo}` : `Month ${mo}`;
  }

  function onResize(container, render) {
    let w = 0;
    new ResizeObserver(() => {
      const nw = container.clientWidth;
      if (nw && nw !== w) { w = nw; render(); }
    }).observe(container);
  }

  /* ---------- time-series line chart (log or linear) ---------- */
  function TimeChart(container, opts) {
    this.c = container;
    this.o = Object.assign({ height: 260, log: true, yMin: 1e-9, yMax: 1, legend: true }, opts);
    this.data = null;
    this.cursor = 0;
    onResize(container, () => this.render());
  }
  TimeChart.prototype.setData = function (points, series, months) {
    this.points = points;
    this.series = series;
    this.months = months;
    this.render();
  };
  TimeChart.prototype.y = function (v) {
    const o = this.o, h = this.ih;
    if (o.log) {
      const lv = Math.log10(Math.max(v, o.yMin));
      return h - ((lv - Math.log10(o.yMin)) / (Math.log10(o.yMax) - Math.log10(o.yMin))) * h;
    }
    return h - ((v - o.yMin) / (o.yMax - o.yMin)) * h;
  };
  TimeChart.prototype.render = function () {
    const c = this.c, o = this.o;
    c.innerHTML = "";
    if (!this.points) return;
    const W = c.clientWidth || 600;
    const m = { l: 52, r: 12, t: 8, b: 26 };
    const iw = W - m.l - m.r, ih = o.height - m.t - m.b;
    this.iw = iw; this.ih = ih;
    const svg = el("svg", { viewBox: `0 0 ${W} ${o.height}`, width: W, height: o.height }, c);
    const g = el("g", { transform: `translate(${m.l},${m.t})` }, svg);
    const x = (t) => (t / this.months) * iw;
    this.x = x;

    // grid
    const e0 = Math.round(Math.log10(o.yMin)), e1 = Math.round(Math.log10(o.yMax));
    const exps = o.log ? Array.from({ length: e1 - e0 + 1 }, (_, i) => e0 + i) : [];
    const ticks = o.log ? exps.map((e) => 10 ** e) : [0, 0.25, 0.5, 0.75, 1];
    const step = o.log && ih < 200 ? 2 : 1;
    ticks.forEach((v, i) => {
      const yy = this.y(v);
      el("line", { x1: 0, x2: iw, y1: yy, y2: yy, class: "gridline" }, g);
      if (!o.log || (exps.length - 1 - i) % step === 0) {
        const e = exps[i] + 2;
        const lab = o.log ? (e >= 0 ? 10 ** e + "%" : "10" + sup(e) + "%") : v * 100 + "%";
        el("text", { x: -8, y: yy + 4, "text-anchor": "end" }, g).textContent = lab;
      }
    });
    const years = this.months / 12;
    const ystep = years > 30 ? 10 : years > 12 ? 5 : years > 5 ? 2 : 1;
    for (let yr = 0; yr <= years; yr += ystep) {
      el("text", { x: x(yr * 12), y: ih + 18, "text-anchor": "middle" }, g).textContent = yr + (yr === 0 ? "" : "y");
    }
    el("line", { x1: 0, x2: iw, y1: ih, y2: ih, class: "axis" }, g);

    // lines
    this.paths = this.series.map((s) =>
      el("path", { fill: "none", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, g, `stroke:var(${s.color})`)
    );
    this.cursorLine = el("line", { y1: 0, y2: ih, class: "cursor" }, g);
    this.dots = this.series.map((s) => el("circle", { r: 4, "stroke-width": 2 }, g, `fill:var(${s.color});stroke:var(--surface)`));

    // hover
    const hit = el("rect", { x: 0, y: 0, width: iw, height: ih, class: "hit" }, g);
    const hoverLine = el("line", { y1: 0, y2: ih, class: "cursor", opacity: 0 }, g);
    hit.addEventListener("pointermove", (e) => {
      const r = hit.getBoundingClientRect();
      const t = Math.round(((e.clientX - r.left) / r.width) * this.months);
      const tt = Math.max(0, Math.min(Math.min(this.cursor, this.points.length - 1), t));
      const p = this.points[tt];
      hoverLine.setAttribute("x1", x(tt)); hoverLine.setAttribute("x2", x(tt)); hoverLine.setAttribute("opacity", 1);
      const rows = this.series.slice().sort((a, b) => p[b.key] - p[a.key])
        .map((s) => `<div class="row"><span><i style="background:var(${s.color})"></i>${s.label}</span><b>${fmtPct(p[s.key])}</b></div>`).join("");
      showTip(`<b>${fmtTime(tt)}</b>${rows}`, e.clientX, e.clientY);
    });
    hit.addEventListener("pointerleave", () => { hideTip(); hoverLine.setAttribute("opacity", 0); });

    if (o.legend && this.series.length > 1) {
      const lg = document.createElement("div");
      lg.className = "legend";
      lg.innerHTML = this.series.map((s) => `<span><i style="background:var(${s.color})"></i>${s.label}</span>`).join("");
      c.appendChild(lg);
    }
    this.setCursor(this.cursor);
  };
  TimeChart.prototype.setCursor = function (t) {
    this.cursor = t;
    if (!this.paths) return;
    const end = Math.min(t, this.points.length - 1);
    this.series.forEach((s, i) => {
      let d = "";
      for (let k = 0; k <= end; k++) {
        const v = this.points[k][s.key];
        if (this.o.log && v <= 0) continue;
        d += (d ? "L" : "M") + this.x(k).toFixed(1) + "," + this.y(v).toFixed(1);
      }
      this.paths[i].setAttribute("d", d);
      const v = this.points[end][s.key];
      const dot = this.dots[i];
      if (this.o.log && v <= 0) dot.setAttribute("opacity", 0);
      else { dot.setAttribute("opacity", 1); dot.setAttribute("cx", this.x(end)); dot.setAttribute("cy", this.y(v)); }
    });
    this.cursorLine.setAttribute("x1", this.x(end));
    this.cursorLine.setAttribute("x2", this.x(end));
  };
  function sup(n) {
    const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
    return String(Math.round(n)).split("").map((ch) => map[ch]).join("");
  }

  /* ---------- horizontal bars ---------- */
  function HBars(container, opts) {
    this.c = container;
    this.o = Object.assign({ log: false, max: 1, min: 0, rowH: 34, labelW: 150, format: (v) => v }, opts);
    onResize(container, () => this.render());
  }
  HBars.prototype.setData = function (rows) { this.rows = rows; this.render(); };
  HBars.prototype.render = function () {
    const c = this.c, o = this.o;
    c.innerHTML = "";
    if (!this.rows) return;
    const W = c.clientWidth || 500;
    const narrow = W < 420;
    const labelW = narrow ? Math.min(o.labelW, 110) : o.labelW;
    const valW = 56;
    const iw = Math.max(60, W - labelW - valW - 8);
    const Hh = this.rows.length * o.rowH + (o.axis ? 22 : 4);
    const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh }, c);
    const sc = (v) => o.log
      ? ((Math.log10(Math.max(v, o.min)) - Math.log10(o.min)) / (Math.log10(o.max) - Math.log10(o.min))) * iw
      : (v / o.max) * iw;
    if (o.axis) {
      o.axis.forEach((v) => {
        const xx = labelW + sc(v);
        el("line", { x1: xx, x2: xx, y1: 0, y2: this.rows.length * o.rowH, class: "gridline" }, svg);
        el("text", { x: xx, y: this.rows.length * o.rowH + 16, "text-anchor": "middle" }, svg).textContent = o.axisFormat ? o.axisFormat(v) : v;
      });
    }
    this.rows.forEach((r, i) => {
      const y = i * o.rowH;
      const bh = Math.min(20, o.rowH - 10);
      const by = y + (o.rowH - bh) / 2;
      const lab = el("text", { x: labelW - 10, y: y + o.rowH / 2 + 4, "text-anchor": "end", class: "lbl" }, svg);
      lab.textContent = narrow && r.short ? r.short : r.label;
      const w = Math.max(2, sc(r.value));
      el("path", { d: roundRight(labelW, by, w, bh, 4) }, svg, `fill:var(${r.color || "--normal"})`);
      el("text", { x: labelW + w + 6, y: y + o.rowH / 2 + 4, class: "val" }, svg).textContent = o.format(r.value);
      const hit = el("rect", { x: 0, y, width: W, height: o.rowH, class: "hit" }, svg);
      hit.addEventListener("pointermove", (e) => showTip(r.tip || `<b>${r.label}</b><div>${o.format(r.value)}</div>`, e.clientX, e.clientY));
      hit.addEventListener("pointerleave", hideTip);
    });
  };
  function roundRight(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  function roundTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /* ---------- vertical columns (single or grouped) ---------- */
  function Columns(container, opts) {
    this.c = container;
    this.o = Object.assign({ height: 220, max: 1, series: [{ key: "value", color: "--normal", label: "" }], format: (v) => v, labelEvery: 1, valueLabels: false }, opts);
    onResize(container, () => this.render());
  }
  Columns.prototype.setData = function (rows) { this.rows = rows; this.render(); };
  Columns.prototype.render = function () {
    const c = this.c, o = this.o;
    c.innerHTML = "";
    if (!this.rows) return;
    const W = c.clientWidth || 500;
    const m = { l: 34, r: 6, t: 16, b: 24 };
    const iw = W - m.l - m.r, ih = o.height - m.t - m.b;
    const svg = el("svg", { viewBox: `0 0 ${W} ${o.height}`, width: W, height: o.height }, c);
    const g = el("g", { transform: `translate(${m.l},${m.t})` }, svg);
    o.ticks.forEach((v) => {
      const yy = ih - (v / o.max) * ih;
      el("line", { x1: 0, x2: iw, y1: yy, y2: yy, class: "gridline" }, g);
      el("text", { x: -6, y: yy + 4, "text-anchor": "end" }, g).textContent = o.format(v);
    });
    const band = iw / this.rows.length;
    const ns = o.series.length;
    const groupW = band * (ns > 1 ? 0.7 : 0.72);
    const bw = (groupW - (ns - 1) * 2) / ns;
    const every = W < 480 ? o.labelEvery * 2 : o.labelEvery;
    this.rows.forEach((r, i) => {
      const gx = i * band + (band - groupW) / 2;
      o.series.forEach((s, j) => {
        const v = r[s.key];
        const h = (v / o.max) * ih;
        const x = gx + j * (bw + 2);
        if (h > 0) el("path", { d: roundTop(x, ih - h, bw, h, 4) }, g, `fill:var(${s.color})`);
        if (o.valueLabels) el("text", { x: x + bw / 2, y: ih - h - 5, "text-anchor": "middle", class: "val" }, g).textContent = o.format(v);
      });
      if (i % every === 0) el("text", { x: i * band + band / 2, y: ih + 16, "text-anchor": "middle", class: ns > 1 ? "lbl" : "" }, g).textContent = r.label;
      const hit = el("rect", { x: i * band, y: 0, width: band, height: ih, class: "hit" }, g);
      hit.addEventListener("pointermove", (e) => {
        const rows = o.series.map((s) => `<div class="row"><span>${s.label ? `<i style="background:var(${s.color})"></i>${s.label}` : ""}</span><b>${o.format(r[s.key])}</b></div>`).join("");
        showTip(`<b>${r.label}</b>${rows}`, e.clientX, e.clientY);
      });
      hit.addEventListener("pointerleave", hideTip);
    });
    el("line", { x1: 0, x2: iw, y1: ih, y2: ih, class: "axis" }, g);
    if (ns > 1) {
      const lg = document.createElement("div");
      lg.className = "legend";
      lg.innerHTML = o.series.map((s) => `<span><i style="background:var(${s.color})"></i>${s.label}</span>`).join("");
      c.appendChild(lg);
    }
  };

  window.Charts = { TimeChart, HBars, Columns, fmtPct, fmtNum, fmtTime, showTip, hideTip };
})();
