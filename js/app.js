(function () {
  const D = window.PrionData, M = window.PrionModel, Ch = window.Charts;
  const $ = (id) => document.getElementById(id);
  const BRAIN = ["brainstem", "thalamus", "cerebellum", "cortex"];
  const ORDER = ["gut", "lymph", "nerve", "brainstem", "thalamus", "cerebellum", "cortex"];

  const state = {
    food: D.foods.find((f) => f.id === "bse_burger"),
    genotype: "MM",
    meals: 1,
    sim: null,
    months: 240,
    t: 0,
    playing: false,
    region: "thalamus",
    view: "molecules",
  };

  /* ---------- meal picker ---------- */
  const riskLabel = { safe: "No prions", low: "Low dose", high: "High risk", barrier: "Species barrier" };
  const foodsEl = $("foods");
  D.foods.forEach((f) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "food";
    b.setAttribute("role", "radio");
    b.dataset.id = f.id;
    b.innerHTML = `<span class="emoji" aria-hidden="true">${f.emoji}</span><span class="fname">${f.name}</span><span class="tag ${f.risk}">${riskLabel[f.risk]}</span>`;
    b.addEventListener("click", () => selectFood(f));
    foodsEl.appendChild(b);
  });
  function selectFood(f) {
    state.food = f;
    foodsEl.querySelectorAll(".food").forEach((b) => b.setAttribute("aria-checked", b.dataset.id === f.id));
    $("foodNote").textContent = f.note + (f.dose > 0 ? " Cooking won't help: prions survive normal cooking temperatures." : "");
  }
  $("meals").addEventListener("input", (e) => ($("mealsOut").textContent = (state.meals = +e.target.value)));
  $("genotype").addEventListener("change", (e) => (state.genotype = e.target.value));
  $("eat").addEventListener("click", () => {
    run();
    setPlaying(true);
    $("sim").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.querySelectorAll("[data-tip]").forEach((b) => {
    const show = (e) => { const r = b.getBoundingClientRect(); Ch.showTip(b.dataset.tip, e.clientX || r.right, e.clientY || r.bottom); };
    b.addEventListener("pointerenter", show);
    b.addEventListener("focus", show);
    b.addEventListener("pointerleave", Ch.hideTip);
    b.addEventListener("blur", Ch.hideTip);
  });

  /* ---------- simulation ---------- */
  const regionChart = new Ch.TimeChart($("regionChart"), { height: 270, log: true, yMin: 1e-9, yMax: 1 });
  const healthChart = new Ch.TimeChart($("healthChart"), { height: 120, log: false, yMin: 0, yMax: 1, legend: false });
  const series = ORDER.map((k) => ({ key: k, label: D.regions[k].short, color: D.regions[k].color }));

  function run() {
    const sim = M.simulate(state.food, state.genotype, state.meals);
    // how long to show: through death, or until the body clears the prions, or 20 years
    let months = 240;
    if (sim.death != null) months = sim.death + 4;
    else if (state.food.dose > 0) {
      const cleared = M.clearedAt(sim.points);
      months = cleared > 0 ? Math.max(60, Math.min(480, cleared + 24)) : 360;
    }
    while (sim.points.length <= months) {
      const last = sim.points[sim.points.length - 1];
      sim.points.push(Object.assign({}, last, { t: sim.points.length }));
    }
    sim.cleared = sim.death == null && state.food.dose > 0 ? M.clearedAt(sim.points) : -1;
    state.sim = sim;
    state.months = months;
    state.t = 0;
    $("scrub").max = months;
    regionChart.setData(sim.points, series, months);
    healthChart.setData(sim.points, [{ key: "health", label: "Healthy neurons", color: "--text" }], months);
    updateRegionBars();
    render();
  }

  function setPlaying(p) {
    state.playing = p;
    $("play").textContent = p ? "❚❚" : "▶";
    $("play").setAttribute("aria-label", p ? "Pause" : "Play");
  }
  $("play").addEventListener("click", () => {
    if (!state.sim) run();
    if (state.t >= state.months) state.t = 0;
    setPlaying(!state.playing);
  });
  $("scrub").addEventListener("input", (e) => { state.t = +e.target.value; setPlaying(false); render(); });

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.playing && state.sim) {
      state.t = Math.min(state.months, state.t + dt * +$("speed").value);
      if (state.t >= state.months) setPlaying(false);
      render();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- views ---------- */
  const scope = new window.Microscope($("scope"));
  scope.onZoom = (z) => ($("zoom").value = z);
  $("zoom").addEventListener("input", (e) => scope.setZoom(+e.target.value));
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      state.view = tab.dataset.view;
      scope.setView(state.view);
      render();
    })
  );
  const body = new window.BodyMap($("body"), (key) => { state.region = key; body.select(key); render(); });
  body.select(state.region);

  function point() {
    return state.sim ? state.sim.points[Math.floor(state.t)] : { health: 1, brain: 0, gut: 0, lymph: 0, nerve: 0, brainstem: 0, thalamus: 0, cerebellum: 0, cortex: 0 };
  }

  function render() {
    const p = point();
    const t = Math.floor(state.t);
    $("scrub").value = t;
    $("clock").textContent = state.sim ? Ch.fmtTime(t) + " after eating" : "Not started";
    $("statBrain").textContent = Ch.fmtPct(p.brain);
    $("statHealth").textContent = Math.round(p.health * 100) + "%";
    const st = story(p, t);
    $("statStage").textContent = st.stage;
    $("story").innerHTML = `<h3>${st.title}</h3><p>${st.text}</p>` +
      (st.symptoms ? `<div class="symptoms">${st.symptoms.map((s) => `<span>${s}</span>`).join("")}</div>` : "");

    body.update(p);
    regionChart.setCursor(t);
    healthChart.setCursor(t);

    const frac = p[state.region];
    const isBrain = BRAIN.includes(state.region);
    const tissueFrac = isBrain ? frac : p.thalamus;
    scope.setState({ frac: state.view === "tissue" ? tissueFrac : frac, health: p.health, brain: isBrain });
    $("scopeRegion").textContent = D.regions[state.region].name;
    const visible = Math.round(frac * 130);
    let info = frac > 0 ? `${Ch.fmtPct(frac)} of PrP misfolded` : "All PrP folded normally";
    if (state.view === "molecules" && frac > 0 && visible === 0) info += " · too rare to see in this field yet";
    if (state.view === "protein") info = "Templated misfolding, close up";
    $("scopeInfo").textContent = info;
  }

  function story(p, t) {
    const f = state.food, sim = state.sim;
    if (!sim) return { stage: "Healthy", title: "Pick a meal to begin", text: "" };
    if (f.dose === 0) {
      return { stage: "Healthy", title: "Nothing to misfold",
        text: "Your prion protein (PrPᶜ) stays folded the normal way, sitting on the surface of neurons where it's thought to help with signalling and protect against stress. You can watch for decades and nothing will change." };
    }
    if (sim.cleared > 0 && t >= sim.cleared) {
      return { stage: "Cleared", title: "Your body cleared it",
        text: f.barrier < 0.1
          ? "The species barrier held. This animal's prion couldn't template human PrP well enough, so your immune system broke the misfolded protein down before it could multiply."
          : "The dose was too small to start a chain reaction. Below a threshold, misfolded protein gets broken down faster than it can recruit new copies. Try more meals." };
    }
    if (sim.death != null && t >= sim.death) {
      return { stage: "Fatal", title: "The disease has run its course",
        text: `Prion disease is always fatal and there's still no cure. In this simulation it took ${(sim.onset / 12).toFixed(1)} years from the meal to the first symptoms, then ${sim.death - sim.onset} months of illness. Real vCJD has a median illness of about 14 months.` };
    }
    const h = p.health;
    if (h < 0.25) return { stage: "Late", title: "Final stage", text: "Most neurons in the affected regions are gone and the brain is visibly spongy. The person can no longer move or speak (akinetic mutism).", symptoms: ["Akinetic mutism", "Unable to swallow", "Bedridden"] };
    if (h < 0.5) return { stage: "Advanced", title: "Rapid decline", text: "Plaques fill the cortex. Dementia worsens week by week.", symptoms: ["Severe dementia", "Myoclonus (jerks)", "Can't walk", "Blindness"] };
    if (h < 0.8) return { stage: "Neurological", title: "Movement and memory", text: "The cerebellum and thalamus are failing. In vCJD, neurological signs usually appear about six months after the first psychiatric symptoms.", symptoms: ["Ataxia (unsteady walking)", "Involuntary movements", "Memory loss", "Slurred speech"] };
    if (h < 0.95) return { stage: "Early symptoms", title: "Something feels wrong", text: "vCJD usually starts with psychiatric changes, often mistaken for depression. MRI may show the bright 'pulvinar sign' in the thalamus.", symptoms: ["Depression", "Anxiety", "Withdrawal", "Painful legs & feet"] };

    const brainOn = BRAIN.some((k) => p[k] > 1e-7);
    if (t < 4) return { stage: "Exposure", title: "Crossing the gut wall", text: "The misfolded protein survives stomach acid and digestion. M-cells in the Peyer's patches of the small intestine carry it across the gut wall to immune cells." };
    if (!brainOn) return { stage: "Silent", title: "Silent spread: no symptoms", text: "Immune cells in the tonsils, spleen and appendix have become prion factories. Prions are also creeping up the vagus nerve. You feel completely normal, and no routine test can tell." };
    return { stage: "Silent", title: "Inside the brain: still no symptoms", text: "Prions entered at the brainstem and are spreading to the thalamus, cerebellum and cortex. The amount doubles every few months, but neurons keep coping until the load crosses a toxic threshold." };
  }

  /* ---------- graphs section ---------- */
  const proteinChart = new Ch.HBars($("proteinChart"), {
    log: true, min: 1e3, max: 1e8, rowH: 36, labelW: 170,
    format: (v) => "~" + Ch.fmtNum(v), axis: [1e3, 1e4, 1e5, 1e6, 1e7, 1e8], axisFormat: Ch.fmtNum,
  });
  proteinChart.setData(D.proteins.map((r) => ({
    label: r.protein, short: r.protein.replace("Prion protein (PrP)", "PrP").replace("α-Synuclein", "α-Syn"), value: r.value,
    color: r.highlight ? "--bad" : "--normal",
    tip: `<b>${r.protein}</b><div>${r.disease}</div><div class="row"><span>~${Ch.fmtNum(r.value)}</span></div><div class="muted">${r.note}</div>`,
  })));

  const regionBars = new Ch.HBars($("regionBars"), { max: 1, rowH: 30, labelW: 92, format: Ch.fmtPct });
  function updateRegionBars() {
    const end = state.sim.points[state.months];
    const peak = {};
    ORDER.forEach((k) => (peak[k] = Math.max(...state.sim.points.slice(0, state.months + 1).map((p) => p[k]))));
    const rows = ORDER.map((k) => ({ label: D.regions[k].short, value: end[k] > 0 ? end[k] : 0, color: "--bad",
      tip: `<b>${D.regions[k].name}</b><div class="row"><span>at the end</span><b>${Ch.fmtPct(end[k])}</b></div><div class="row"><span>peak</span><b>${Ch.fmtPct(peak[k])}</b></div><div class="muted">${D.regions[k].about}</div>` }))
      .sort((a, b) => b.value - a.value);
    regionBars.setData(rows);
  }

  new Ch.Columns($("structChart"), {
    height: 230, max: 50, ticks: [0, 10, 20, 30, 40, 50], format: (v) => v + "%", valueLabels: true,
    series: [{ key: "alpha", label: "α-helix", color: "--s1" }, { key: "beta", label: "β-sheet", color: "--s2" }],
  }).setData(D.prpStructure.map((r) => ({ label: r.form, alpha: r.alpha, beta: r.beta })));

  new Ch.Columns($("vcjdChart"), {
    height: 220, max: 30, ticks: [0, 10, 20, 30], format: (v) => v, labelEvery: 3,
    series: [{ key: "deaths", label: "Deaths", color: "--bad" }].map((s) => Object.assign(s, { label: "" })),
  }).setData(D.vcjdUK.map(([y, d]) => ({ label: String(y), deaths: d })));

  /* ---------- init (supports links like #food=bse_brain&genotype=MV&meals=5&t=120&view=tissue&region=cortex) ---------- */
  const q = new URLSearchParams(location.hash.slice(1));
  const qf = D.foods.find((f) => f.id === q.get("food"));
  if (qf) state.food = qf;
  if (M.GENOTYPE[q.get("genotype")]) $("genotype").value = state.genotype = q.get("genotype");
  if (q.get("meals")) { state.meals = Math.max(1, Math.min(100, +q.get("meals") || 1)); $("meals").value = state.meals; $("mealsOut").textContent = state.meals; }
  if (D.regions[q.get("region")]) { state.region = q.get("region"); body.select(state.region); }
  selectFood(state.food);
  run();
  if (q.get("view")) document.querySelector(`.tab[data-view="${q.get("view")}"]`)?.click();
  if (q.get("t")) { state.t = Math.max(0, Math.min(state.months, +q.get("t") || 0)); render(); }
})();
