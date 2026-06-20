import type { Employee, Project, Assignment, MatchScore, UserSegment } from './types';

export const WEIGHTS = {
  exploration: { skill: 0.40, history: 0.10, personality: 0.25, level: 0.10, novelty: 0.15 },
  exploitation: { skill: 0.35, history: 0.40, personality: 0.15, level: 0.10, novelty: 0.00 },
  balanced: { skill: 0.35, history: 0.35, personality: 0.20, level: 0.10, novelty: 0.00 },
};

const LEVEL_ORDER = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'];

/**
 * Route an employee to a scoring segment using a *smooth* seniority signal
 * instead of brittle hard cutoffs. We blend level and track record so that
 * borderline cases land sensibly (e.g. an L5 with a deep project history is
 * treated as exploitation, while a freshly promoted L7 with little history
 * stays balanced). Returns the segment plus the underlying 0-1 signal.
 */
export function getSegmentInfo(employee: Employee): { segment: UserSegment; seniority: number } {
  const levelIdx = Math.max(0, LEVEL_ORDER.indexOf(employee.level));
  const levelSignal = levelIdx / (LEVEL_ORDER.length - 1);        // L3=0 .. L8=1
  const experienceSignal = Math.min(employee.past_projects_count / 8, 1);
  const seniority = 0.5 * levelSignal + 0.5 * experienceSignal;

  let segment: UserSegment;
  if (seniority < 0.33) segment = 'exploration';
  else if (seniority > 0.6) segment = 'exploitation';
  else segment = 'balanced';

  return { segment, seniority };
}

function getSegment(employee: Employee): UserSegment {
  return getSegmentInfo(employee).segment;
}

function skillMatch(employee: Employee, project: Project): number {
  if (!project.required_skills?.length) return 0.6;
  let total = 0;
  let weightSum = 0;
  for (const req of project.required_skills) {
    const empSkill = employee.skills.find(s => s.skill === req.skill);
    const empProf = empSkill ? empSkill.proficiency : 0;
    const contrib = Math.min(empProf / Math.max(req.min_proficiency, 1), 1.3);
    total += contrib * req.weight;
    weightSum += req.weight;
  }
  return weightSum > 0 ? Math.min(total / weightSum, 1) : 0.6;
}

function historyScore(employee: Employee, project: Project, history: Assignment[], projectDomainMap?: Record<string, string>): number {
  let relevant = history.filter(
    a => a.employee_id === employee.employee_id && a.project_id !== project.project_id
  );

  if (projectDomainMap) {
    const targetDomain = project.domain;
    relevant = relevant.filter(a => {
      const histDomain = projectDomainMap[a.project_id];
      return histDomain === targetDomain;
    });
  }

  if (relevant.length === 0) return 0.5;

  const avg = relevant.reduce((sum, a) => sum + (a.pm_review + a.peer_collaboration_avg + a.delivery_score) / 3, 0) / relevant.length;
  return Math.min(Math.max((avg - 1) / 4, 0), 1);
}

function personalityFit(employee: Employee): number {
  // Simple: higher average Big Five (excluding neuroticism which is inverse) is better for team fit
  const avg = (
    employee.personality_openness +
    employee.personality_conscientiousness +
    employee.personality_extraversion +
    employee.personality_agreeableness +
    (6 - employee.personality_neuroticism)
  ) / 5;
  return (avg - 1) / 4; // 0-1
}

function levelRoleFit(employee: Employee, project: Project): number {
  if (!project.required_roles?.length) return 0.7;

  const empLevelIdx = ['L3','L4','L5','L6','L7','L8'].indexOf(employee.level);
  let bestFit = 0;

  for (const req of project.required_roles) {
    const reqIdx = ['L3','L4','L5','L6','L7','L8'].indexOf(req.min_level);
    if (empLevelIdx >= reqIdx && employee.role_category.toLowerCase().includes(req.role.toLowerCase().split(' ')[0])) {
      bestFit = Math.max(bestFit, 1.0);
    } else if (empLevelIdx >= reqIdx) {
      bestFit = Math.max(bestFit, 0.7);
    }
  }
  return bestFit || 0.3;
}

function noveltyBonus(employee: Employee, project: Project): number {
  if (!employee.primary_domain || employee.primary_domain === project.domain) return 0.4;
  return 1.0;
}

// Predicted employee×domain affinity from the Matrix Factorization model
// (employee_id -> { domain -> predicted rating 1..5 }). Loaded from mf_employee_domain.csv.
export type MFAffinity = Record<string, Record<string, number>>;

export function computeMatchScore(
  employee: Employee,
  project: Project,
  history: Assignment[],
  projectDomainMap?: Record<string, string>,
  mfAffinity?: MFAffinity
): MatchScore {
  const segment = getSegment(employee);
  const weights = WEIGHTS[segment];

  const skill = skillMatch(employee, project);

  // Collaborative-filtering signal. Prefer the *learned* Matrix Factorization
  // prediction for this (employee, domain); fall back to the domain-scoped
  // historical average when the MF model has no value (e.g. MF not loaded).
  const mfPred = mfAffinity?.[employee.employee_id]?.[project.domain];
  const usedMF = mfPred != null && !Number.isNaN(mfPred);
  const cfSignal = usedMF
    ? Math.max(0, Math.min(1, (mfPred - 1) / 4))
    : historyScore(employee, project, history, projectDomainMap);

  const pers = personalityFit(employee);
  const level = levelRoleFit(employee, project);
  const nov = noveltyBonus(employee, project);

  const base =
    weights.skill * skill +
    weights.history * cfSignal +
    weights.personality * pers +
    weights.level * level +
    (weights.novelty || 0) * nov;

  const score = Math.max(1, Math.min(10, Math.round(base * 10 * 10) / 10));

  return {
    employee_id: employee.employee_id,
    project_id: project.project_id,
    score,
    breakdown: {
      skill: Math.round(skill * 100) / 100,
      history: Math.round(cfSignal * 100) / 100,
      personality: Math.round(pers * 100) / 100,
      level: Math.round(level * 100) / 100,
      novelty: weights.novelty ? Math.round(nov * 100) / 100 : undefined,
    },
    segment,
    usedMF,
    mfRawPred: usedMF ? Math.round((mfPred as number) * 100) / 100 : undefined,
  };
}
