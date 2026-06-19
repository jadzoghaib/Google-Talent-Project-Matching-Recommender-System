#!/usr/bin/env python3
"""
TeamMatch Synthetic Dataset Generator

Generates realistic data for the Google internal project staffing recommender demo.

Outputs (to ../../data/ relative to this file):
- employees.csv               (800 rows)
- projects.csv                (~300 rows)
- historical_assignments.csv  (past performance records + stored ground truth)

This data is specifically designed to support a hybrid recommender system:
- Rich content features for Content-Based Filtering (skills, levels, domains)
- Historical performance for Collaborative Filtering / track record
- Big Five personality for team chemistry signals
- Constraints for the optimization layer
- Noisy observed outcomes + a stored clean "true_effectiveness" for honest evaluation

Realism improvements in this version:
- Human-looking employee names (not "Employee 1")
- Skills are correlated with the employee's primary domain (a Cloud engineer is
  far more likely to know Kubernetes than Android), so content-based matches mean
  something instead of being uniform noise.
- Real-sounding project titles per domain.
- Historical assignments are biased toward domain-relevant people (so the
  collaborative-filtering / domain-scoped track-record signal is meaningful).
- "true_effectiveness" is STORED in the output so the recommender can be evaluated
  against ground truth, not only against noisy observed reviews.

Run:
    python src/data_generation/generate_dataset.py
"""

import json
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

# =============================================================================
# CONFIGURATION - Easy to tweak for different demo sizes
# =============================================================================
SEED = 42
N_EMPLOYEES = 800
N_PROJECTS = 300          # ~165 completed + ~60 active + ~75 pipeline
N_HISTORICAL_ASSIGNMENTS = 6000   # Denser interaction history so the employee×domain
                                  # rating matrix supports learnable latent factors (MF)

# Output directory (relative to this script: src/data_generation -> ../../data)
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# =============================================================================
# CATALOGS (standardized for realism and easy matching later)
# =============================================================================
LEVELS = ["L3", "L4", "L5", "L6", "L7", "L8"]
ROLE_CATEGORIES = ["Junior", "Mid", "Senior", "Staff", "Principal", "Project Manager"]

DOMAINS = [
    "Search", "Ads", "YouTube", "Android", "Cloud", "AI Platform",
    "Payments", "Infra", "Maps", "Workspace", "Chrome", "Undecided"
]

SKILLS_CATALOG = [
    "Python", "Java", "Go", "C++", "JavaScript/TypeScript",
    "Distributed Systems", "Machine Learning", "Data Engineering",
    "Kubernetes", "BigQuery", "TensorFlow/PyTorch", "Android",
    "Cloud (GCP/AWS)", "Backend APIs", "Frontend", "SRE/Observability",
    "Security", "Databases", "Performance Optimization", "Product Sense"
]

# Which skills each domain leans on. Used to make skill profiles coherent with
# the domain an engineer works in (content-based realism). Skills not listed can
# still appear, just with lower probability.
DOMAIN_SKILLS = {
    "Search":      ["Distributed Systems", "C++", "Performance Optimization", "Databases", "Backend APIs", "Machine Learning"],
    "Ads":         ["Machine Learning", "BigQuery", "Data Engineering", "Backend APIs", "Java", "Product Sense"],
    "YouTube":     ["Distributed Systems", "Performance Optimization", "Backend APIs", "Frontend", "Databases", "Go"],
    "Android":     ["Android", "Java", "JavaScript/TypeScript", "Performance Optimization", "Frontend", "Security"],
    "Cloud":       ["Cloud (GCP/AWS)", "Kubernetes", "Distributed Systems", "Go", "SRE/Observability", "Backend APIs"],
    "AI Platform": ["Machine Learning", "TensorFlow/PyTorch", "Python", "Data Engineering", "Distributed Systems", "BigQuery"],
    "Payments":    ["Security", "Databases", "Backend APIs", "Java", "Distributed Systems", "Performance Optimization"],
    "Infra":       ["Distributed Systems", "Kubernetes", "SRE/Observability", "Go", "C++", "Performance Optimization"],
    "Maps":        ["C++", "Distributed Systems", "Performance Optimization", "Machine Learning", "Backend APIs", "Databases"],
    "Workspace":   ["Frontend", "JavaScript/TypeScript", "Backend APIs", "Databases", "Product Sense", "Security"],
    "Chrome":      ["C++", "JavaScript/TypeScript", "Performance Optimization", "Frontend", "Security", "Distributed Systems"],
}

