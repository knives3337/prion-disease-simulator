"""
Generate the static graphs in /graphs from the CSVs in /data and the model.

    python3 analysis/make_graphs.py

Requires matplotlib.
"""
import csv
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import model  # noqa: E402

DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "graphs")
os.makedirs(OUT, exist_ok=True)

# palette (categorical slots, fixed order)
BLUE, ORANGE, AQUA, YELLOW, MAGENTA, GREEN, VIOLET, RED = (
    "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948")
INK, INK2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": GRID, "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2,
    "text.color": INK, "font.size": 11, "axes.titlesize": 14, "axes.titleweight": "bold",
    "axes.titlelocation": "left", "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
})


def read(name):
    with open(os.path.join(DATA, name), newline="") as f:
        return list(csv.DictReader(f))


def human(n):
    if n >= 1e6:
        return f"{n/1e6:g}M"
    if n >= 1e3:
        return f"{n/1e3:g}k"
    return f"{n:g}"


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, name), dpi=150)
    plt.close(fig)
    print("wrote graphs/" + name)


# 1. Which proteins misfold the most (people affected, log scale)
rows = sorted(read("misfolding_proteins.csv"), key=lambda r: float(r["approx_people_affected"]))
fig, ax = plt.subplots(figsize=(10, 5.2))
names = [r["protein"] for r in rows]
vals = [float(r["approx_people_affected"]) for r in rows]
colors = [RED if "PrP" in n else BLUE for n in names]
bars = ax.barh(names, vals, color=colors, height=0.62)
ax.set_xscale("log")
ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: human(v)))
ax.grid(axis="y", visible=False)
for b, v in zip(bars, vals):
    ax.text(v * 1.12, b.get_y() + b.get_height() / 2, "~" + human(v), va="center", color=INK2, fontsize=10)
ax.set_xlim(1e3, 2e8)
ax.set_title("Which proteins misfold the most?")
ax.set_xlabel("Approximate people affected worldwide (log scale)")
fig.text(0.01, 0.01, "PrP bar = new cases per year; others = people currently living with the disease. "
         "Sources in data/misfolding_proteins.csv", fontsize=8, color=INK2)
save(fig, "proteins_that_misfold_most.png")

# 2. PrP secondary structure: normal vs misfolded
rows = read("prp_secondary_structure.csv")
fig, ax = plt.subplots(figsize=(7.5, 4.5))
x = range(len(rows))
w = 0.36
a = [float(r["alpha_helix_pct"]) for r in rows]
b = [float(r["beta_sheet_pct"]) for r in rows]
ax.bar([i - w / 2 - 0.01 for i in x], a, w, color=BLUE, label="α-helix")
ax.bar([i + w / 2 + 0.01 for i in x], b, w, color=ORANGE, label="β-sheet")
for i in x:
    ax.text(i - w / 2, a[i] + 1, f"{a[i]:g}%", ha="center", color=INK2)
    ax.text(i + w / 2, b[i] + 1, f"{b[i]:g}%", ha="center", color=INK2)
ax.set_xticks(list(x), [r["form"] for r in rows])
ax.set_ylabel("% of protein structure")
ax.set_ylim(0, 55)
ax.grid(axis="x", visible=False)
ax.legend(frameon=False, loc="upper center")
ax.set_title("Misfolding turns helices into sheets")
fig.text(0.01, 0.01, "Pan et al. 1993, PNAS 90:10962 (FTIR spectroscopy)", fontsize=8, color=INK2)
save(fig, "prp_helix_to_sheet.png")

# 3. vCJD deaths in the UK per year
rows = read("vcjd_uk_deaths.csv")
fig, ax = plt.subplots(figsize=(10, 4.5))
years = [int(r["year"]) for r in rows]
deaths = [int(r["deaths"]) for r in rows]
ax.bar(years, deaths, color=RED, width=0.8)
ax.grid(axis="x", visible=False)
peak = max(deaths)
ax.annotate(f"peak: {peak} deaths in {years[deaths.index(peak)]}", (years[deaths.index(peak)], peak),
            xytext=(12, -4), textcoords="offset points", color=INK2)
