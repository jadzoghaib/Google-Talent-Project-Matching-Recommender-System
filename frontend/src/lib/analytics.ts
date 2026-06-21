// Pure aggregation helpers powering the analytics strips on the Projects and
// People tabs. Kept side-effect-free so they are trivial to reason about / test.
import type { Employee, Project } from './types';

export interface ProjectAnalytics {
  total: number;
  byStatus: Record<string, number>;
  byDomain: Array<{ label: string; value: number }>;
  byPriority: Record<number, number>;
  openHeadcountDemand: number; // sum of target sizes across pipeline projects
  avgTeamTarget: number;
}

export function computeProjectAnalytics(projects: Project[]): ProjectAnalytics {
  const byStatus: Record<string, number> = {};
  const domainCount: Record<string, number> = {};
  const byPriority: Record<number, number> = {};
  let openHeadcountDemand = 0;
  let sumTarget = 0;

  for (const p of projects) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    domainCount[p.domain] = (domainCount[p.domain] ?? 0) + 1;
    byPriority[p.priority] = (byPriority[p.priority] ?? 0) + 1;
    sumTarget += p.required_team_size_target;
    if (p.status === 'pipeline') openHeadcountDemand += p.required_team_size_target;
  }

  const byDomain = Object.entries(domainCount)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return {
    total: projects.length,
    byStatus,
    byDomain,
    byPriority,
    openHeadcountDemand,
    avgTeamTarget: projects.length ? Math.round((sumTarget / projects.length) * 10) / 10 : 0,
  };
}

export interface PeopleAnalytics {
  total: number;
  availableNow: number;
  byLevel: Array<{ label: string; value: number }>;
  byDomain: Array<{ label: string; value: number }>;
  byRole: Record<string, number>;
  avgPerformance: number;
  avgYears: number;
  topSkills: Array<{ label: string; value: number }>;
}

export function computePeopleAnalytics(employees: Employee[]): PeopleAnalytics {
  const now = new Date();
  const levelCount: Record<string, number> = {};
  const domainCount: Record<string, number> = {};
  const roleCount: Record<string, number> = {};
  const skillCount: Record<string, number> = {};
  let availableNow = 0, sumPerf = 0, sumYears = 0;

  for (const e of employees) {
    levelCount[e.level] = (levelCount[e.level] ?? 0) + 1;
    const dom = e.primary_domain ?? 'Undecided';
    domainCount[dom] = (domainCount[dom] ?? 0) + 1;
    roleCount[e.role_category] = (roleCount[e.role_category] ?? 0) + 1;
    for (const s of e.skills) skillCount[s.skill] = (skillCount[s.skill] ?? 0) + 1;
    if (!e.current_staffed && new Date(e.available_from) <= now) availableNow++;
    sumPerf += e.avg_past_performance;
    sumYears += e.years_experience;
  }

  const order = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'];
  const byLevel = order.filter(l => levelCount[l]).map(l => ({ label: l, value: levelCount[l] }));
  const byDomain = Object.entries(domainCount)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const topSkills = Object.entries(skillCount)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return {
    total: employees.length,
    availableNow,
    byLevel,
    byDomain,
    byRole: roleCount,
    avgPerformance: employees.length ? Math.round((sumPerf / employees.length) * 100) / 100 : 0,
    avgYears: employees.length ? Math.round((sumYears / employees.length) * 10) / 10 : 0,
    topSkills,
  };
}