LOCATIONS = ["US-West", "US-East", "EMEA", "APAC"]
UNIVERSITIES = [
    "Stanford", "MIT", "UC Berkeley", "Carnegie Mellon", "Georgia Tech",
    "ETH Zurich", "University of Waterloo", "UIUC", "University of Toronto",
    "Other Top School"
]
PREVIOUS_COMPANIES = [
    "Google", "Meta", "Amazon", "Microsoft", "Apple", "Uber", "Stripe",
    "OpenAI", "Startup", "Ex-Google (returner)"
]

# Name pools for realistic, diverse employee names.
FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Wei", "Ling", "Hiroshi", "Yuki", "Arjun", "Priya", "Rohan", "Ananya",
    "Mohammed", "Fatima", "Omar", "Layla", "Carlos", "Sofia", "Diego", "Valentina",
    "Sofia", "Mateo", "Chen", "Mei", "Jin", "Hana", "Ravi", "Deepa",
    "Daniel", "Sarah", "Matthew", "Karen", "Anthony", "Nancy", "Kevin", "Lisa",
    "Olusegun", "Amara", "Kwame", "Zainab", "Ivan", "Olga", "Lars", "Astrid",
    "Noah", "Emma", "Liam", "Olivia", "Ethan", "Ava", "Lucas", "Mia",
]
LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Wang", "Li", "Zhang", "Chen", "Liu", "Yang", "Huang", "Zhao",
    "Patel", "Kumar", "Sharma", "Singh", "Gupta", "Mehta", "Reddy", "Nair",
    "Tanaka", "Suzuki", "Sato", "Kim", "Park", "Choi", "Nguyen", "Tran",
    "Okafor", "Adeyemi", "Mensah", "Diallo", "Mwangi", "Abebe",
    "Petrov", "Ivanov", "Kowalski", "Novak", "Andersson", "Larsen", "Schmidt", "Mueller",
    "Rossi", "Russo", "Ferrari", "Costa", "Silva", "Santos",
]

# Project name building blocks for realistic titles.
PROJECT_ADJECTIVES = [
    "Next-Gen", "Real-Time", "Unified", "Federated", "Adaptive", "Distributed",
    "Privacy-First", "Low-Latency", "Multi-Region", "Self-Serve", "Streaming",
    "Generative", "On-Device", "Cross-Platform", "Zero-Trust", "Petabyte-Scale",
]
PROJECT_NOUNS = {
    "Search":      ["Ranking Engine", "Query Understanding", "Index Pipeline", "Retrieval Stack", "Snippet Service"],
    "Ads":         ["Bidding Platform", "Attribution Engine", "Auction Service", "Targeting Pipeline", "Budget Optimizer"],
    "YouTube":     ["Recommendation Engine", "Live Transcoder", "Creator Studio", "Watch-Next Service", "Ingest Pipeline"],
    "Android":     ["Runtime", "App Framework", "Notification Service", "Battery Optimizer", "Permissions Layer"],
    "Cloud":       ["Control Plane", "Autoscaler", "Managed Database", "Networking Fabric", "Serverless Runtime"],
    "AI Platform": ["Model Serving Stack", "Training Orchestrator", "Feature Store", "Inference Gateway", "Eval Harness"],
    "Payments":    ["Fraud Detection", "Settlement Engine", "Wallet Service", "Risk Scoring", "Checkout Flow"],
    "Infra":       ["Scheduler", "Service Mesh", "Build System", "Observability Stack", "Storage Layer"],
    "Maps":        ["Routing Engine", "Tile Renderer", "Places Service", "Traffic Predictor", "Geocoder"],
    "Workspace":   ["Collaboration Engine", "Docs Sync Service", "Calendar Backend", "Sharing Layer", "Editor Core"],
    "Chrome":      ["Rendering Engine", "Extension Platform", "Sandbox Layer", "Sync Service", "DevTools Backend"],
}