ax.set_title(f"Variant CJD deaths in the UK ({sum(deaths)} total)")
ax.set_ylabel("Deaths (definite + probable)")
fig.text(0.01, 0.01, "UK National CJD Research & Surveillance Unit", fontsize=8, color=INK2)
save(fig, "vcjd_uk_deaths.png")

# 4. Simulated spread through the body (default scenario)
traj = model.simulate("bse_burger", "MM")
t = [p["t"] / 12 for p in traj]
fig, (ax, ax2) = plt.subplots(2, 1, figsize=(10, 7), sharex=True, gridspec_kw={"height_ratios": [3, 1.2]})
series = [("gut", "Gut", BLUE), ("lymph", "Lymph tissue", ORANGE), ("nerve", "Nerves", AQUA),
          ("brainstem", "Brainstem", YELLOW), ("thalamus", "Thalamus", MAGENTA),
          ("cerebellum", "Cerebellum", GREEN), ("cortex", "Cortex", VIOLET)]
for key, label, col in series:
    ax.plot(t, [max(p[key], 1e-12) * 100 for p in traj], color=col, lw=2, label=label)
on, de, _ = model.milestones(traj)
ax.set_yscale("log")
ax.set_ylim(1e-7, 200)
ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:g}%"))
ax.set_ylabel("PrP misfolded (log scale)")
ax.set_title("Simulated: one BSE-contaminated burger, PRNP codon 129 MM")
ax.legend(frameon=False, loc="center left", bbox_to_anchor=(1.01, 0.5), fontsize=9)
ax2.plot(t, [p["health"] * 100 for p in traj], color=INK, lw=2)
ax2.set_ylim(0, 105)
ax2.set_ylabel("Neuron health %")
ax2.set_xlabel("Years after eating the meal")
for a in (ax, ax2):
    a.axvline(on / 12, color=INK2, lw=1, ls=":")
ax2.text(on / 12 - 0.15, 20, "first symptoms", color=INK2, fontsize=9, ha="right")
save(fig, "simulated_spread_by_region.png")

# 5. Which brain region misfolds most (simulated, at death)
last = traj[-1]
regions = [("thalamus", "Thalamus"), ("brainstem", "Brainstem"), ("cerebellum", "Cerebellum"), ("cortex", "Cortex")]
regions.sort(key=lambda r: last[r[0]])
fig, ax = plt.subplots(figsize=(8, 3.8))
vals = [last[k] * 100 for k, _ in regions]
bars = ax.barh([l for _, l in regions], vals, color=RED, height=0.6)
for bb, v in zip(bars, vals):
    ax.text(v + 1, bb.get_y() + bb.get_height() / 2, f"{v:.0f}%", va="center", color=INK2)
ax.set_xlim(0, 100)
ax.grid(axis="y", visible=False)
ax.set_xlabel("% of prion protein misfolded at end of illness (simulated)")
ax.set_title("Where misfolded PrP builds up most (vCJD model)")
save(fig, "simulated_load_by_brain_region.png")

# 6. Incubation by genotype and food
foods = [("bse_brain", "Brain & spinal cord"), ("bse_burger", "Burger w/ nervous tissue")]
gts = list(model.GENOTYPE)
fig, ax = plt.subplots(figsize=(8, 4.2))
w = 0.36
for j, (fk, fl) in enumerate(foods):
    yrs = []
    for g in gts:
        on, *_ = model.milestones(model.simulate(fk, g))
        yrs.append(on / 12)
    xs = [i + (j - 0.5) * (w + 0.02) for i in range(len(gts))]
    bb = ax.bar(xs, yrs, w, color=[RED, BLUE][j], label=fl)
    for xx, y in zip(xs, yrs):
        ax.text(xx, y + 0.2, f"{y:.1f}", ha="center", color=INK2, fontsize=9)
ax.set_xticks(range(len(gts)), [f"codon 129 {g}" for g in gts])
ax.set_ylabel("Years until first symptoms")
ax.grid(axis="x", visible=False)
ax.legend(frameon=False)
ax.set_title("Simulated incubation period by genotype")
save(fig, "simulated_incubation_by_genotype.png")
