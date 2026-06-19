# How to Generate the Synthetic Dataset (First Step of the Demo)

## Quick Start

1. Make sure you have Python 3.9+ with pandas and numpy:
   ```bash
   pip install pandas numpy
   ```

2. From the project root folder run:
   ```bash
   python src/data_generation/generate_dataset.py
   ```

   Or on Windows:
   ```powershell
   py -3 src/data_generation/generate_dataset.py
   ```

This will create three files in the `data/` folder:
- `employees.csv` (800 employees)
- `projects.csv` (~300 projects)
- `historical_assignments.csv` (past performance data)

## What the Generator Does

- Creates realistic Google SWE-like data at the agreed scale.
- Handles edge cases (interns/new grads with nullable domains).
- Uses L3–L8 + role_category.
- Full Big Five (1-5) + skills with proficiency.
- Structured education + previous companies.
- Multiple locations + timezone support.
- **Hybrid ground truth** for historical outcomes (see ARCHITECTURE.md for explanation).
- Pre-filled history ready for collaborative filtering signals.

## Output Example (after running)

```
data/
├── employees.csv
├── projects.csv
└── historical_assignments.csv
```

## Next (after data is generated)

We will build:
- Data loaders
- Hybrid scorer (CBF + CF from history + personality)
- Pipeline team recommendation logic
- Simple interface for adding new projects (CLI + CSV batch)

The generator is fully reproducible (fixed seed).
