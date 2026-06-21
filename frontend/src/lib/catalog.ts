// Single source of truth for the controlled vocabularies the UI must keep in
// lock-step with the dataset generator (src/data_generation/generate_dataset.py).
//
// Skill matching in scorer.ts is exact string equality
// (employee.skills.find(s => s.skill === req.skill)), so a typo silently scores
// 0. Every form that lets a user pick skills, domains, levels or roles MUST draw
// from these lists rather than free text — that keeps project requirements and
// employee profiles in the same namespace.

// Mirror of SKILLS_CATALOG in generate_dataset.py
export const SKILLS_CATALOG = [
  'Python', 'Java', 'Go', 'C++', 'JavaScript/TypeScript',
  'Distributed Systems', 'Machine Learning', 'Data Engineering',
  'Kubernetes', 'BigQuery', 'TensorFlow/PyTorch', 'Android',
  'Cloud (GCP/AWS)', 'Backend APIs', 'Frontend', 'SRE/Observability',
  'Security', 'Databases', 'Performance Optimization', 'Product Sense',
] as const;

// Domains a *project* can belong to (always concrete — no "Undecided").
export const PROJECT_DOMAINS = [
  'Search', 'Ads', 'YouTube', 'Android', 'Cloud', 'AI Platform',
  'Payments', 'Infra', 'Maps', 'Workspace', 'Chrome',
] as const;

// Domains an *employee* can declare — a new hire may still be "Undecided".
export const EMPLOYEE_DOMAINS = [...PROJECT_DOMAINS, 'Undecided'] as const;

// Which skills each domain leans on — mirrors DOMAIN_SKILLS in the generator.
// Used to suggest sensible defaults when a domain is picked in a form.
export const DOMAIN_SKILLS: Record<string, string[]> = {
  Search:        ['Distributed Systems', 'C++', 'Performance Optimization', 'Databases', 'Backend APIs', 'Machine Learning'],
  Ads:           ['Machine Learning', 'BigQuery', 'Data Engineering', 'Backend APIs', 'Java', 'Product Sense'],
  YouTube:       ['Distributed Systems', 'Performance Optimization', 'Backend APIs', 'Frontend', 'Databases', 'Go'],
  Android:       ['Android', 'Java', 'JavaScript/TypeScript', 'Performance Optimization', 'Frontend', 'Security'],
  Cloud:         ['Cloud (GCP/AWS)', 'Kubernetes', 'Distributed Systems', 'Go', 'SRE/Observability', 'Backend APIs'],
  'AI Platform': ['Machine Learning', 'TensorFlow/PyTorch', 'Python', 'Data Engineering', 'Distributed Systems', 'BigQuery'],
  Payments:      ['Security', 'Databases', 'Backend APIs', 'Java', 'Distributed Systems', 'Performance Optimization'],
  Infra:         ['Distributed Systems', 'Kubernetes', 'SRE/Observability', 'Go', 'C++', 'Performance Optimization'],
  Maps:          ['C++', 'Distributed Systems', 'Performance Optimization', 'Machine Learning', 'Backend APIs', 'Databases'],
  Workspace:     ['Frontend', 'JavaScript/TypeScript', 'Backend APIs', 'Databases', 'Product Sense', 'Security'],
  Chrome:        ['C++', 'JavaScript/TypeScript', 'Performance Optimization', 'Frontend', 'Security', 'Distributed Systems'],
};

// Seniority ladder (also the order used for level comparisons in the scorer).
export const LEVELS = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'] as const;

// Role categories an employee can hold (mirrors the values in employees.csv).
export const EMPLOYEE_ROLES = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Project Manager'] as const;

// Role *slots* a project can require. Kept aligned with the role names that
// appear in projects.csv so levelRoleFit's role-name check stays meaningful.
export const PROJECT_ROLES = ['Tech Lead', 'Software Engineer', 'Project Manager'] as const;

export const LOCATIONS = ['US-West', 'US-East', 'EMEA', 'APAC'] as const;
