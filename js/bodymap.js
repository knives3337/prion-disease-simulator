/* SVG body map: each region glows by how much of its PrP is misfolded (log scale, so early spread is visible). */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const STOPS = [[0, [240, 239, 235]], [0.35, [246, 196, 184]], [0.7, [227, 73, 72]], [1, [122, 16, 32]]];

  function heat(S) {
    if (!S || S <= 0) return { t: 0, color: "var(--surface-2)" };
    const t = Math.max(0.04, Math.min(1, (Math.log10(S) + 9) / 9)); // 1e-9 → 0, 1 → 1
    let i = 0;
    while (i < STOPS.length - 2 && t > STOPS[i + 1][0]) i++;
    const [t0, c0] = STOPS[i], [t1, c1] = STOPS[i + 1];
    const u = (t - t0) / (t1 - t0);
    return { t, color: `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * u)).join(",")})` };
  }

  const NODES = {
    cortex: [[130, 40, 11]],
    thalamus: [[130, 62, 9]],
    cerebellum: [[152, 82, 9]],
    brainstem: [[134, 100, 8]],
    nerve: [[122, 178, 9]],
    lymph: [[114, 126, 7], [168, 212, 9], [110, 268, 7]],
    gut: [[134, 244, 14]],
  };
  const PATHS = [
    ["gut", "lymph", "M134 244 C150 236 162 224 168 212"],
    ["gut", "lymph", "M128 252 C118 258 112 262 110 268"],
    ["gut", "nerve", "M130 232 C124 214 122 196 122 178"],
    ["lymph", "nerve", "M114 126 C110 140 118 160 122 178"],
    ["nerve", "brainstem", "M122 178 C126 150 132 124 134 100"],
    ["brainstem", "thalamus", "M134 100 C134 86 131 74 130 62"],
    ["brainstem", "cerebellum", "M134 100 C142 94 148 88 152 82"],
    ["thalamus", "cortex", "M130 62 C130 54 130 48 130 40"],
  ];

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  class BodyMap {
    constructor(svg, onSelect) {
      this.svg = svg;
      this.onSelect = onSelect;
      this.build();
    }

    build() {
      const s = this.svg;
      const body = el("g", { fill: "var(--surface-2)", stroke: "var(--border)", "stroke-width": 2 }, s);
      el("path", { d: "M82 128 Q130 112 178 128 L184 220 Q186 300 172 312 L88 312 Q74 300 76 220 Z" }, body); // torso
      el("path", { d: "M82 132 L58 230 L66 234 L92 160" }, body); // arms
      el("path", { d: "M178 132 L202 230 L194 234 L168 160" }, body);
      el("path", { d: "M92 310 L96 408 L122 408 L128 318 L132 318 L138 408 L164 408 L168 310 Z" }, body); // legs
      el("rect", { x: 117, y: 100, width: 26, height: 24, rx: 6 }, body); // neck
      el("ellipse", { cx: 130, cy: 62, rx: 46, ry: 50 }, body); // head
      // brain
      el("path", { d: "M92 64 Q90 24 130 20 Q172 22 170 64 Q168 80 150 76 Q130 84 110 78 Q94 78 92 64 Z", fill: "var(--surface)", stroke: "var(--border)", "stroke-width": 1.5 }, s);
      el("ellipse", { cx: 152, cy: 82, rx: 16, ry: 10, fill: "var(--surface)", stroke: "var(--border)", "stroke-width": 1.5 }, s);
      // intestine squiggle
      el("path", { d: "M106 228 Q120 214 134 228 T162 228 Q166 246 150 252 T118 254 Q102 262 112 276", fill: "none", stroke: "var(--border)", "stroke-width": 7, "stroke-linecap": "round" }, s);

      this.links = PATHS.map(([from, to, d]) => ({
        from, to,
        el: el("path", { d, fill: "none", stroke: "var(--accent)", "stroke-width": 2, "stroke-dasharray": "4 5", opacity: 0, class: "flow" }, s),
      }));

      this.nodes = {};
      for (const key in NODES) {
        const g = el("g", { class: "node", tabindex: 0, role: "button", "data-key": key }, s);
        const circles = NODES[key].map(([cx, cy, r]) => {
          el("circle", { cx, cy, r: r + 6, fill: "transparent" }, g); // larger hit target
          const glow = el("circle", { cx, cy, r: r + 4, fill: "var(--accent)", opacity: 0 }, g);
          const c = el("circle", { cx, cy, r, class: "ring", stroke: "var(--text-2)", "stroke-width": 1.2, fill: "var(--surface-2)" }, g);
          return { c, glow };
        });
        const title = el("title", {}, g);
        title.textContent = window.PrionData.regions[key].name;
        g.addEventListener("click", () => this.onSelect(key));
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.onSelect(key); } });
        this.nodes[key] = { g, circles };
      }
      this.dash = 0;
      const tick = () => {
        this.dash -= 0.4;
        this.links.forEach((l) => l.el.setAttribute("stroke-dashoffset", this.dash));
        requestAnimationFrame(tick);
      };
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(tick);
    }

    select(key) {
      for (const k in this.nodes) this.nodes[k].g.classList.toggle("selected", k === key);
    }

    update(point) {
      for (const k in this.nodes) {
        const h = heat(point[k]);
        this.nodes[k].circles.forEach(({ c, glow }) => {
          c.setAttribute("fill", h.color);
          glow.setAttribute("opacity", (h.t * 0.35).toFixed(3));
        });
      }
      this.links.forEach((l) => {
        const on = point[l.from] > 1e-9;
        l.el.setAttribute("opacity", on ? Math.min(0.9, 0.25 + heat(point[l.from]).t * 0.7).toFixed(2) : 0);
      });
    }
  }

  window.BodyMap = BodyMap;
})();
