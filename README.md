# LabValidate Pro

> A method **validation & verification** workspace for analytical laboratories — plan a study, enter your data, and get the statistics and pass/fail checks for every performance characteristic, ready to compile into a report.

Aligned with **EURACHEM** *“The Fitness for Purpose of Analytical Methods”, 3rd Ed. (2025)* and **ISO/IEC 17025:2017**.

![Version](https://img.shields.io/badge/version-1.2.0-0f766e)
![React](https://img.shields.io/badge/React-18-149eca)
![Vite](https://img.shields.io/badge/Vite-6-646cff)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8)
![Deploy](https://img.shields.io/badge/deploy-Vercel-000000)

---

## Overview

LabValidate Pro guides an analyst through a complete method **validation** (a new/in-house method) or **verification** (confirming a published standard method performs as expected in your lab). Each performance characteristic has its own module: enter the raw data, and the app computes the relevant statistics, draws the diagnostic charts, and reports a clear **pass / fail** decision against the acceptance criteria you set.

It runs entirely in the browser for the calculations, with an optional account so your studies sync across devices — or you can work as a guest and keep everything locally.

## Standards & methods

- **EURACHEM** — *The Fitness for Purpose of Analytical Methods*, 3rd Ed. (2025)
- **ISO/IEC 17025:2017** — general requirements for the competence of testing laboratories
- **USEPA 40 CFR 136 App. B** — Method Detection Limit (MDL) procedure
- Established statistics: linear regression diagnostics, Grubbs' outlier test, one-way ANOVA for precision, F- and t-tests, Horwitz equation / HorRat, and the Eurachem/IUPAC detection-limit model.

## Validation & verification modules

| Module | What it evaluates |
| --- | --- |
| **Study Plan** | Method, intended use, and the acceptance criteria every result is judged against. |
| **Selectivity** | Whether the signal comes from the analyte and not from matrix components or other interferences. |
| **Linearity & Range** | Response proportionality across the working range — via the calibration fit, residual plot and response factors, not R² alone. |
| **LOD / LOQ** | Limit of Detection and Limit of Quantification (calibration, blank, fortified-sample, and USEPA MDL routes). |
| **Trueness / Bias** | Closeness of the mean measured value to a true/reference value (CRM, reference method, or spiked recovery). |
| **Precision** | Repeatability and intermediate precision via one-way ANOVA, reported as SD and %RSD, with Horwitz/HorRat benchmarking. |
| **F & t Tests** | Statistical comparison against a reference method or lab — variances (F-test) and means (t-test). |
| **Recovery** | Proportion of analyte recovered from a spiked sample, with a significance test vs 100 %. |
| **Ruggedness** | Resistance of results to small, deliberate changes in method conditions. |
| **Uncertainty** | Combined and expanded measurement uncertainty from the significant error sources. |
| **Report** | Compiles the study into a summary with results, pass/fail, and the overall fitness-for-purpose conclusion. |

## Key features

- **Statistics engine** built around the Eurachem guidance — regression, critical-value tables (t, F), Grubbs, ANOVA variance components, Horwitz/HorRat, MDL/IDL.
- **Diagnostic charts** — calibration & residual plots, LOD/LOQ distribution view, trueness/bias and spike-recovery distributions (Recharts).
- **PDF reports** — one-click, print-ready study reports generated with `@react-pdf/renderer`.
- **Worked examples** included — copper by GF-AAS, lead by ICP-MS, and iron by FAAS method comparison.
- **Cloud sync or local-only** — save studies to your account, or export/import as JSON as a guest.
- **Light & dark mode**, responsive layout, keyboard-friendly UI (shadcn/ui + Radix).

## Tech stack

**Frontend**
- React 18 + Vite 6
- Tailwind CSS 3 with shadcn/ui components (Radix UI primitives)
- Recharts (in-app charts) and `@react-pdf/renderer` (PDF report charts)
- lucide-react icons, date-fns

**Backend** (Vercel serverless functions under `api/`)
- Turso / libSQL database (`@libsql/client`)
- Email + password accounts with a signed session cookie (`jose` JWT)
- Endpoints for auth, studies, feedback, bug/idea reports, and an admin panel

During local development a small Vite plugin (`dev-api-plugin.mjs`) serves the same `api/*` handlers, so **you don't need a Vercel account to run the app locally** — only a Turso database.

## Project structure

```
├── labvalidate-pro.jsx      # Main app: statistics engine + all modules
├── components/              # Dialogs, dashboard, and shadcn/ui components
├── api/                    # Vercel serverless functions (auth, studies, admin, …)
│   ├── _lib/               # db, auth, and beta-program config helpers
│   ├── auth/               # signup, login, logout, me, account
│   ├── studies/            # list / get / save / rename / delete
│   └── admin/users/        # admin user management
├── lib/apiClient.js        # Thin fetch wrappers around /api
├── scripts/init-db.mjs     # One-time database setup
├── dev-api-plugin.mjs      # Serves /api during `npm run dev`
└── src/main.jsx            # React entry point
```

## Getting started

### Prerequisites

- **Node.js 18+**
- A free **[Turso](https://turso.tech)** database (libSQL)

### 1. Install

```bash
git clone <your-repo-url>
cd "Validation and verification Eurachem"
npm install
```

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
| --- | --- |
| `TURSO_DATABASE_URL` | Your Turso database URL (`libsql://…`). |
| `TURSO_AUTH_TOKEN` | Turso database auth token. |
| `AUTH_SECRET` | 32+ random chars used to sign the session cookie. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ADMIN_EMAILS` | Comma-separated emails granted admin access. |
| `TRIAL_DAYS` | Free-trial length before feedback is required (default `30`). |
| `ACCESS_DAYS` | Access granted when a tester is approved (default `365`). |
| `BETA_REQUIRE_LOGIN` | Require sign-in to use the app (default `true`). |
| `BETA_AUTO_APPROVE` | If `true`, submitting feedback auto-grants access; if `false`, the admin approves manually. |

> These variables are read **only** inside the `/api` serverless functions and are never exposed to the browser.

### 3. Initialise the database

Creates the `users`, `studies`, `feedback`, and `reports` tables (safe to re-run):

```bash
npm run db:init
```

### 4. Run

```bash
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

## Build & deploy

```bash
npm run build     # production build to dist/
npm run preview   # preview the production build locally
```

The app is designed for **Vercel**: the frontend deploys as a static build and everything under `api/` runs as serverless functions. Set the same environment variables from `.env.local` in your Vercel project settings, then deploy.

## Beta program & access model

LabValidate Pro ships with a lightweight beta-access model:

- **Roles** — `admin` (unlimited access + admin panel) and `user`.
- **Trial** — new testers get a `TRIAL_DAYS` window (default 30 days).
- **Feedback-gated access** — testers submit feedback to unlock a longer `ACCESS_DAYS` window (default 1 year); with `BETA_AUTO_APPROVE=false` the admin approves each tester manually.
- **Admin panel** — manage users, and review feedback and bug/idea reports.

## Data & privacy

- Studies are stored against your account in your Turso database, or kept locally when working as a guest.
- Passwords are stored only as hashes; sessions use a signed, HTTP-only cookie.
- Secrets live in `.env.local` / Vercel env vars and are **never** committed (`.env*` is git-ignored).

## Author

**ChM. Ts. Hadi Fauzi, MRSC** — [LinkedIn](https://www.linkedin.com/in/chm-hadi-fauzi)

## License

© ChM. Ts. Hadi Fauzi, MRSC. All rights reserved.

> No open-source license is currently applied. If you intend to allow others to use, modify, or distribute the code, add a `LICENSE` file (e.g. MIT) and update this section.
