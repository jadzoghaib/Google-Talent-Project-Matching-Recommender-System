# TeamMatch — Talent → Project Recommender

A hybrid recommender system that matches software engineers to internal projects and
staffs an entire pipeline at once with a portfolio-global, cohesion-aware optimizer.
Built around a synthetic Google-scale org (800 engineers, 300 projects, 2,200 historical
assignments).

## What it does

1. **Hybrid scoring** for every `engineer × project` pair:
   - **Content-based** — skill match against the project's required skills
   - **Collaborative** — a trained **Matrix Factorization** model (latent employee×domain
     factors, SGD + L2); the domain-scoped historical average is the fallback
   - **Personality** — Big Five signal
   - **Level / role** fit
   - A **smooth seniority signal** routes each person to *exploration*, *balanced*, or
     *exploitation* weighting (juniors get novelty/serendipity bias; seniors get
     track-record bias).
2. **Global optimization** — one unified candidate list across all open projects (not
   greedy per-project), with greedy construction → repair → **cohesion-aware local
   search** whose objective is `Σ(individual scores) + cohesion · team_size`. Hard
   constraints (team size, required roles & min levels, availability, no double-staffing)
   are enforced.
3. **Honest evaluation** — the data generator stores a clean `true_effectiveness` signal,
   and the app re-scores every historical pair to report the correlation between predicted
   scores and ground truth (the "Model validity" card) plus top-decile precision.

## Repository layout

| Path | Description |
|------|-------------|
| `src/data_generation/generate_dataset.py` | Synthetic dataset generator (realistic names, domain-coherent skills, stored ground truth) |
| `src/models/train_matrix_factorization.py` | Trains the MF collaborative model (employee×domain, SGD+L2); exports affinities + RMSE metrics |
| `data/` | Generated CSVs + `mf_employee_domain.csv`, `mf_metrics.json` |
| `frontend/` | React 19 + TypeScript + Vite + Tailwind v4 demo UI |
| `frontend/src/lib/` | `scorer.ts`, `optimizer.ts`, `evaluation.ts`, `dataLoader.ts`, `types.ts` |
| `docs/ARCHITECTURE.md`, `TEAMMATCH_FULL_SPEC.md` | Design docs |

## Quick start

```bash
# 1. (optional) regenerate the synthetic data
py src/data_generation/generate_dataset.py
cp data/*.csv frontend/public/data/

# 2. run the demo UI
cd frontend
npm install
npm run dev          # opens http://localhost:5180
```

## Tech stack

Python (numpy / pandas) for data generation · React 19 + TypeScript + Vite 8 +
Tailwind CSS v4 for the client-side app (scoring and optimization run entirely in the browser).
