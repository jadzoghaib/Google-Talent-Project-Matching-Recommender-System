# TeamMatch — Talent → Project Recommender

A hybrid recommender that matches software engineers to internal projects and staffs an
entire pipeline at once with a portfolio-global, cohesion-aware optimizer. Built around a
synthetic Google-scale org: **800 engineers, 300 projects** (75 pipeline · 60 active · 165
completed) and **6,000 historical assignments** with stored ground truth.

All scoring and optimization run **client-side in the browser** — the Python side only
generates the synthetic data and trains the collaborative model.

## What it does

### 1. Hybrid scoring (every `engineer × project` pair)
- **Content-based** — skill match against the project's required skills (exact-match against
  a shared 20-skill catalog).
- **Collaborative** — a trained **Matrix Factorization** model over the `employee × domain`
  matrix (Funk/Koren biased SGD + L2; beats the domain-mean baseline by ~3.4%). The matrix is
  **sparse by design**: only the 558 engineers with work history get latent rows. The other
  **242 are a genuine cold-start cohort** whose CF signal correctly falls back to the
  domain-scoped historical average.
- **Personality** — Big Five (OCEAN) fit.
- **Level / role** fit — a shared role-matching rule (`lib/roles.ts`) used by both the scorer
  and the optimizer so they never diverge.
- A **smooth seniority signal** routes each person to *exploration*, *balanced*, or
  *exploitation* weighting (juniors get novelty bias; seniors get track-record bias).

### 2. Portfolio-global optimization
One unified candidate list across all open projects (not greedy per-project): greedy
construction → repair → **cohesion-aware local search**. The objective is
`Σ(priority-weighted individual scores) + cohesion · team_size`, so **project priority
biases who wins contention** for scarce senior talent. Hard constraints — team size,
required roles & min levels, availability, no double-staffing — are enforced, and the result
is shown against a theoretical **ceiling** (every project's dream team) to expose the cost of
contention.

### 3. Cold-start, gap-fill, and the feedback loop
- **Onboarding assessment** (`Onboard` tab) — a new hire's CV data + an 11-domain aptitude
  test + a 10-item Big Five questionnaire produce a domain-affinity profile that is injected
  directly as their MF cold-start row, so they're recommendable from day one.
- **Gap-fill open seats** — on an *active* project you can request an extra hire; each request
  becomes a single-slot pseudo-project that joins the same optimize run, competing for the
  same free pool (the existing roster is shown and stays busy).
- **Peer-review history loop** — closing out a staffed project records PM/peer/delivery
  reviews, which write history rows (feeding the CF fallback) and warm up each member's track
  record, so a cold-start hire stops being cold after their first delivered project.

### 4. Transparency & honest evaluation
- An **Analyze** drawer on every assigned person shows the full signal breakdown
  (value × weight = contribution), candidate rank, their project-preference rank, the MF
  provenance, and which optimizer phase placed them.
- The generator stores a clean `true_effectiveness`; the app re-scores every historical pair
  to report the correlation between predicted scores and ground truth ("Model validity")
  plus top-decile precision.

## The workspace (4 tabs)
| Tab | What it does |
|-----|--------------|
| **Recommender** | Stage a pipeline + open seats, run the optimizer, inspect staffed teams, gap-fills, coverage, and the ceiling |
| **Projects** | Browse all 300 projects with filters + analytics; open any for its spec, stage pipeline projects, or request a gap-fill hire on active ones |
| **People** | Browse the full talent pool with filters + analytics; open anyone for skills, Big Five, education, and learned/onboarding domain affinities |
| **Onboard** | Add a new hire via the cold-start assessment |

## Repository layout
| Path | Description |
|------|-------------|
| `src/data_generation/generate_dataset.py` | Synthetic dataset generator (realistic names, domain-coherent skills, PM roles, active rosters, stored ground truth, a deliberate cold-start cohort) |
| `src/models/train_matrix_factorization.py` | Trains the MF model (employee×domain, biased SGD+L2); exports sparse affinities + RMSE metrics |
| `data/` · `frontend/public/data/` | Generated CSVs + `mf_employee_domain.csv`, `mf_metrics.json` |
| `frontend/src/lib/` | `scorer.ts`, `optimizer.ts`, `roles.ts`, `evaluation.ts`, `analytics.ts`, `dataLoader.ts`, `catalog.ts`, `uikit.tsx`, `types.ts` |
| `frontend/src/` | `App.tsx`, `ProjectsTab.tsx`, `PeopleTab.tsx`, `OnboardingPage.tsx`, `AnalysisDrawer.tsx`, `ReviewDrawer.tsx` |
| `frontend/scripts/` | Headless integration tests (`test-gapfill.mts`, `test-review-loop.mts`) |
| `docs/`, `TEAMMATCH_FULL_SPEC.md`, `HOW_IT_WORKS.md` | Design docs |

## Quick start
```bash
# 1. (optional) regenerate the synthetic data + retrain the MF model
py src/data_generation/generate_dataset.py
py src/models/train_matrix_factorization.py
cp data/*.csv data/*.json frontend/public/data/

# 2. run the demo UI
cd frontend
npm install
npm run dev            # http://localhost:5180 (falls back to 5181 if busy)
```

Verify the build and recommender logic without a browser:
```bash
cd frontend
npx tsc -b --noEmit && npx vite build
npx tsx scripts/test-gapfill.mts        # gap-fill seats staffed from the free pool
npx tsx scripts/test-review-loop.mts    # peer reviews move a cold-start hire's score
```

## Tech stack
Python (numpy / pandas) for data generation + MF training · React 19 + TypeScript + Vite 8 +
Tailwind CSS v4 + framer-motion for the client-side app.