# Big Five trait names (full OCEAN)
BIG_FIVE_TRAITS = [
    "personality_openness",
    "personality_conscientiousness",
    "personality_extraversion",
    "personality_agreeableness",
    "personality_neuroticism"
]

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def set_seed(seed=SEED):
    random.seed(seed)
    np.random.seed(seed)

def sample_name(used: set) -> str:
    """Return a realistic, unique-ish full name."""
    for _ in range(20):
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        if name not in used:
            used.add(name)
            return name
    # Fall back to a numbered suffix if we somehow exhaust combinations
    name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)} {len(used)}"
    used.add(name)
    return name

def sample_big_five():
    """Sample Big Five scores 1-5. Mean around 3.5 with realistic variance."""
    scores = {}
    for trait in BIG_FIVE_TRAITS:
        raw = np.random.normal(3.5, 0.85)
        scores[trait] = int(np.clip(round(raw), 1, 5))
    return scores

def sample_skills(n_skills: int, domain: str = None, seniority: float = 0.5):
    """
    Return list of {skill, proficiency} dicts.

    If a domain is given, ~65% of the skills are drawn from that domain's core
    skill set so that engineers look coherent (a Cloud engineer knows Kubernetes).
    `seniority` (0-1) nudges proficiency upward for more senior people.
    """
    core = DOMAIN_SKILLS.get(domain, []) if domain else []
    selected = []

    if core:
        n_core = min(len(core), max(1, round(n_skills * 0.65)))
        selected.extend(random.sample(core, n_core))

    # Fill the rest from the full catalog (excluding already-picked)
    remaining_pool = [s for s in SKILLS_CATALOG if s not in selected]
    n_fill = max(0, n_skills - len(selected))
    if n_fill > 0:
        selected.extend(random.sample(remaining_pool, min(n_fill, len(remaining_pool))))

    skills = []
    for skill in selected:
        # Core-domain skills + more senior people skew to higher proficiency.
        is_core = skill in core
        base = 3.2 + (1.0 * seniority) + (0.6 if is_core else 0.0)
        prof = int(np.clip(round(np.random.normal(base, 1.0)), 1, 5))
        skills.append({"skill": skill, "proficiency": prof})
    return skills

def compute_skill_match(employee_skills, project_req_skills):
    """Content-based skill match score (0 to 1). Reused for ground-truth realism."""
    if not project_req_skills:
        return 0.6
    emp_dict = {s["skill"]: s["proficiency"] for s in employee_skills}
    scores = []
    for req in project_req_skills:
        skill = req["skill"]
        min_prof = req.get("min_proficiency", 3)
        weight = req.get("weight", 1.0)
        emp_prof = emp_dict.get(skill, 0)
        match = min(emp_prof / max(min_prof, 1), 1.5)
        scores.append(match * weight)
    return float(np.clip(np.mean(scores) if scores else 0.5, 0, 1))

def sample_education():
    return {
        "degree": random.choice(["BS", "MS", "PhD"]),
        "field": random.choice(["Computer Science", "Computer Engineering",
                                "Electrical Engineering", "Math", "Data Science"]),
        "university": random.choice(UNIVERSITIES)
    }

