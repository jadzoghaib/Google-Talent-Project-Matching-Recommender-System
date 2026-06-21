#!/usr/bin/env python3
"""
Matrix Factorization for TeamMatch (Recommender Systems — Unit 6).

Learns latent factors from the *interaction/rating matrix* exactly as taught:
predict a rating as the dot product of a user vector and an item vector (plus
bias terms), and learn those vectors by minimising squared error with SGD and
L2 regularisation (Funk/Koren "SVD"; the family behind the Netflix Prize).

We factorise the **employee × domain** matrix, NOT employee × project, because:
  * employee × project is ~0.9% dense and every *pipeline* project is a brand-new
    (cold-start) item that MF cannot score — the limitation called out in lecture.
  * domains are a small, recurring item set (11), so the matrix is dense enough to
    learn factors, and every project HAS a domain, so predictions generalise to
    brand-new projects.

Rating(employee, domain) = mean of the employee's observed composite reviews
((pm_review + peer_collaboration_avg + delivery_score) / 3) on projects in that
domain.

Outputs (to ../../data/, also copied into the frontend):
  * mf_employee_domain.csv  — predicted affinity for every employee × domain
  * mf_metrics.json         — held-out RMSE for global-mean / domain-mean / MF baselines

Run:
    python src/models/train_matrix_factorization.py
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path

SEED = 42
K = 2              # latent factors (small: only 11 domains, keeps the model from overfitting)
LR = 0.01          # learning rate
REG = 0.10         # L2 regularisation (sparse rows overfit easily, so regularise firmly)
MAX_EPOCHS = 250
PATIENCE = 20      # early stopping on a validation slice
TEST_FRAC = 0.2
VAL_FRAC = 0.15    # carved out of the training set for early stopping

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent.parent / "data"


def rmse(pred, actual):
    return float(np.sqrt(np.mean((np.asarray(pred) - np.asarray(actual)) ** 2)))


def main():
    rng = np.random.default_rng(SEED)
    print("=" * 60)
    print("TeamMatch — Matrix Factorization (employee × domain)")
    print("=" * 60)

    employees = pd.read_csv(DATA_DIR / "employees.csv")
    projects = pd.read_csv(DATA_DIR / "projects.csv")
    hist = pd.read_csv(DATA_DIR / "historical_assignments.csv")

    proj_domain = dict(zip(projects["project_id"], projects["domain"]))
    hist = hist.copy()
    hist["domain"] = hist["project_id"].map(proj_domain)
    hist = hist.dropna(subset=["domain"])
    hist["composite"] = (hist["pm_review"] + hist["peer_collaboration_avg"] + hist["delivery_score"]) / 3.0

    # Rating matrix cells: mean composite review per (employee, domain)
    cells = hist.groupby(["employee_id", "domain"])["composite"].mean().reset_index()

    # Index maps — predict for ALL employees (so the app can look anyone up) and
    # all domains seen in projects.
    emp_ids = list(employees["employee_id"])
    domains = sorted(projects["domain"].unique().tolist())
    emp_idx = {e: i for i, e in enumerate(emp_ids)}
    dom_idx = {d: j for j, d in enumerate(domains)}
    n_users, n_items = len(emp_ids), len(domains)

    obs = np.array([[emp_idx[r.employee_id], dom_idx[r.domain], r.composite]
                    for r in cells.itertuples(index=False)], dtype=float)
    print(f"Employees: {n_users} | Domains: {n_items} | observed (emp,domain) cells: {len(obs)} "
          f"({100 * len(obs) / (n_users * n_items):.1f}% dense)")

    # Train / validation / test split (val is used only for early stopping)
    perm = rng.permutation(len(obs))
    n_test = int(len(obs) * TEST_FRAC)
    test = obs[perm[:n_test]]
    rest = obs[perm[n_test:]]
    n_val = int(len(rest) * VAL_FRAC)
    val = rest[:n_val]
    train = rest[n_val:]
    print(f"Train: {len(train)} | Val: {len(val)} | Test: {len(test)}")

    mu = train[:, 2].mean()

    # ---- Baselines ----------------------------------------------------------
    rmse_global = rmse(np.full(len(test), mu), test[:, 2])

    # Per-domain (item) mean from train
    domain_mean = np.full(n_items, mu)
    for j in range(n_items):
        vals = train[train[:, 1] == j][:, 2]
        if len(vals):
            domain_mean[j] = vals.mean()
    rmse_domain = rmse([domain_mean[int(i)] for i in test[:, 1]], test[:, 2])

    # ---- Matrix Factorization with biases (SGD) -----------------------------
    bu = np.zeros(n_users)
    bi = np.zeros(n_items)
    P = rng.normal(0, 0.1, (n_users, K))
    Q = rng.normal(0, 0.1, (n_items, K))

    def predict(u, i):
        return mu + bu[u] + bi[i] + P[u] @ Q[i]

    def val_rmse():
        return rmse([np.clip(predict(int(u), int(i)), 1, 5) for u, i, _ in val], val[:, 2])

    best_val, best_state, since_best, best_epoch = float("inf"), None, 0, 0
    for epoch in range(MAX_EPOCHS):
        rng.shuffle(train)
        for u, i, r in train:
            u, i = int(u), int(i)
            err = r - predict(u, i)
            bu[u] += LR * (err - REG * bu[u])
            bi[i] += LR * (err - REG * bi[i])
            puu = P[u].copy()
            P[u] += LR * (err * Q[i] - REG * P[u])
            Q[i] += LR * (err * puu - REG * Q[i])

        v = val_rmse()
        if v < best_val - 1e-4:
            best_val, best_epoch, since_best = v, epoch + 1, 0
            best_state = (bu.copy(), bi.copy(), P.copy(), Q.copy())
        else:
            since_best += 1
        if (epoch + 1) % 40 == 0:
            print(f"  epoch {epoch + 1:3d} | val RMSE {v:.4f} (best {best_val:.4f} @ {best_epoch})")
        if since_best >= PATIENCE:
            print(f"  early stop at epoch {epoch + 1} (best val {best_val:.4f} @ epoch {best_epoch})")
            break

    if best_state:                       # restore best-validation weights
        bu, bi, P, Q = best_state

    mf_test_pred = [np.clip(predict(int(u), int(i)), 1, 5) for u, i, _ in test]
    rmse_mf = rmse(mf_test_pred, test[:, 2])

    print("\nHeld-out test RMSE (lower is better):")
    print(f"  global mean baseline : {rmse_global:.4f}")
    print(f"  domain mean baseline : {rmse_domain:.4f}")
    print(f"  matrix factorization : {rmse_mf:.4f}")
    lift = 100 * (rmse_domain - rmse_mf) / rmse_domain
    print(f"  -> MF improves on the domain-mean baseline by {lift:.1f}%")

    # ---- Export predicted affinity, ONLY for employees with observed history ----
    # MF still generalises across domains WITHIN a row (the lecture point: aptitude
    # transfers between related domains), so every exported employee gets all 11
    # domain predictions. But employees with NO history get NO row — they are a
    # genuine cold-start cohort whose CF signal correctly falls back to the
    # historical average (or the onboarding assessment once they take it).
    observed_emps = set(cells["employee_id"])
    export_ids = [e for e in emp_ids if e in observed_emps]
    pred_rows = []
    for e in export_ids:
        u = emp_idx[e]
        pred_rows.append([np.clip(predict(u, i), 1, 5) for i in range(n_items)])

    out = pd.DataFrame(np.round(np.array(pred_rows), 3), columns=domains)
    out.insert(0, "employee_id", export_ids)
    out_path = DATA_DIR / "mf_employee_domain.csv"
    out.to_csv(out_path, index=False)
    print(f"  exported MF rows for {len(export_ids)}/{n_users} employees "
          f"({n_users - len(export_ids)} cold-start employees have no row)")

    metrics = {
        "model": "matrix_factorization_biased_sgd",
        "axis": "employee_x_domain",
        "latent_factors": K,
        "learning_rate": LR,
        "regularization": REG,
        "epochs_trained": best_epoch,
        "n_employees": n_users,
        "n_domains": n_items,
        "n_observed_cells": len(obs),
        "density_pct": round(100 * len(obs) / (n_users * n_items), 2),
        "n_train": len(train),
        "n_test": len(test),
        "rmse_global_mean": round(rmse_global, 4),
        "rmse_domain_mean": round(rmse_domain, 4),
        "rmse_mf": round(rmse_mf, 4),
        "mf_lift_over_domain_mean_pct": round(lift, 2),
    }
    (DATA_DIR / "mf_metrics.json").write_text(json.dumps(metrics, indent=2))

    print(f"\nWrote {out_path}")
    print(f"Wrote {DATA_DIR / 'mf_metrics.json'}")
    print("=" * 60)


if __name__ == "__main__":
    main()
