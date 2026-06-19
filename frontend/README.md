# TeamMatch React Demo

Hybrid Recommender + Global Optimizer for internal project staffing.

## Run

```bash
cd frontend
npm install   # if not done
npm run dev
```

Open http://localhost:5180 (the dev server opens it automatically). The port is set
in `vite.config.ts` so the demo doesn't collide with other Vite apps on 5173.

Styling uses Tailwind CSS v4 via the `@tailwindcss/vite` plugin (imported in
`src/index.css`).

## How it works (matches the approved architecture)

1. Loads the synthetic data (800 employees, 300 projects, history).
2. Initial pipeline = projects with status=`pipeline`.
3. You can add new projects via the form.
4. "Run Recommender":
   - Computes **hybrid match scores** for every employee × pipeline project.
   - Uses segment logic: Exploration (juniors) gets novelty/serendipity bias. Exploitation (seniors) gets track-record bias.
   - Runs **global optimization** that maximizes the *total* portfolio score (not greedy per-project).
   - Includes basic team cohesion (personality similarity).
5. Results show suggested teams + individual + team scores.

## Architecture implemented
- Scoring: Content-Based (skills) + CF (domain-scoped history) + Personality + Level/Role,
  with a **smooth seniority signal** routing each person to exploration / balanced / exploitation
  weighting (no brittle hard cutoffs).
- Optimization: global greedy construction → repair → **cohesion-aware local search** whose
  objective is `sum(scores) + cohesion · size`, so team chemistry is genuinely optimized, not
  just displayed. Local search is shortlisted to the top candidates per project to stay fast.
- **Honest evaluation:** the generator now stores `true_effectiveness`, and the app re-scores
  every historical pair to report the correlation between predicted score and ground truth
  (the "Model validity" card), plus top-decile precision.
- Fully client-side React + TypeScript, styled with Tailwind CSS v4.

Data lives in `public/data/`. Re-generate from the repo root with
`py src/data_generation/generate_dataset.py` (realistic names, domain-coherent skills, real
project titles, stored ground truth), then copy the three CSVs into `frontend/public/data/`.