# =============================================================================
# EMPLOYEE GENERATION
# =============================================================================
def generate_employees(n=N_EMPLOYEES):
    print(f"Generating {n} employees...")
    employees = []
    used_names = set()

    # Level distribution - realistic Google SWE skew (more mid-levels)
    level_weights = [0.12, 0.28, 0.30, 0.18, 0.09, 0.03]

    for i in range(n):
        level = random.choices(LEVELS, weights=level_weights)[0]
        level_idx = LEVELS.index(level)
        seniority = level_idx / (len(LEVELS) - 1)   # 0 (L3) .. 1 (L8)

        # Role category derived from level but with some variation
        if level in ["L3", "L4"]:
            role = random.choice(["Junior", "Mid"])
        elif level in ["L5", "L6"]:
            role = random.choice(["Mid", "Senior"])
        else:
            role = random.choice(["Senior", "Staff", "Principal", "Project Manager"])

        # Years experience roughly correlated with level
        base_yoe = {"L3": 0, "L4": 2, "L5": 4, "L6": 7, "L7": 10, "L8": 14}[level]
        years_experience = max(0, int(np.random.normal(base_yoe, 2)))

        # Primary domain - many early career have none yet
        if level == "L3" and random.random() < 0.45:
            primary_domain = None
        else:
            primary_domain = random.choice(DOMAINS[:-1])  # exclude "Undecided"

        # Skills - correlated with domain + seniority
        n_sk = random.randint(3, 5) if level in ["L3", "L4"] else random.randint(6, 10)
        skills = sample_skills(n_sk, domain=primary_domain, seniority=seniority)

        # tech_tags drawn from the same skill universe (lightweight extra signal)
        tech_tags = random.sample(SKILLS_CATALOG, random.randint(2, 5))

        personality = sample_big_five()
        edu = sample_education()
        n_prev = random.randint(0, 3) if level_idx < 2 else random.randint(1, 5)
        prev_companies = random.sample(PREVIOUS_COMPANIES, n_prev)

        location = random.choice(LOCATIONS)
        tz_offset = {"US-West": -8, "US-East": -5, "EMEA": 1, "APAC": 8}[location]

        # Availability - ~65% currently staffed, freeing up at a future date
        current_staffed = random.random() < 0.65
        if current_staffed:
            available_from = (datetime.now() + timedelta(days=random.randint(30, 180))).date().isoformat()
        else:
            available_from = datetime.now().date().isoformat()

        emp = {
            "employee_id": f"E{10000 + i}",
            "name": sample_name(used_names),
            "level": level,
            "role_category": role,
            "years_experience": years_experience,
            "primary_domain": primary_domain,
            "skills": json.dumps(skills),
            "tech_tags": json.dumps(tech_tags),
            **personality,
            "education": json.dumps(edu),
            "previous_companies": json.dumps(prev_companies),
            "past_projects_count": max(0, int(np.random.normal(years_experience * 0.7, 2))),
            "avg_past_performance": round(float(np.clip(np.random.normal(3.9, 0.6), 2.5, 5.0)), 2),
            "primary_location": location,
            "timezone_offset": tz_offset,
            "can_work_across_timezones": random.random() > 0.25,
            "current_staffed": current_staffed,
            "available_from": available_from,
            "diversity_group": random.choice(["A", "B", "C", "D"])
        }
        employees.append(emp)

    return pd.DataFrame(employees)

# =============================================================================
# PROJECT GENERATION
# =============================================================================
def project_title(domain: str, idx: int) -> str:
    """Build a realistic, varied project title for the given domain."""
    adj = random.choice(PROJECT_ADJECTIVES)
    noun = random.choice(PROJECT_NOUNS.get(domain, ["Platform", "Service", "Pipeline"]))
    # Occasionally tag a version to add variety
    suffix = random.choice(["", "", "", " v2", " 2.0", " Rewrite"])
    return f"{adj} {noun}{suffix}"

