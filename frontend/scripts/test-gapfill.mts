// Headless integration check for the Phase 2 gap-fill flow.
// Exercises the REAL scorer + optimizer against the real CSV dataset, mirroring
// what App.runRecommender does for open seats. Run: npx tsx scripts/test-gapfill.mts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Papa from 'papaparse';
import type { Employee, Project, Assignment, OpenSeat } from '../src/lib/types';
import { computeMatchScore } from '../src/lib/scorer';
import type { MFAffinity } from '../src/lib/scorer';
import { optimizeAssignments } from '../src/lib/optimizer';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const readCSV = (f: string) => Papa.parse(readFileSync(join(DATA, f), 'utf8'), { header: true, skipEmptyLines: true }).data as any[];
const j = (v: string | undefined): any => { if (!v) return []; try { return JSON.parse(v.replace(/""/g, '"')); } catch { return []; } };

const employees: Employee[] = readCSV('employees.csv').map(r => ({
  employee_id: r.employee_id, name: r.name, level: r.level, role_category: r.role_category,
  years_experience: +r.years_experience || 0, primary_domain: r.primary_domain || null,
  skills: j(r.skills), tech_tags: j(r.tech_tags),
  personality_openness: +r.personality_openness || 3, personality_conscientiousness: +r.personality_conscientiousness || 3,
  personality_extraversion: +r.personality_extraversion || 3, personality_agreeableness: +r.personality_agreeableness || 3,
  personality_neuroticism: +r.personality_neuroticism || 3, education: j(r.education), previous_companies: j(r.previous_companies),
  past_projects_count: +r.past_projects_count || 0, avg_past_performance: +r.avg_past_performance || 3.5,
  primary_location: r.primary_location, timezone_offset: +r.timezone_offset || 0,
  can_work_across_timezones: r.can_work_across_timezones === 'True', current_staffed: r.current_staffed === 'True',
  available_from: r.available_from, diversity_group: r.diversity_group,
}));
const projects: Project[] = readCSV('projects.csv').map(r => ({
  project_id: r.project_id, title: r.title, description: r.description, domain: r.domain, priority: +r.priority || 3,
  required_team_size_min: +r.required_team_size_min || 3, required_team_size_max: +r.required_team_size_max || 6,
  required_team_size_target: +r.required_team_size_target || 4, required_roles: j(r.required_roles),
  required_skills: j(r.required_skills), tech_requirements: j(r.tech_requirements),
  duration_weeks: +r.duration_weeks || 12, target_start_date: r.target_start_date, status: r.status,
  current_staffed_ids: j(r.current_staffed_ids),
}));
const historical: Assignment[] = readCSV('historical_assignments.csv').map(r => ({
  employee_id: r.employee_id, project_id: r.project_id, pm_review: +r.pm_review || 3,
  peer_collaboration_avg: +r.peer_collaboration_avg || 3, delivery_score: +r.delivery_score || 3,
}));
const mfAffinity: MFAffinity = {};
for (const row of readCSV('mf_employee_domain.csv')) {
  const id = row.employee_id; if (!id) continue; const rec: Record<string, number> = {};
  for (const k of Object.keys(row)) { if (k === 'employee_id') continue; const v = +row[k]; if (!Number.isNaN(v)) rec[k] = v; }
  mfAffinity[id] = rec;
}

// Mirror of App.seatToProject
const seatToProject = (s: OpenSeat): Project => ({
  project_id: `SEAT-${s.id}`, title: `${s.projectTitle} · +${s.seats} ${s.role}`, description: '', domain: s.domain, priority: 1,
  required_team_size_min: s.seats, required_team_size_max: s.seats, required_team_size_target: s.seats,
  required_roles: [{ role: s.role, min_level: s.minLevel, count: s.seats }],
  required_skills: s.skills.map(sk => ({ skill: sk, min_proficiency: 3, weight: 1.0 })),
  tech_requirements: [], duration_weeks: 0, target_start_date: '2026-06-21', status: 'open_seat',
});

const today = new Date();
const freePool = employees.filter(e => !e.current_staffed && new Date(e.available_from) <= today).slice(0, 70);
const staffedIds = new Set(employees.filter(e => e.current_staffed).map(e => e.employee_id));
const activeProject = projects.find(p => p.status === 'active' && (p.required_roles?.length ?? 0) > 0 && (p.current_staffed_ids?.length ?? 0) > 0)!;

console.log(`Dataset: ${employees.length} employees (${freePool.length} free in cap), ${projects.length} projects`);
console.log(`Active project chosen: "${activeProject.title}" [${activeProject.domain}] roles=${JSON.stringify(activeProject.required_roles)}`);

// Build an open seat from that active project (as the UI form would) — request
// extra engineers (always fillable from the free pool).
const engRole = activeProject.required_roles.find(r => r.role === 'Software Engineer') ?? activeProject.required_roles[0];
const seat: OpenSeat = {
  id: 'test1', projectId: activeProject.project_id, projectTitle: activeProject.title, domain: activeProject.domain,
  role: engRole.role, minLevel: engRole.min_level,
  skills: activeProject.required_skills.slice(0, 4).map(s => s.skill), seats: 2,
};
const seatProj = seatToProject(seat);

