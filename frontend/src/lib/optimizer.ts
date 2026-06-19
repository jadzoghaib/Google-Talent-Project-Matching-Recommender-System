import type { Employee, Project, MatchScore, TeamAssignment } from './types';

const LEVEL_ORDER = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'];

// How much team chemistry counts in the objective, per member. Individual match
// scores live on a 1-10 scale; cohesion is a 0-1 cosine similarity. This weight
// makes cohesion a real tie-breaker that the local search optimizes for, rather
// than a number we only display after the fact.
const COHESION_WEIGHT = 1.2;
const QUALITY_FLOOR = 4.0;
const LOCAL_SEARCH_PASSES = 8;
// Local search only needs to consider strong candidates: replacing a member with
// a low-scoring person never helps. Shortlisting the top-N per project keeps the
// search near-instant instead of scanning the whole available pool each pass.
const LOCAL_SEARCH_CANDIDATES = 50;

interface RoleReq { role: string; min_level: string }

function personalitySimilarity(e1: Employee, e2: Employee): number {
  const v1 = [e1.personality_openness, e1.personality_conscientiousness, e1.personality_extraversion, e1.personality_agreeableness, 6 - e1.personality_neuroticism];
  const v2 = [e2.personality_openness, e2.personality_conscientiousness, e2.personality_extraversion, e2.personality_agreeableness, 6 - e2.personality_neuroticism];
  let dot = 0, mag1 = 0, mag2 = 0;
  for (let i = 0; i < 5; i++) {
    dot += v1[i] * v2[i];
    mag1 += v1[i] * v1[i];
    mag2 += v2[i] * v2[i];
  }
  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2) + 0.0001);
}

function cohesionOf(team: Employee[]): number {
  if (team.length < 2) return 1.0;
  let sum = 0, pairs = 0;
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      sum += personalitySimilarity(team[i], team[j]);
      pairs++;
    }
  }
  return sum / pairs;
}

function canFillRole(emp: Employee, req: RoleReq): boolean {
  if (LEVEL_ORDER.indexOf(emp.level) < LEVEL_ORDER.indexOf(req.min_level)) return false;
  const rc = emp.role_category.toLowerCase();
  const role = req.role.toLowerCase();
  if (role.includes('lead')) return rc.includes('lead') || rc.includes('staff') || rc.includes('principal') || rc.includes('senior');
  return rc.includes('software') || rc.includes('engineer') || rc.includes('mid') || rc.includes('senior') || rc.includes('junior') || rc.includes('staff');
}