def generate_projects(n=N_PROJECTS):
    print(f"Generating {n} projects...")
    projects = []
    domains = DOMAINS[:-1]  # no Undecided

    for i in range(n):
        domain = random.choice(domains)
        priority = random.randint(1, 5)

        # Team size
        base_size = random.randint(4, 12)
        size_min = max(3, base_size - 2)
        size_max = base_size + random.randint(1, 3)
        size_target = random.randint(size_min, size_max)

        # Required roles (with min level)
        required_roles = []
        n_leads = 1 if random.random() > 0.3 else 0
        if n_leads:
            min_lead_level = random.choice(["L5", "L6", "L7"])
            required_roles.append({"role": "Tech Lead", "min_level": min_lead_level, "count": 1})

        n_eng = max(3, size_target - len(required_roles))
        min_eng_level = random.choice(["L3", "L4", "L5"])
        required_roles.append({"role": "Software Engineer", "min_level": min_eng_level, "count": n_eng})

        # Required skills - drawn mostly from the domain's core skills so the
        # project's needs line up with what domain engineers actually have.
        core = DOMAIN_SKILLS.get(domain, SKILLS_CATALOG)
        n_req_skills = random.randint(3, 6)
        pool = list(dict.fromkeys(core + random.sample(SKILLS_CATALOG, 4)))  # core first, de-duped
        chosen = pool[:max(1, min(n_req_skills, len(pool)))]
        req_skills = [{
            "skill": sk,
            "min_proficiency": random.randint(3, 4),
            "weight": round(random.uniform(0.6, 1.2), 2)
        } for sk in chosen]

        # Status mix
        if i < int(n * 0.55):
            status = "completed"
        elif i < int(n * 0.75):
            status = "active"
        else:
            status = "pipeline"   # the interesting ones for the demo

        proj = {
            "project_id": f"P{1000 + i}",
            "title": project_title(domain, i),
            "description": f"A high-impact {domain} effort focused on shipping production-grade infrastructure.",
            "domain": domain,
            "priority": priority,
            "required_team_size_min": size_min,
            "required_team_size_max": size_max,
            "required_team_size_target": size_target,
            "required_roles": json.dumps(required_roles),
            "required_skills": json.dumps(req_skills),
            "tech_requirements": json.dumps(random.sample(SKILLS_CATALOG, random.randint(1, 4))),
            "duration_weeks": random.randint(8, 52),
            "target_start_date": (datetime.now() + timedelta(days=random.randint(7, 120))).date().isoformat(),
            "status": status,
            "current_staffing_count": 0 if status == "pipeline" else random.randint(2, size_target),
            "current_staffed_ids": "[]"
        }
        projects.append(proj)

    return pd.DataFrame(projects)