// Also include a real pipeline project, to prove no double-assignment across the run
const pipelineProj = projects.find(p => p.status === 'pipeline' && (p.required_roles?.length ?? 0) > 0)!;
const toStaff = [pipelineProj, seatProj];

const projectDomainMap: Record<string, string> = {};
[...projects, ...toStaff].forEach(p => { projectDomainMap[p.project_id] = p.domain; });

const scores = toStaff.flatMap(p => freePool.map(e => computeMatchScore(e, p, historical, projectDomainMap, mfAffinity)));

// Anchor the seat to the active project's existing roster (the cohesion refinement).
const anchors = (activeProject.current_staffed_ids ?? [])
  .map(id => employees.find(e => e.employee_id === id))
  .filter((e): e is Employee => Boolean(e));
const seatAnchors = { [seatProj.project_id]: anchors };

const { assignments } = optimizeAssignments(toStaff, freePool, scores, historical, seatAnchors);
const { assignments: noAnchorRun } = optimizeAssignments(toStaff, freePool, scores, historical);

const seatAssign = assignments.find(a => a.project_id === seatProj.project_id)!;
const pipeAssign = assignments.find(a => a.project_id === pipelineProj.project_id)!;
const seatNoAnchor = noAnchorRun.find(a => a.project_id === seatProj.project_id)!;

// Replicated cohesion (mirror of optimizer.cohesionOf) to verify anchors fold in.
function persSim(a: Employee, b: Employee): number {
  const v1 = [a.personality_openness, a.personality_conscientiousness, a.personality_extraversion, a.personality_agreeableness, 6 - a.personality_neuroticism];
  const v2 = [b.personality_openness, b.personality_conscientiousness, b.personality_extraversion, b.personality_agreeableness, 6 - b.personality_neuroticism];
  let dot = 0, m1 = 0, m2 = 0;
  for (let i = 0; i < 5; i++) { dot += v1[i] * v2[i]; m1 += v1[i] * v1[i]; m2 += v2[i] * v2[i]; }
  return dot / (Math.sqrt(m1) * Math.sqrt(m2) + 0.0001);
}
function cohesion(team: Employee[]): number {
  if (team.length < 2) return 1.0;
  let s = 0, p = 0;
  for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) { s += persSim(team[i], team[j]); p++; }
  return s / p;
}
const hires = seatAssign.employees.map(id => freePool.find(e => e.employee_id === id)!);
const expectedCohesion = Math.round(cohesion([...anchors, ...hires]) * 100) / 100;

// ---- assertions ----
const checks: Array<[string, boolean, string]> = [];
checks.push(['seat filled to requested count', seatAssign.employees.length === seat.seats, `${seatAssign.employees.length}/${seat.seats}`]);
checks.push(['no staffed employee pulled into seat', seatAssign.employees.every(id => !staffedIds.has(id)), seatAssign.employees.join(', ')]);
checks.push(['seat hires come from the free pool', seatAssign.employees.every(id => freePool.some(e => e.employee_id === id)), 'ok']);
const overlap = seatAssign.employees.filter(id => pipeAssign.employees.includes(id));
checks.push(['no one assigned to both seat and pipeline', overlap.length === 0, overlap.join(', ') || 'none']);
const seatEmps = seatAssign.employees.map(id => freePool.find(e => e.employee_id === id)!);
const levelOk = seatEmps.every(e => ['L3','L4','L5','L6','L7','L8'].indexOf(e.level) >= ['L3','L4','L5','L6','L7','L8'].indexOf(seat.minLevel));
checks.push([`seat hires meet min level ${seat.minLevel}`, levelOk, seatEmps.map(e => `${e.name}:${e.level}`).join(', ')]);
// Cohesion refinement: the seat's reported cohesion folds in the anchor roster.
checks.push(['active project has an anchor roster', anchors.length > 0, `${anchors.length} current members`]);
checks.push(['seat cohesion reflects the anchor team', Math.abs(seatAssign.cohesion - expectedCohesion) < 0.011, `reported ${seatAssign.cohesion} vs anchors+hires ${expectedCohesion}`]);
checks.push(['anchoring changes cohesion vs no-anchor run', seatAssign.cohesion !== seatNoAnchor.cohesion, `anchored ${seatAssign.cohesion} vs none ${seatNoAnchor.cohesion}`]);

console.log('\nGap-fill assignment (anchored to a current roster of ' + anchors.length + '):');
for (const e of seatEmps) console.log(`  • ${e.name} (${e.level} ${e.role_category}, ${e.primary_domain ?? 'no domain'})  score=${seatAssign.individualScores[e.employee_id]}`);
console.log(`  team chemistry with the existing roster: ${seatAssign.cohesion}`);

console.log('\nChecks:');
let allPass = true;
for (const [name, pass, detail] of checks) { console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${name}  (${detail})`); if (!pass) allPass = false; }
console.log(`\n${allPass ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'}`);
process.exit(allPass ? 0 : 1);
