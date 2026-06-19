# TeamMatch — Complete Detailed Specification (for Claude / AI Handoff)

**Project Goal**: Build a two-stage internal talent-to-project recommender + optimizer for a large engineering organization (modeled on Google).

**Core Idea** (from original brief):
1. **Scoring stage**: Compute a compatibility/match score (0–10) for every (employee, project) pair.
2. **Optimization stage**: Assign people to multiple open/pipeline projects to **maximize the total sum of match scores** across the whole portfolio, subject to hard constraints (team sizes, role/level requirements, quality floor, diversity, no double-staffing). Also maximize team cohesion (person-person fit).

This is deliberately **not** a simple per-project top-N recommender. The global optimization is the key business value.

---

## 1. Synthetic Data Generation (Python)

All data is synthetic because real Google internal staffing data is unavailable.

**Generation script location** (example): `src/data_generation/generate_dataset.py`

**Scale chosen for demo**:
- 800 employees
- 300 projects (mix of historical/completed + active + ~50-100 "pipeline" / open)
- ~2200 historical assignment records

This scale is large enough to exercise collaborative filtering and interesting optimization behavior, but small enough to run quickly in a browser or simple Python backend.

### 1.1 Employees (employees.csv)

**Key fields** (all generated realistically with distributions):

- `employee_id`: E10000-style string
- `name`: Synthetic (can be faked later)
- `level`: Google-style L3–L8 (skewed toward mid-levels)
- `role_category`: Junior / Mid / Senior / Staff / Principal / Project Manager (parallel to level for easy requirement matching)
- `years_experience`: Correlated with level (juniors can have 0)
- `primary_domain`: Search, Ads, Android, Cloud, AI Platform, Infra, Payments, etc. **Nullable for many L3/L4 / new grads / interns** ("Undecided" or empty)
- `skills`: JSON array of objects: `[{"skill": "Python", "proficiency": 5}, ...]`
  - Proficiency: 1–5
  - Juniors get fewer skills and lower average proficiency
- `tech_tags`: JSON array of strings (secondary tags)
- Big Five personality (each 1–5, sampled around mean 3.5):
  - `personality_openness`
  - `personality_conscientiousness`
  - `personality_extraversion`
  - `personality_agreeableness`
  - `personality_neuroticism`
- `education`: JSON `{ "degree": "BS/MS/PhD", "field": "...", "university": "Stanford / MIT / ..." }`
- `previous_companies`: JSON list of standardized company names (Google, Meta, Amazon, Microsoft, Apple, Uber, Stripe, OpenAI, Startup, Ex-Google returner, etc.)
- `past_projects_count`: Realistic distribution (low for juniors)
- `avg_past_performance`: 2.5–5.0 (used for track-record signals)
- `primary_location`: US-West / US-East / EMEA / APAC
- `timezone_offset`: Corresponding offset
- `can_work_across_timezones`: boolean
- `current_staffed`: boolean (many are staffed)
- `available_from`: date (if staffed, in the future)
- `diversity_group`: Synthetic A/B/C/D for diversity-band constraints

**Generation notes**:
- Level distribution is realistic (more mids).
- Many early-career employees have `primary_domain = null` or "Undecided".
- Skills and personality are varied.
- Historical performance is generated with the "hybrid ground truth" method (see below).

### 1.2 Projects (projects.csv)

**Key fields**:

- `project_id`: P1000-style
- `title`, `description`
- `domain`: Same catalog as employees
- `priority`: 1–5
- `required_team_size_min / max / target`
- `required_roles`: JSON array e.g. `[{"role": "Tech Lead", "min_level": "L6", "count": 1}, {"role": "Software Engineer", "min_level": "L4", "count": 4}]`
- `required_skills`: JSON array with weights e.g. `[{"skill": "Python", "min_proficiency": 4, "weight": 1.1}, ...]`
- `tech_requirements`: simple list
- `duration_weeks`, `target_start_date`
- `status`: "completed", "active", "pipeline"

