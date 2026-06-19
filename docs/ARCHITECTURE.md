# TeamMatch Demo Architecture

## Overview
TeamMatch is a **hybrid recommender + constrained optimizer** for matching Google software engineering employees to internal projects.

The system follows the two-stage approach from the project brief:
1. **Scoring stage** — Compute compatibility score (0-10) for every employee-project pair using multiple signals.
2. **Optimization stage** — Assign people to open/pipeline projects while respecting hard constraints (team sizes, min quality floor, role/level requirements, diversity).

This repo will implement a **complete working demo** using only synthetic data.

## High-Level Components

### 1. Data Layer (First step — current focus)
- Synthetic but realistic data generator.
- Three main CSVs:
  - `employees.csv` (800 rows)
  - `projects.csv` (~300 rows: historical + open/pipeline)
  - `historical_assignments.csv` (past staffing + outcomes)

**Why these files?**
- `employees.csv` = employee database (skills, level, personality, availability, etc.).
- `projects.csv` = project definitions and requirements.
- `historical_assignments.csv` = the "memory" that enables collaborative filtering and learning (who worked on what + how it performed).

You can:
- Regenerate the full dataset with one script.
- Later support "add new pipeline projects" either interactively or via CSV.

### 2. Recommender / Scoring Layer
Hybrid scoring (directly inspired by the course):
- **Content-Based (CBF)**: Skill match + required role/level/proficiency (using proficiency-weighted cosine or custom scoring).
- **Collaborative Filtering (CF)**: Track record from historical_assignments ("people who performed well on similar projects").
- **Personality / Team Chemistry**: Big Five compatibility with historical team outcomes.
- **Preference & Other signals**.

The hybrid combines them with interpretable weights (easy to tune and explain).

### 3. Optimization / Team Assembly Layer
- Takes scores + constraints.
- Suggests full teams for pipeline projects (respect min/max size, required roles + min levels, no double-staffing, basic diversity).
- Simple greedy + repair or priority-based assignment for the demo (can be upgraded to proper solver later).

### 4. Demo Interface Layer
- Load base employees + history.
- Add projects to "pipeline":
  - Interactive (add one by one with details).
  - Batch via small CSV.
- For each pipeline project:
  - Ranked individual recommendations.
  - Suggested balanced team.
- Show breakdown of scores (skill, history, personality, overall).
- Basic validation against constraints.

Future: simple evaluation dashboard comparing against simulated "true" outcomes.

## Data Generation Principles (from course + brief)

- **Scale**: 800 employees, ~300 projects — large enough for meaningful CF and optimization, but practical.
- **Realism for Google SWE context**:
  - Levels L3–L8 + parallel role_category (Junior/Mid/Senior/.../Project Manager).
  - Rich skills with proficiency 1-5.
  - Full Big Five personality (1-5 per trait).
  - Nullable fields for juniors/interns (no primary_domain, limited history).
  - Distributed teams (multiple locations + timezones).
  - Structured education + standardized previous companies.
- **Recommender-friendly**:
  - Strong content features for CBF.
  - Rich history for CF/track record.
  - Personality vectors + simulated team outcomes.
  - Ground truth signals for evaluation.

## Hybrid Ground Truth Approach (Clarification)

This was asked directly.

**Goal**: We want both:
- Clean "true" effectiveness labels (what actually would have happened).
- Realistic noisy observed data (what reviews/feedback look like in real life).

**How it works during generation**:

For every historical employee-project assignment we create:

1. **True Effectiveness** (internal, clean):
   - Computed deterministically as a weighted combination of the signals we control:
     ```
     true_eff = 0.35 * skill_match 
              + 0.25 * personality_fit 
              + 0.20 * level_experience_fit 
              + 0.15 * domain_relevance 
              + 0.05 * random_small_factor
     ```
   - Adjusted by project difficulty.
   - This is our "ground truth" for backtesting later.

2. **Observed Performance** (what goes into historical_assignments.csv):
   - We simulate real reviewers with noise:
     - `pm_review = clamp(true_eff + random.gauss(0, 0.6), 1, 5)`
     - `peer_collaboration_avg = clamp(true_eff + random.gauss(0, 0.5), 1, 5)`
     - `delivery_score`, etc.
   - This introduces realistic variance, slight bias, and measurement error.

**Benefits**:
- The recommender only "sees" the noisy observed data (just like real systems).
- We can evaluate how well the model surfaces people with high *true* effectiveness.
- Mirrors course concepts: offline evaluation has noise; accuracy ≠ perfect ground truth; popularity/exposure bias exists.

This is much more powerful for a good demo than pure random labels or a single noisy score.

## Current File Structure

```
Google-SW Projects -matching Recommender system/
├── data/                          # Generated CSVs live here
│   ├── employees.csv
│   ├── projects.csv
│   └── historical_assignments.csv
├── src/
│   └── data_generation/
│       └── generate_dataset.py    # Main generator (run this first)
├── docs/
│   └── ARCHITECTURE.md
└── (future)
    ├── src/recommender/
    ├── src/optimizer/
    ├── demo_app.py or streamlit/
    └── requirements.txt
```

## Next Steps (Implementation Order)

1. **Data generator** (current — you are here)
2. Basic data loader + validation
3. Hybrid scorer (CBF + simple CF from history + personality)
4. Constraint-aware team suggester for pipeline projects
5. CLI / simple interface for "add project" + "batch CSV"
6. Polish + documentation

## How to Run (once implemented)

```bash
cd "Google-SW Projects -matching Recommender system"
python src/data_generation/generate_dataset.py
```

This will create the three CSVs in `/data`.

## Design Decisions Captured from Discussion

- 800 employees, ~300 projects
- Google L3-L8 + role_category
- Big Five (1-5) + skills with proficiency
- Nullable domains for early-career
- Structured education + standardized previous companies
- Pre-filled realistic history
- Multi-location support
- Hard constraints on project side
- Support both interactive + CSV pipeline input
- Hybrid scoring + optimization on top

All choices were made to be **directly usable by a recommender system** while staying faithful to the TeamMatch brief and the Recommender Systems course materials (CBF, CF, personality signals, hybrids, evaluation beyond pure accuracy, constraints/optimization).

---
Last updated: 2026-06-18
