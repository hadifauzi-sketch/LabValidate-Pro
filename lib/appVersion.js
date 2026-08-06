/* ══════════════════════════════════════════════════════════════════════════
   Single source of truth for the app version and its release history.

   Keep APP_VERSION in step with `version` in package.json and the badge in
   README.md. When you ship a release, add a new entry at the TOP of CHANGELOG
   — the App version dialog renders the list in the order given here.

   A CHANGELOG entry is:
     { version, date, title, notes: [string], current? }
   `notes` are plain sentences, written for the analyst using the app rather
   than for someone reading the diff.
   ══════════════════════════════════════════════════════════════════════════ */

export const APP_VERSION = "1.3.0";
export const APP_VERSION_DATE = "7 August 2026";

export const CHANGELOG = [
  {
    version: "1.3.0",
    date: "7 August 2026",
    title: "Show the calculation",
    current: true,
    notes: [
      "Every result card can now open a “how was this calculated” modal — the formula, your numbers substituted into it, the intermediate tables and the final value, step by step.",
      "Calculation walkthroughs cover Linearity & Range, LOD/LOQ, Precision (including the full one-way ANOVA table), Trueness/Bias, F & t tests (both the result cards and the summary of the two tests), Recovery, Ruggedness and Uncertainty.",
      "Results tables are clickable too, not just the cards — pick a recovery level, an ANOVA source, a ruggedness factor or a significance test and the walkthrough opens for that row.",
      "New worked example: water in insulating oil by coulometric Karl Fischer titration (IEC 60814).",
      "New worked examples: dissolved gas analysis of the nine IEC 60567 fault gases, rebuilt from real GC verification data, with LOD/LOQ derived from the actual calibration (3.3 · Sy/x / b₁) over the 100–1000 µL/L working range.",
      "New worked examples: kinematic viscosity of lubricating oil by glass capillary viscometer at 40 °C and 100 °C (ASTM D445), verified against certified viscosity standards.",
      "New worked examples: the five furanic compounds of IEC 61198 (2-FAL, 5-HMF, 2-FOL, 2-ACF, 5-MEF) by HPLC-UV, each as its own full validation study.",
      "A search box in the Examples panel filters both the worked examples and your saved studies as you type, with a match count and clear button.",
      "The presets modal stays centred with only its list scrolling, so long example libraries no longer push the dialog off-screen.",
      "This App version dialog, so you can see what changed between releases from inside the app.",
    ],
  },
  {
    version: "1.2.0",
    date: "28 July 2026",
    title: "Print-ready reports",
    notes: [
      "Expanded PDF study report — more of the study carried through to the printed document, with the diagnostic charts redrawn for print.",
      "Added charts to the report chart kit so the PDF matches what you see in the app.",
      "App icon, favicon and build configuration cleaned up for deployment.",
    ],
  },
  {
    version: "1.1.0",
    date: "27 July 2026",
    title: "Deeper statistics",
    notes: [
      "Substantially expanded the statistics engine across the validation modules — regression diagnostics, variance components, critical-value handling and the pass/fail logic behind each characteristic.",
      "Richer study report content and account handling.",
    ],
  },
  {
    version: "1.0.0",
    date: "26 July 2026",
    title: "First release",
    notes: [
      "First release of LabValidate Pro: Study Plan, Selectivity, Linearity & Range, LOD/LOQ, Trueness/Bias, Precision, F & t tests, Recovery, Ruggedness, Uncertainty and Report.",
      "Aligned with EURACHEM “The Fitness for Purpose of Analytical Methods”, 3rd Ed. (2025) and ISO/IEC 17025:2017.",
      "Studies saved to your account and synced across devices, or kept locally as a guest.",
    ],
  },
];