**~55% completed** (for history), rest active or pipeline.

### 1.3 Historical Assignments (historical_assignments.csv)

Records of past staffing + outcomes.

**Fields**:
- `employee_id`, `project_id`
- `role_on_project`
- `level_at_time`
- `pm_review` (1–5)
- `peer_collaboration_avg` (1–5)
- `delivery_score` (1–5)
- `was_successful` (0/1)

### 1.4 Hybrid Ground-Truth for Performance (Important for Evaluation)

When generating historical data we create **two layers**:

1. **True underlying effectiveness** (clean, internal):
   - Rule-based: weighted combination of skill match + personality compatibility + level/experience fit + domain relevance + small noise.
   - This is the "what should have happened" signal.

2. **Observed noisy reviews** (what goes into the CSV):
   - `pm_review = clamp(true_eff + gauss(0, 0.6), 1, 5)`
   - Similar for peer and delivery.
   - This simulates real feedback noise and bias.

**Why**:
- The recommender only sees the noisy observed data.
- We can later evaluate against the clean true effectiveness.
- Matches real-world recommender evaluation challenges (noisy labels, missing-not-at-random feedback).

---

## 2. Recommender System Architecture (Two-Stage)

### Stage 1: Scoring — Hybrid Match Score (per employee–project pair)

For every valid (employee, project) pair we compute a single **match score** (0–10).

**Components** (all normalized to ~0–1 then weighted):

- **CBF (Content-Based Filtering) — Skill Match**
  - For each required skill in the project: `min(emp_proficiency / req_min_proficiency, 1.3) * weight`
  - Average (weighted). Handles missing skills as 0.
  - Directly uses the `skills` and `required_skills` JSON.

- **CF (Collaborative / Track Record) — History Score**
  - Average performance (pm_review + peer + delivery / 3) of this employee on past projects in the **same domain**.
  - Fallback to 0.5 if no relevant history.
  - Can be upgraded to proper item-item similarity later.

- **Personality Fit**
  - Cosine similarity on the Big Five vectors (neuroticism inverted).
  - Or simple average of the five dimensions (higher = better for teams).

- **Level / Role Fit**
  - Check if employee's level >= required min_level for the roles they can fill.
  - Bonus if role_category matches.
  - Penalty if under-qualified.

**Segment Routing (different behavior for different employees)**

Determine segment for the employee (re-evaluated every run):

