import type { Employee, Project, Assignment, TeamAssignment } from './types';
import { computeMatchScore } from './scorer';
import type { MFAffinity } from './scorer';

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

export interface ModelEvaluation {
  n: number;                 // number of historical pairs evaluated
  correlation: number;       // Pearson r between predicted score and true effectiveness
  topDecilePrecision: number; // fraction of the model's top-10% picks that were genuinely top-tier
}

/**
 * Honest evaluation against stored ground truth: for every historical assignment
 * that carries a true_effectiveness value, re-score the (employee, project) pair
 * with the live recommender and measure how well predicted scores track reality.
 *
 * This is the evaluation the original prototype could not do, because the
 * generator computed true_effectiveness but never stored it.
 */
export function evaluateModel(
  employees: Employee[],
  projects: Project[],
  historical: Assignment[],
  mfAffinity?: MFAffinity
): ModelEvaluation {
  const empById = new Map(employees.map(e => [e.employee_id, e]));
  const projById = new Map(projects.map(p => [p.project_id, p]));
  const projectDomainMap: Record<string, string> = {};
  projects.forEach(p => { projectDomainMap[p.project_id] = p.domain; });

  const predicted: number[] = [];
  const truth: number[] = [];

  for (const h of historical) {
    if (h.true_effectiveness === undefined) continue;
    const emp = empById.get(h.employee_id);
    const proj = projById.get(h.project_id);
    if (!emp || !proj) continue;
    const ms = computeMatchScore(emp, proj, historical, projectDomainMap, mfAffinity);
    predicted.push(ms.score);
    truth.push(h.true_effectiveness);
  }

  const n = predicted.length;
  const correlation = pearson(predicted, truth);

  // Top-decile precision: among the highest-scored 10% of pairs, how many landed
  // in the genuinely top 25% of true effectiveness?
  let topDecilePrecision = 0;
  if (n >= 10) {
    const idx = predicted.map((_, i) => i);
    const sortedByPred = [...idx].sort((a, b) => predicted[b] - predicted[a]);
    const topK = sortedByPred.slice(0, Math.max(1, Math.floor(n * 0.1)));
    const truthSorted = [...truth].sort((a, b) => b - a);
    const trueThreshold = truthSorted[Math.floor(n * 0.25)];
    const hits = topK.filter(i => truth[i] >= trueThreshold).length;
    topDecilePrecision = hits / topK.length;
  }

  return {
    n,
    correlation: Math.round(correlation * 1000) / 1000,
    topDecilePrecision: Math.round(topDecilePrecision * 100) / 100,
  };
}

export interface PortfolioCoverage {
  totalProjects: number;
  fullyStaffed: number;    // teams that met their minimum size
  partiallyStaffed: number;
  unstaffed: number;
  slotsFilled: number;
  slotsTarget: number;
  coveragePct: number;     // slotsFilled / slotsTarget
  avgCohesion: number;
}

export function computeCoverage(
  assignments: TeamAssignment[],
  pipeline: Project[]
): PortfolioCoverage {
  let fullyStaffed = 0, partiallyStaffed = 0, unstaffed = 0;
  let slotsFilled = 0, slotsTarget = 0;
  let cohesionSum = 0, cohesionCount = 0;

  for (const proj of pipeline) {
    const a = assignments.find(x => x.project_id === proj.project_id);
    const size = a ? a.employees.length : 0;
    slotsFilled += size;
    slotsTarget += proj.required_team_size_target;

    if (size === 0) unstaffed++;
    else if (size >= proj.required_team_size_min) fullyStaffed++;
    else partiallyStaffed++;

    if (a && a.employees.length > 1) {
      cohesionSum += a.cohesion;
      cohesionCount++;
    }
  }

  return {
    totalProjects: pipeline.length,
    fullyStaffed,
    partiallyStaffed,
    unstaffed,
    slotsFilled,
    slotsTarget,
    coveragePct: slotsTarget ? Math.round((slotsFilled / slotsTarget) * 100) : 0,
    avgCohesion: cohesionCount ? Math.round((cohesionSum / cohesionCount) * 100) / 100 : 0,
  };
}
