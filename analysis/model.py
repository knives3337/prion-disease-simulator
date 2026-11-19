"""
Prion spread model (Python port of js/simulation.js).

A deliberately simplified, *educational* compartment model of how misfolded
prion protein (PrP^Sc) can travel from the gut to the brain after eating
contaminated food, and how it converts the body's own normal prion protein
(PrP^C) along the way.

Each compartment i holds S_i = fraction of local PrP that is misfolded (0..1).

    dS_i/dt = m * r_i * S_i * (1 - S_i) * S_i / (S_i + Kn)   # templated conversion
            + sum_j k_ji * (m/M_REF) * S_j * (1 - S_i)       # seeds arriving from upstream
            - c_i * S_i                                      # clearance by the body

    m = species-barrier factor * PRNP codon-129 genotype factor

The S/(S+Kn) term is a crude "nucleation" effect: very small amounts of
misfolded protein are cleared before they can establish a self-propagating
template, so tiny doses (or a strong species barrier) can fizzle out.

Neuron health H falls once the average brain load passes a toxic threshold:

    dH/dt = -kd * max(0, S_brain - theta) * H

Time unit: months. Numbers are tuned so that a typical vCJD scenario gives
an incubation of roughly a decade and an illness lasting ~1-1.5 years,
matching the published ranges. They are NOT measured rate constants.
"""

COMPARTMENTS = ["gut", "lymph", "nerve", "brainstem", "thalamus", "cerebellum", "cortex"]

# local templated-conversion rate per month
R = {"gut": 0.1375, "lymph": 0.1925, "nerve": 0.088, "brainstem": 0.165,
     "thalamus": 0.187, "cerebellum": 0.154, "cortex": 0.165}
# clearance per month
C = {"gut": 0.11, "lymph": 0.044, "nerve": 0.0165, "brainstem": 0.0066,
     "thalamus": 0.0066, "cerebellum": 0.0066, "cortex": 0.0066}
# route the misfolded protein takes: (from, to, transfer rate per month)
LINKS = [("gut", "lymph", 0.0275), ("gut", "nerve", 0.0055), ("lymph", "nerve", 0.011),
         ("nerve", "brainstem", 0.011), ("brainstem", "thalamus", 0.0165),
         ("brainstem", "cerebellum", 0.011), ("thalamus", "cortex", 0.0165),
         ("cerebellum", "cortex", 0.0055)]
BRAIN_WEIGHTS = {"brainstem": 0.2, "thalamus": 0.3, "cerebellum": 0.2, "cortex": 0.3}

M_REF = 0.75   # BSE->human barrier with MM genotype: the case the constants were tuned on
CLEARED = 1e-9  # below this everywhere (and falling) we call the infection cleared
KN = 1e-7      # nucleation scale
THETA = 0.15   # toxic threshold of brain load
KD = 0.45      # neuron damage rate
EXTINCT = 1e-14

FOODS = {
    "salad":        {"label": "Garden salad",                         "dose": 0.0,  "barrier": 0.0},
    "steak":        {"label": "Steak from a healthy cow",             "dose": 0.0,  "barrier": 0.0},
    "bse_steak":    {"label": "Steak from a BSE cow (muscle)",        "dose": 2e-9, "barrier": 0.75},
    "bse_burger":   {"label": "Burger with BSE nervous tissue",       "dose": 2e-6, "barrier": 0.75},
    "bse_brain":    {"label": "Brain & spinal cord from a BSE cow",   "dose": 1e-4, "barrier": 0.75},
    "cwd_venison":  {"label": "Venison from a CWD-infected deer",     "dose": 2e-6, "barrier": 0.03},
    "scrapie_lamb": {"label": "Lamb from a scrapie-infected sheep",   "dose": 2e-6, "barrier": 0.02},
}
GENOTYPE = {"MM": 1.0, "MV": 0.82, "VV": 0.74}


def simulate(food="bse_burger", genotype="MM", meals=1, months=720, dt=0.05):
    f = FOODS[food]
    m = f["barrier"] * GENOTYPE[genotype]
    S = {k: 0.0 for k in COMPARTMENTS}
    S["gut"] = min(1.0, f["dose"] * meals)
    H = 1.0
    out = []
    steps_per_month = int(round(1 / dt))
    for month in range(months + 1):
        brain = sum(S[k] * w for k, w in BRAIN_WEIGHTS.items())
        out.append({"t": month, **dict(S), "brain": brain, "health": H})
        if H < 0.15:
            break
        for _ in range(steps_per_month):
            d = {}
            for k in COMPARTMENTS:
                s = S[k]
                d[k] = m * R[k] * s * (1 - s) * s / (s + KN) - C[k] * s
            for a, b, k in LINKS:
                # spreading needs replication in the carrying cells, so it is slowed by the barrier too
                d[b] += k * (m / M_REF) * S[a] * (1 - S[b])
            for k in COMPARTMENTS:
                v = S[k] + d[k] * dt
                S[k] = 0.0 if v < EXTINCT else min(1.0, v)
            brain = sum(S[k] * w for k, w in BRAIN_WEIGHTS.items())
            H += -KD * max(0.0, brain - THETA) * H * dt
    return out


def total(p):
    return sum(p[k] for k in COMPARTMENTS)


def milestones(traj):
    onset = next((p["t"] for p in traj if p["health"] < 0.95), None)
    death = next((p["t"] for p in traj if p["health"] < 0.15), None)
    cleared = None
    if onset is None:
        cleared = next((p["t"] for i, p in enumerate(traj) if i >= 12
                        and all(p[k] < CLEARED for k in COMPARTMENTS)
                        and total(p) <= total(traj[i - 12]) and total(traj[0]) > 0), None)
    return onset, death, cleared


if __name__ == "__main__":
    for food in FOODS:
        for g in GENOTYPE:
            tr = simulate(food, g)
            on, de, cl = milestones(tr)
            peak = max(p["brain"] for p in tr)
            fmt = lambda x: "-" if x is None else f"{x/12:.1f}y"
            dur = "-" if (on is None or de is None) else f"{de-on}mo"
            print(f"{food:13s} {g}  onset {fmt(on):>6}  death {fmt(de):>6}  illness {dur:>5}  "
                  f"cleared {fmt(cl):>6}  peak brain {peak:.1e}")