export function optimizeAssignments(
  pipelineProjects: Project[],
  allEmployees: Employee[],
  scores: MatchScore[],
  _history: unknown[] = []
): { assignments: TeamAssignment[]; totalScore: number } {
  const today = new Date();
  const available = allEmployees.filter(e => !e.current_staffed && new Date(e.available_from) <= today);

  const scoreMap = new Map<string, number>(); // key: empId|projId
  scores.forEach(s => scoreMap.set(`${s.employee_id}|${s.project_id}`, s.score));
  const scoreFor = (empId: string, projId: string) => scoreMap.get(`${empId}|${projId}`) ?? 3;

  // ---- Per-project mutable state -------------------------------------------
  const teams = new Map<string, Employee[]>();             // projId -> team
  const remainingSlots = new Map<string, Map<string, number>>(); // projId -> roleKey -> count
  const memberRole = new Map<string, string>();            // empId -> roleKey it fills
  const assignedEmployees = new Set<string>();

  const roleKey = (req: RoleReq) => `${req.role}:${req.min_level}`;
  const parseRoleKey = (key: string): RoleReq => {
    const idx = key.lastIndexOf(':');
    return { role: key.slice(0, idx), min_level: key.slice(idx + 1) };
  };

  for (const proj of pipelineProjects) {
    teams.set(proj.project_id, []);
    const slots = new Map<string, number>();
    for (const r of (proj.required_roles || [])) slots.set(roleKey(r), r.count);
    remainingSlots.set(proj.project_id, slots);
  }

  // Which still-open role can this employee fill on this project (if any)?
  function openRoleFor(emp: Employee, proj: Project): RoleReq | null {
    const slots = remainingSlots.get(proj.project_id)!;
    for (const req of (proj.required_roles || [])) {
      if ((slots.get(roleKey(req)) || 0) > 0 && canFillRole(emp, req)) return req;
    }
    return null;
  }

  function canAssign(emp: Employee, proj: Project): boolean {
    if (assignedEmployees.has(emp.employee_id)) return false;
    const team = teams.get(proj.project_id)!;
    if (team.length >= proj.required_team_size_max) return false;
    if (!openRoleFor(emp, proj)) return false;
    // Soft quality floor: once the team has its minimum bulk, stop adding weak fits.
    const sc = scoreFor(emp.employee_id, proj.project_id);
    if (sc < QUALITY_FLOOR && team.length >= Math.floor(proj.required_team_size_target * 0.5)) return false;
    return true;
  }

  function assign(emp: Employee, proj: Project, req: RoleReq) {
    const team = teams.get(proj.project_id)!;
    team.push(emp);
    assignedEmployees.add(emp.employee_id);
    memberRole.set(emp.employee_id, roleKey(req));
    const slots = remainingSlots.get(proj.project_id)!;
    slots.set(roleKey(req), (slots.get(roleKey(req)) || 0) - 1);
  }

  // ---- Phase 1: global greedy ----------------------------------------------
  // One unified, score-sorted candidate list across ALL projects is what makes
  // this portfolio-global rather than per-project greedy.
  const candidates: Array<{ proj: Project; emp: Employee; score: number }> = [];
  for (const proj of pipelineProjects) {
    for (const emp of available) {
      candidates.push({ proj, emp, score: scoreFor(emp.employee_id, proj.project_id) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const cand of candidates) {
    const { proj, emp } = cand;
    const team = teams.get(proj.project_id)!;
    if (team.length >= proj.required_team_size_target) continue;
    if (!canAssign(emp, proj)) continue;
    const req = openRoleFor(emp, proj);
    if (req) assign(emp, proj, req);
  }

  // ---- Phase 2: repair (fill any still-open required roles) -----------------
  for (const proj of pipelineProjects) {
    const team = teams.get(proj.project_id)!;
    const slots = remainingSlots.get(proj.project_id)!;
    for (const [key, count] of slots) {
      if (count <= 0) continue;
      const req = parseRoleKey(key);
      for (let k = 0; k < count; k++) {
        if (team.length >= proj.required_team_size_max) break;
        const candidate = available
          .filter(e => !assignedEmployees.has(e.employee_id) && canFillRole(e, req))
          .sort((a, b) => scoreFor(b.employee_id, proj.project_id) - scoreFor(a.employee_id, proj.project_id))[0];
        if (candidate) assign(candidate, proj, req);
        else break;
      }
    }
  }

  // ---- Phase 3: cohesion-aware local search --------------------------------
  // Objective per team = sum(individual scores) + COHESION_WEIGHT * cohesion * size.
  // We try to replace each member with an unassigned candidate that fills the SAME
  // role and raises the team's objective. Cohesion is genuinely part of the score
  // being optimized here, not a post-hoc display metric.
  function teamObjective(team: Employee[], projId: string): number {
    let s = 0;
    for (const e of team) s += scoreFor(e.employee_id, projId);
    return s + COHESION_WEIGHT * cohesionOf(team) * team.length;
  }

  // Per-project shortlist of the strongest available candidates (by score).
  const shortlist = new Map<string, Employee[]>();
  for (const proj of pipelineProjects) {
    shortlist.set(
      proj.project_id,
      [...available]
        .sort((a, b) => scoreFor(b.employee_id, proj.project_id) - scoreFor(a.employee_id, proj.project_id))
        .slice(0, LOCAL_SEARCH_CANDIDATES),
    );
  }

  for (let pass = 0; pass < LOCAL_SEARCH_PASSES; pass++) {
    let improved = false;

    for (const proj of pipelineProjects) {
      const team = teams.get(proj.project_id)!;
      if (team.length === 0) continue;

      for (let i = 0; i < team.length; i++) {
        const member = team[i];
        const mRoleKey = memberRole.get(member.employee_id);
        if (!mRoleKey) continue;
        const req = parseRoleKey(mRoleKey);

        const baseObjective = teamObjective(team, proj.project_id);
        let bestObjective = baseObjective;
        let bestReplacement: Employee | null = null;

        for (const cand of shortlist.get(proj.project_id)!) {
          if (assignedEmployees.has(cand.employee_id)) continue;
          if (!canFillRole(cand, req)) continue;
          const trial = team.slice();
          trial[i] = cand;
          const obj = teamObjective(trial, proj.project_id);
          if (obj > bestObjective + 1e-6) {
            bestObjective = obj;
            bestReplacement = cand;
          }
        }

        if (bestReplacement) {
          team[i] = bestReplacement;
          assignedEmployees.delete(member.employee_id);
          assignedEmployees.add(bestReplacement.employee_id);
          memberRole.delete(member.employee_id);
          memberRole.set(bestReplacement.employee_id, mRoleKey);
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  // ---- Build final assignments (once) --------------------------------------
  const assignments: TeamAssignment[] = [];
  let total = 0;

  for (const proj of pipelineProjects) {
    const team = teams.get(proj.project_id)!;
    const individualScores: Record<string, number> = {};
    let sum = 0;
    for (const emp of team) {
      const sc = scoreFor(emp.employee_id, proj.project_id);
      individualScores[emp.employee_id] = sc;
      sum += sc;
    }
    const cohesion = cohesionOf(team);
    const teamScore = team.length ? sum / team.length : 0;

    assignments.push({
      project_id: proj.project_id,
      employees: team.map(e => e.employee_id),
      teamScore: Math.round(teamScore * 10) / 10,
      cohesion: Math.round(cohesion * 100) / 100,
      individualScores,
    });
    total += sum;
  }

  return { assignments, totalScore: Math.round(total * 10) / 10 };
}

// Helper exposed for verification / the UI constraint panel.
export function validateAssignments(
  assignments: TeamAssignment[],
  allEmployees: Employee[],
  pipeline: Project[],
  _scores: MatchScore[]
): string[] {
  const violations: string[] = [];
  const assigned = new Set<string>();
  const empMap = new Map(allEmployees.map(e => [e.employee_id, e]));

  for (const a of assignments) {
    const proj = pipeline.find(p => p.project_id === a.project_id);
    if (!proj) continue;

    if (a.employees.length > 0 && a.employees.length < proj.required_team_size_min) {
      violations.push(`${proj.title}: team size ${a.employees.length} below minimum ${proj.required_team_size_min}`);
    }
    if (a.employees.length > proj.required_team_size_max) {
      violations.push(`${proj.title}: team size ${a.employees.length} above maximum ${proj.required_team_size_max}`);
    }

    const roleSatisfied = new Map<string, number>();
    for (const eid of a.employees) {
      if (assigned.has(eid)) violations.push(`Employee ${eid} assigned to more than one project`);
      assigned.add(eid);
      const emp = empMap.get(eid);
      if (!emp) continue;
      for (const req of (proj.required_roles || [])) {
        if (canFillRole(emp, req)) {
          const k = `${req.role}:${req.min_level}`;
          roleSatisfied.set(k, (roleSatisfied.get(k) || 0) + 1);
        }
      }
    }

    for (const req of (proj.required_roles || [])) {
      const k = `${req.role}:${req.min_level}`;
      if ((roleSatisfied.get(k) || 0) < req.count) {
        violations.push(`${proj.title}: needs ${req.count}× ${req.role} (min ${req.min_level}), has ${roleSatisfied.get(k) || 0}`);
      }
    }
  }

  return violations;
}
