/*
 * Prion spread model — same equations and constants as analysis/model.py.
 * Educational and simplified: tuned to published time ranges, not measured rates.
 *
 *   dS_i/dt = m * r_i * S_i (1 - S_i) * S_i/(S_i + Kn)   templated conversion
 *           + sum_j k_ji * (m/Mref) * S_j * (1 - S_i)    seeds arriving from upstream
 *           - c_i * S_i                                  clearance
 *   dH/dt   = -kd * max(0, S_brain - theta) * H          neuron loss
 */
(function () {
  const COMPARTMENTS = ["gut", "lymph", "nerve", "brainstem", "thalamus", "cerebellum", "cortex"];
  const R = { gut: 0.1375, lymph: 0.1925, nerve: 0.088, brainstem: 0.165, thalamus: 0.187, cerebellum: 0.154, cortex: 0.165 };
  const C = { gut: 0.11, lymph: 0.044, nerve: 0.0165, brainstem: 0.0066, thalamus: 0.0066, cerebellum: 0.0066, cortex: 0.0066 };
  const LINKS = [
    ["gut", "lymph", 0.0275], ["gut", "nerve", 0.0055], ["lymph", "nerve", 0.011],
    ["nerve", "brainstem", 0.011], ["brainstem", "thalamus", 0.0165],
    ["brainstem", "cerebellum", 0.011], ["thalamus", "cortex", 0.0165], ["cerebellum", "cortex", 0.0055],
  ];
  const BRAIN_WEIGHTS = { brainstem: 0.2, thalamus: 0.3, cerebellum: 0.2, cortex: 0.3 };
  const M_REF = 0.75; // BSE->human barrier with MM genotype: the case the constants were tuned on
  const CLEARED = 1e-9; // below this everywhere (and falling) = cleared
  const KN = 1e-7, THETA = 0.15, KD = 0.45, EXTINCT = 1e-14;
  const GENOTYPE = { MM: 1.0, MV: 0.82, VV: 0.74 };

  function brainLoad(S) {
    let b = 0;
    for (const k in BRAIN_WEIGHTS) b += S[k] * BRAIN_WEIGHTS[k];
    return b;
  }

  function simulate(food, genotype, meals, maxMonths = 720, dt = 0.05) {
    const m = food.barrier * GENOTYPE[genotype];
    const S = {};
    COMPARTMENTS.forEach((k) => (S[k] = 0));
    S.gut = Math.min(1, food.dose * meals);
    let H = 1;
    const out = [];
    const steps = Math.round(1 / dt);
    for (let month = 0; month <= maxMonths; month++) {
      out.push(Object.assign({ t: month, brain: brainLoad(S), health: H }, S));
      if (H < 0.15) break;
      for (let s = 0; s < steps; s++) {
        const d = {};
        for (const k of COMPARTMENTS) {
          const x = S[k];
          d[k] = m * R[k] * x * (1 - x) * (x / (x + KN)) - C[k] * x;
        }
        // spreading needs replication in the carrying cells, so the barrier slows it too
        for (const [a, b, k] of LINKS) d[b] += k * (m / M_REF) * S[a] * (1 - S[b]);
        for (const k of COMPARTMENTS) {
          const v = S[k] + d[k] * dt;
          S[k] = v < EXTINCT ? 0 : Math.min(1, v);
        }
        H += -KD * Math.max(0, brainLoad(S) - THETA) * H * dt;
      }
    }
    const onset = out.findIndex((p) => p.health < 0.95);
    const death = out.findIndex((p) => p.health < 0.15);
    return { points: out, onset: onset < 0 ? null : onset, death: death < 0 ? null : death };
  }

  const total = (p) => COMPARTMENTS.reduce((a, k) => a + p[k], 0);
  /* first month where every region is below CLEARED and the total is lower than a year earlier */
  function clearedAt(points) {
    if (!(total(points[0]) > 0)) return -1;
    for (let i = 12; i < points.length; i++) {
      if (COMPARTMENTS.every((k) => points[i][k] < CLEARED) && total(points[i]) <= total(points[i - 12])) return i;
    }
    return -1;
  }

  window.PrionModel = { COMPARTMENTS, LINKS, GENOTYPE, simulate, clearedAt };
})();
