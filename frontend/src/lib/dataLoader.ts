import Papa from 'papaparse';
import type { Employee, Project, Assignment } from './types';

const DATA_BASE = '/data/';

async function loadCSV<T>(filename: string): Promise<T[]> {
  const res = await fetch(`${DATA_BASE}${filename}`);
  const text = await res.text();
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data as T[];
}

function parseJSONField<T>(value: string | undefined): T {
  if (!value) return [] as any;
  try {
    return JSON.parse(value.replace(/""/g, '"'));
  } catch {
    return [] as any;
  }
}

export async function loadEmployees(): Promise<Employee[]> {
  const raw = await loadCSV<any>('employees.csv');
  return raw.map((r) => ({
    employee_id: r.employee_id,
    name: r.name,
    level: r.level,
    role_category: r.role_category,
    years_experience: parseInt(r.years_experience) || 0,
    primary_domain: r.primary_domain || null,
    skills: parseJSONField(r.skills),
    tech_tags: parseJSONField(r.tech_tags),
    personality_openness: parseInt(r.personality_openness) || 3,
    personality_conscientiousness: parseInt(r.personality_conscientiousness) || 3,
    personality_extraversion: parseInt(r.personality_extraversion) || 3,
    personality_agreeableness: parseInt(r.personality_agreeableness) || 3,
    personality_neuroticism: parseInt(r.personality_neuroticism) || 3,
    education: parseJSONField(r.education),
    previous_companies: parseJSONField(r.previous_companies),
    past_projects_count: parseInt(r.past_projects_count) || 0,
    avg_past_performance: parseFloat(r.avg_past_performance) || 3.5,
    primary_location: r.primary_location,
    timezone_offset: parseInt(r.timezone_offset) || 0,
    can_work_across_timezones: r.can_work_across_timezones === 'True',
    current_staffed: r.current_staffed === 'True',
    available_from: r.available_from,
    diversity_group: r.diversity_group,
  }));
}

export async function loadProjects(): Promise<Project[]> {
  const raw = await loadCSV<any>('projects.csv');
  return raw.map((r) => ({
    project_id: r.project_id,
    title: r.title,
    description: r.description,
    domain: r.domain,
    priority: parseInt(r.priority) || 3,
    required_team_size_min: parseInt(r.required_team_size_min) || 3,
    required_team_size_max: parseInt(r.required_team_size_max) || 6,
    required_team_size_target: parseInt(r.required_team_size_target) || 4,
    required_roles: parseJSONField(r.required_roles),
    required_skills: parseJSONField(r.required_skills),
    tech_requirements: parseJSONField(r.tech_requirements),
    duration_weeks: parseInt(r.duration_weeks) || 12,
    target_start_date: r.target_start_date,
    status: r.status,
    current_staffing_count: parseInt(r.current_staffing_count) || 0,
    current_staffed_ids: parseJSONField(r.current_staffed_ids),
  }));
}

export interface MFMetrics {
  model: string;
  axis: string;
  latent_factors: number;
  regularization: number;
  density_pct: number;
  n_train: number;
  n_test: number;
  rmse_global_mean: number;
  rmse_domain_mean: number;
  rmse_mf: number;
  mf_lift_over_domain_mean_pct: number;
}

/** Learned employee×domain affinity matrix from the Matrix Factorization model. */
export async function loadMFAffinity(): Promise<Record<string, Record<string, number>>> {
  try {
    const raw = await loadCSV<Record<string, string>>('mf_employee_domain.csv');
    const map: Record<string, Record<string, number>> = {};
    for (const row of raw) {
      const id = row.employee_id;
      if (!id) continue;
      const rec: Record<string, number> = {};
      for (const key of Object.keys(row)) {
        if (key === 'employee_id') continue;
        const v = parseFloat(row[key]);
        if (!Number.isNaN(v)) rec[key] = v;
      }
      map[id] = rec;
    }
    return map;
  } catch {
    return {};
  }
}

export async function loadMFMetrics(): Promise<MFMetrics | null> {
  try {
    const res = await fetch(`${DATA_BASE}mf_metrics.json`);
    if (!res.ok) return null;
    return (await res.json()) as MFMetrics;
  } catch {
    return null;
  }
}

export async function loadHistorical(): Promise<Assignment[]> {
  const raw = await loadCSV<any>('historical_assignments.csv');
  return raw.map((r) => ({
    employee_id: r.employee_id,
    project_id: r.project_id,
    pm_review: parseFloat(r.pm_review) || 3,
    peer_collaboration_avg: parseFloat(r.peer_collaboration_avg) || 3,
    delivery_score: parseFloat(r.delivery_score) || 3,
    true_effectiveness: r.true_effectiveness !== undefined && r.true_effectiveness !== ''
      ? parseFloat(r.true_effectiveness)
      : undefined,
  }));
}
