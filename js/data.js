/* Foods, regions and reference data (mirrors /data/*.csv). */
window.PrionData = {
  foods: [
    { id: "salad", emoji: "🥗", name: "Garden salad", dose: 0, barrier: 0, risk: "safe",
      note: "Plants don't carry prion protein. Nothing to misfold." },
    { id: "tofu", emoji: "🫘", name: "Tofu", dose: 0, barrier: 0, risk: "safe",
      note: "Made from soybeans. Plants have no prion protein, so there's nothing that can misfold." },
    { id: "steak", emoji: "🥩", name: "Steak from a healthy cow", dose: 0, barrier: 0, risk: "safe",
      note: "Healthy beef contains no misfolded prions. This is what you're eating today." },
    { id: "bse_steak", emoji: "🍖", name: "Steak from a BSE cow", dose: 2e-9, barrier: 0.75, risk: "low",
      note: "Muscle meat carries very little infectivity. One meal is usually cleared — try many meals." },
    { id: "bse_burger", emoji: "🍔", name: "Burger with BSE nervous tissue", dose: 2e-6, barrier: 0.75, risk: "high",
      note: "1980s–90s style mechanically recovered meat could contain spinal cord. This is how vCJD spread." },
    { id: "bse_brain", emoji: "🧠", name: "Brain & spinal cord from a BSE cow", dose: 1e-4, barrier: 0.75, risk: "high",
      note: "The most infectious tissue. Now banned as 'specified risk material' in the UK and EU." },
    { id: "cwd_venison", emoji: "🦌", name: "Venison from a CWD deer", dose: 2e-6, barrier: 0.03, risk: "barrier",
      note: "Chronic wasting disease spreads among deer. A strong species barrier — no confirmed human cases." },
    { id: "scrapie_lamb", emoji: "🐑", name: "Lamb from a scrapie sheep", dose: 2e-6, barrier: 0.02, risk: "barrier",
      note: "Scrapie has existed for centuries in sheep with no link to human disease." },
  ],

  regions: {
    gut:        { name: "Gut (Peyer's patches)", short: "Gut", color: "--s1",
                  about: "Prions cross the gut wall through M-cells into Peyer's patches, small immune patches in the intestine." },
    lymph:      { name: "Lymph tissue (tonsils, spleen, appendix)", short: "Lymph", color: "--s2",
                  about: "Immune cells called follicular dendritic cells become prion factories. In vCJD, prions can be found in tonsils years before symptoms." },
    nerve:      { name: "Nerves (vagus & spinal cord)", short: "Nerves", color: "--s3",
                  about: "Prions climb the nerves of the gut — mainly the vagus nerve — up toward the brain." },
    brainstem:  { name: "Brainstem", short: "Brainstem", color: "--s4",
                  about: "The vagus nerve enters the brain here, in the dorsal motor nucleus of the medulla." },
    thalamus:   { name: "Thalamus", short: "Thalamus", color: "--s5",
                  about: "vCJD hits the thalamus especially hard; MRI shows the bright 'pulvinar sign'." },
    cerebellum: { name: "Cerebellum", short: "Cerebellum", color: "--s6",
                  about: "Controls balance and coordination. Damage here causes the unsteady walking (ataxia) of CJD." },
    cortex:     { name: "Cerebral cortex", short: "Cortex", color: "--s7",
                  about: "Thinking and memory. Spongy holes and plaques here cause the rapid dementia." },
  },

  // Approximate people affected worldwide — see data/misfolding_proteins.csv for sources and caveats
  proteins: [
    { protein: "Amyloid-β", disease: "Alzheimer's disease", value: 32e6, note: "people living with Alzheimer's dementia (Gustavsson 2023)" },
    { protein: "Tau", disease: "Alzheimer's, FTD, PSP, CTE", value: 32e6, note: "lower bound — Alzheimer's alone" },
    { protein: "α-Synuclein", disease: "Parkinson's, Lewy body dementia, MSA", value: 8.5e6, note: "people with Parkinson's (WHO, 2019)" },
    { protein: "TDP-43", disease: "ALS, frontotemporal dementia", value: 3.4e5, note: "~97% of ALS cases" },
    { protein: "Huntingtin", disease: "Huntington's disease", value: 2.1e5, note: "~2.7 per 100,000 people" },
    { protein: "Prion protein (PrP)", disease: "CJD, vCJD, kuru, FFI, GSS", value: 1e4, note: "new cases per year (~1–2 per million)", highlight: true },
    { protein: "SOD1", disease: "Familial ALS", value: 7e3, note: "~2% of ALS cases" },
  ],

  prpStructure: [
    { form: "PrPᶜ (normal)", alpha: 42, beta: 3 },
    { form: "PrPˢᶜ (misfolded)", alpha: 30, beta: 43 },
  ],

  vcjdUK: [[1995,3],[1996,10],[1997,10],[1998,18],[1999,15],[2000,28],[2001,20],[2002,17],[2003,18],[2004,9],
           [2005,5],[2006,5],[2007,5],[2008,1],[2009,3],[2010,3],[2011,5],[2012,0],[2013,1],[2014,1],[2015,0],[2016,1]],
};