# =============================================================================
# HISTORICAL ASSIGNMENTS + STORED HYBRID GROUND TRUTH
# =============================================================================
def generate_historical_assignments(employees_df, projects_df, n_assignments=N_HISTORICAL_ASSIGNMENTS):
    """
    Generate past assignments with the HYBRID GROUND TRUTH approach.

    For every assignment we store BOTH:
    - Observed noisy reviews (pm_review, peer_collaboration_avg, delivery_score) -
      what the recommender actually trains on, and
    - The clean "true_effectiveness" - so the model can be evaluated honestly
      against ground truth instead of only against noisy self-referential labels.

    Assignments are biased toward domain-relevant employees so the domain-scoped
    collaborative-filtering / track-record signal is meaningful rather than random.
    """
    print(f"Generating ~{n_assignments} historical assignments with stored ground truth...")

    historical_projects = projects_df[projects_df["status"].isin(["completed", "active"])].copy()
    assignments = []
    emp_records = employees_df.to_dict("records")
    emp_by_id = {e["employee_id"]: e for e in emp_records}

    # Index employees by primary domain to bias realistic staffing
    emp_ids_by_domain = {}
    for e in emp_records:
        emp_ids_by_domain.setdefault(e["primary_domain"], []).append(e["employee_id"])
    all_emp_ids = [e["employee_id"] for e in emp_records]

    proj_reqs = {}
    for _, p in historical_projects.iterrows():
        proj_reqs[p["project_id"]] = {
            "domain": p["domain"],
            "required_skills": json.loads(p["required_skills"]),
        }
    proj_ids = list(proj_reqs.keys())

    def pick_employee(domain):
        """~50% of the time pull someone whose primary domain matches the project;
        the rest are cross-domain so employees accrue ratings in several domains
        (denser employee×domain matrix => learnable latent factors for MF)."""
        if random.random() < 0.50 and emp_ids_by_domain.get(domain):
            return random.choice(emp_ids_by_domain[domain])
        return random.choice(all_emp_ids)

    seen_pairs = set()
    assigned_count = 0
    guard = 0
    while assigned_count < n_assignments and guard < n_assignments * 5:
        guard += 1
        proj_id = random.choice(proj_ids)
        proj = proj_reqs[proj_id]
        emp_id = pick_employee(proj["domain"])
        if (emp_id, proj_id) in seen_pairs:
            continue
        seen_pairs.add((emp_id, proj_id))
        emp = emp_by_id[emp_id]

        # Clean true effectiveness (the "hybrid ground truth"), on a 1-5 scale.
        skill_m = compute_skill_match(json.loads(emp["skills"]), proj["required_skills"])

        pers_penalty = sum(abs(emp[t] - 3.5) * 0.1 for t in BIG_FIVE_TRAITS)
        pers_fit = max(0.3, min(1.0, 0.7 + random.gauss(0, 0.15) - pers_penalty * 0.03))

        level_fit = 0.6 + (LEVELS.index(emp["level"]) / 10.0) * 0.6
        domain_bonus = 0.15 if emp.get("primary_domain") == proj["domain"] else 0.0

        true_eff_01 = (
            0.40 * skill_m +
            0.25 * pers_fit +
            0.20 * level_fit +
            0.15 * (0.5 + domain_bonus)
        )
        # Map the 0-1 composite onto the 1-5 review scale and add small bias noise.
        true_eff = float(np.clip(1.0 + 4.0 * true_eff_01 + random.gauss(0, 0.15), 1.0, 5.0))

        # Noisy observed reviews (what the recommender consumes)
        pm_review = float(np.clip(round(true_eff + random.gauss(0, 0.55), 1), 1, 5))
        peer_collab = float(np.clip(round(true_eff + random.gauss(0, 0.50), 1), 1, 5))
        delivery = float(np.clip(round(true_eff + random.gauss(0, 0.60), 1), 1, 5))

        role_on_proj = random.choice(["Software Engineer", "Tech Lead", "SRE"])

        assignments.append({
            "employee_id": emp_id,
            "project_id": proj_id,
            "role_on_project": role_on_proj,
            "level_at_time": emp["level"],
            "pm_review": pm_review,
            "peer_collaboration_avg": peer_collab,
            "delivery_score": delivery,
            "was_successful": 1 if (pm_review + peer_collab + delivery) / 3 > 3.6 else 0,
            "true_effectiveness": round(true_eff, 3),   # STORED for honest evaluation
        })
        assigned_count += 1
        if assigned_count % 500 == 0:
            print(f"  ... {assigned_count} assignments generated")

    return pd.DataFrame(assignments)

# =============================================================================
# MAIN
# =============================================================================
def main():
    set_seed(SEED)
    print("=" * 60)
    print("TeamMatch Synthetic Dataset Generator")
    print(f"Employees={N_EMPLOYEES} | Projects={N_PROJECTS}")
    print("=" * 60)

    employees = generate_employees()
    projects = generate_projects()
    assignments = generate_historical_assignments(employees, projects)

    employees_path = DATA_DIR / "employees.csv"
    projects_path = DATA_DIR / "projects.csv"
    assignments_path = DATA_DIR / "historical_assignments.csv"

    employees.to_csv(employees_path, index=False)
    projects.to_csv(projects_path, index=False)
    assignments.to_csv(assignments_path, index=False)

    print("\n" + "=" * 60)
    print("Generation complete!")
    print(f"  employees:              {len(employees):,} rows -> {employees_path}")
    print(f"  projects:               {len(projects):,} rows -> {projects_path}")
    print(f"  historical_assignments: {len(assignments):,} rows -> {assignments_path}")

    # Quick sanity stats
    corr = assignments[["true_effectiveness", "pm_review"]].corr().iloc[0, 1]
    print(f"\n  Sanity: corr(true_effectiveness, pm_review) = {corr:.3f} (noisy but signal-bearing)")
    print(f"  Pipeline projects (for the demo): {(projects['status'] == 'pipeline').sum()}")
    print("=" * 60)

if __name__ == "__main__":
    main()
