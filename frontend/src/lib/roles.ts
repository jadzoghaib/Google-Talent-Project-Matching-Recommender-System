// Shared role/level matching used by BOTH the scorer (levelRoleFit) and the
// optimizer (canFillRole). Previously each had its own implementation and the
// scorer's role-NAME check was dead code (role_category never contains
// "software"/"tech"), so Level/Role-Fit could never reach 1.0. Centralising it
// fixes that and makes Project-Manager roles fillable.

const LEVEL_ORDER = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'];

export function levelMeets(level: string, minLevel: string): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(minLevel);
}

// Does an employee's role_category qualify for a project's required role NAME?
// role_category ∈ {Junior, Mid, Senior, Staff, Principal, Project Manager};
// role names ∈ {Software Engineer, Tech Lead, Project Manager}.
export function roleMatches(roleCategory: string, roleName: string): boolean {
  const rc = roleCategory.toLowerCase();
  const role = roleName.toLowerCase();
  if (role.includes('manager') || role.includes('product owner')) {
    return rc.includes('manager') || rc.includes('project');
  }
  if (role.includes('lead')) {
    // Tech Lead: senior individual contributors (not PMs, not juniors).
    return rc.includes('lead') || rc.includes('staff') || rc.includes('principal') || rc.includes('senior');
  }
  // Engineer roles: any engineering IC category (everyone except PMs).
  return rc.includes('software') || rc.includes('engineer') || rc.includes('mid')
      || rc.includes('senior') || rc.includes('junior') || rc.includes('staff') || rc.includes('principal');
}