- **Exploration** (serendipity / juniors):
  - `past_projects_count < 4` **OR** `level in ["L3","L4"]`
  - Scoring: higher weight on novelty (project domain != employee's primary_domain) + personality + broader skill exploration.
  - Lower weight on pure history (they don't have reliable history yet).

- **Exploitation** (best-fit / seniors):
  - `past_projects_count >= 5` **AND** `level >= L6`
  - Scoring: heavy weight on history/track-record + exact skill match.
  - Low novelty bonus.

- **Balanced**: Everyone else (L5 or medium experience).

**Example weight sets** (tunable):
- Exploration: CBF 40–45%, Personality 25%, Novelty 15–20%, History 10%
- Exploitation: History/CF 40%, CBF 35%, Level/Role 15%, Personality 10%
- Balanced: ~35% CBF + 35% History + 20% Personality + 10% Level

The final pair score is the weighted sum, clipped to [1,10].

**Output of scoring stage**: Compatibility matrix (employee × project) with scores + per-component breakdown for explainability.

### Stage 2: Global Optimization (Maximize Total Portfolio Value + Cohesion)

This is **not** "for each project pick the top 5 scorers independently".

**Objective**: Maximize the **sum of all selected match scores** across every pipeline project.

**Additional term**: Team cohesion bonus (person-person fit).
- When evaluating a candidate group for a project, compute average pairwise personality similarity (or skill complementarity) among the proposed members.
- Add a weighted cohesion contribution to the team's effective score.

**Hard Constraints** (must respect):
- Per-project team size (min / max / target)
- Required roles + minimum levels (e.g. at least 1 Tech Lead ≥ L6)
- Employee availability (not currently staffed, available_from date)
- No employee assigned to more than one project at the same time
- (Optional but recommended) Minimum quality floor per project
- Diversity band (using the synthetic diversity_group field)

**Practical Algorithm (demo-friendly, since 800×300 is manageable)**:
1. Pre-filter employees who are available and meet basic level/role requirements for at least one project.
2. Pre-compute (or compute on the fly) the hybrid score for every remaining pair.
3. Greedy phase (high quality starting point):
   - Sort all possible (project, employee) assignments by (score × slight cohesion factor) descending.
   - Assign greedily if the employee is free and the project still has open slots and the role quotas aren't violated.
4. Improvement phase (hill-climbing / local search):
   - Repeatedly try re-assignments or swaps between projects.
   - Accept if the new total portfolio score + cohesion is higher.
5. (Optional) For each project, after the main assignment, do a small local team-refinement pass to boost cohesion while keeping individual scores acceptable.

**Output**: For each pipeline project → list of assigned employee_ids + the team's aggregate score + cohesion value + per-person score breakdowns.

---

## 3. Implementation — Backend / Logic Layer

**Recommended split for production-ish demo**:

### Option A — Pure Client-Side Demo (what we prototyped)
- Everything in React (browser).
- Load CSVs with PapaParse from `/data/employees.csv` etc.
- All scoring and optimization run in JavaScript/TypeScript.
- Fast for development, no server needed.

### Option B — Proper Backend (recommended for handoff)
- **Python backend** (FastAPI or Flask):
  - Endpoint `/api/load-data` or just serve the CSVs.
  - `POST /api/score` — accepts list of project_ids + current pipeline, returns the full compatibility matrix with breakdowns.
  - `POST /api/optimize` — accepts the matrix (or project+employee lists) + constraints, returns the optimized team assignments.
- The Python scorer and optimizer should mirror the logic above (easy to port the TS versions back to Python).
- React frontend calls these two endpoints.

**Python data structures** (suggested):
```python
@dataclass
class Employee: ...
@dataclass
class Project: ...
# skills and required_skills as list[dict]

def get_segment(emp: Employee) -> str: ...
def compute_match_score(emp: Employee, proj: Project, history: list[Assignment]) -> dict: ...
def optimize(pipeline_projects: list[Project], employees: list[Employee], scores: list[MatchScore]) -> list[TeamAssignment]: ...
```

**Important implementation details**:
- Always filter `current_staffed == False` and respect `available_from`.
- JSON fields in CSVs must be parsed (they contain the skill arrays and role requirements).
- Segment is **per employee**, not per project.
- Cohesion is only meaningful once you have a candidate group for a project — compute it inside the optimizer, not in the raw pair scorer.

---

## 4. Frontend (React) Specification

**Tech**: Vite + React + TypeScript (as started).

**Core Screens / Sections**:

1. **Header / Stats**
   - # employees, # projects, current pipeline size.

2. **Pipeline Management**
   - List of current projects in the "pipeline" (the ones we will optimize for).
   - Button: "Add Project" — opens a form with:
     - Title, Domain (dropdown), Priority (1-5)
     - Target / min / max team size
     - Required skills (comma-separated or multi-select from catalog)
     - (Optional) Required roles (simple defaults can be applied)
   - Ability to remove projects from the active pipeline.
   - Optional: "Load from CSV" for batch pipeline projects.

3. **Run Controls**
   - Big "Run Recommender" button.
   - Optional advanced: sliders for the main weight groups (CBF, History, Personality, Novelty) so you can experiment live.

4. **Results View**
   - For each project in the pipeline:
     - Project header (title, domain, priority, target size)
     - Suggested team (list of employees)
       - For each person: name, level, role, individual match score
       - Breakdown tooltip or section: Skill / History / Personality / Level / (Novelty if applicable)
     - Team aggregate score
     - Cohesion score
   - Global portfolio total score (the number the optimizer maximized).
   - Optional: "Why this assignment?" explanation text.

5. **Additional Nice-to-haves (for later)**
   - Toggle between "per-project view" and "global assignment view".
   - Ability to lock certain employees to certain projects (manual override).
   - Simple evaluation: compare the chosen assignments against the "true effectiveness" hidden labels (if you keep a ground-truth column during data gen).

**Data flow in the UI**:
- On load → fetch/parse the three CSVs.
- "Add Project" → append to local pipeline state (array of Project objects).
- "Run" → call the scorer for all employee × current-pipeline-project pairs → call the optimizer → render results.
- All state can live in React (useState / useReducer or Zustand). No need for backend for a first working demo.

---

## 5. How the Whole System Runs (End-to-End)

**Demo / Prototype Flow**:
1. Run the Python generator once → produces the three CSVs.
2. Copy CSVs into `frontend/public/data/`.
3. `cd frontend && npm run dev`
4. UI loads data, shows initial pipeline.
5. User adds 1–3 new projects via the form.
6. User clicks "Run Recommender".
7. Browser computes hybrid scores (segment-aware) → runs global optimizer → displays teams.

**More Production-Like Flow**:
1. Same data generation.
2. Python backend (FastAPI) serves the CSVs and exposes `/score` and `/optimize`.
3. React frontend talks to the backend.
4. Later: add authentication, audit logs, "apply assignment" button that writes back to a real system, etc.

---

## 6. Evaluation & Ground Truth

- Use the **noisy observed scores** (pm_review etc.) as what the model sees.
- Keep (or re-generate) the **true effectiveness** values for offline evaluation.
- Metrics to consider (from the course):
  - Total portfolio score (the thing we directly optimize).
  - Average team cohesion.
  - % of projects meeting the quality floor.
  - For individuals: how close the chosen assignments are to the true best people (NDCG or precision on top-k true performers).
- Segment-specific analysis: do juniors actually get more novel domains?

---

## 7. Files & Code Organization (Suggested)

```
project-root/
├── data/                              # generated CSVs (gitignored or versioned)
├── src/data_generation/
│   └── generate_dataset.py            # detailed above
├── frontend/
│   ├── public/data/                   # copy of CSVs for demo
│   ├── src/
│   │   ├── lib/
│   │   │   ├── types.ts
│   │   │   ├── dataLoader.ts          # PapaParse + JSON parsing
│   │   │   ├── scorer.ts              # hybrid + segment logic
│   │   │   └── optimizer.ts           # global max + cohesion
│   │   ├── components/                # UI pieces
│   │   └── App.tsx
│   └── ...
├── docs/ or root
│   └── TEAMMATCH_FULL_SPEC.md         # this file
└── (optional) backend/
    └── main.py                        # FastAPI wrapper around scorer + optimizer
```

---

## 8. Next Steps / Polish Ideas (after core works)

- Make weights configurable in the UI.
- Add a "Simulate Outcomes" button that shows what the true effectiveness would have been.
- Better optimizer (use a small ILP solver via PuLP if backend is Python, or ortools, or a proper assignment algorithm).
- Caching / incremental updates when only one project is added.
- Explanations: "This person got a high score because they have strong Python + they succeeded on two previous Cloud projects + good personality match with the current partial team."
- Diversity enforcement in the optimizer.
- Timezone / location soft constraints.

---

**This document is intentionally self-contained.**  
A new Claude (or any AI) should be able to read this file + the three CSVs + the original project brief and re-implement the entire system (data generator + hybrid scorer with segments + global optimizer with cohesion + React frontend) without needing the previous chat history.

Good luck — the global optimization + segment-aware hybrid + explicit cohesion is what makes this different from a generic recommender. Have fun building it!