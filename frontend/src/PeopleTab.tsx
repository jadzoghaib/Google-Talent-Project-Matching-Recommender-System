import { useMemo, useState } from 'react';
import {
  Search, Users, UserCheck, Award, Briefcase, X, GraduationCap, MapPin, Building2, Sparkles,
} from 'lucide-react';
import type { Employee, Assignment } from './lib/types';
import { EMPLOYEE_DOMAINS, LEVELS, EMPLOYEE_ROLES } from './lib/catalog';
import { computePeopleAnalytics } from './lib/analytics';
import { AnimatePresence } from 'framer-motion';
import {
  G, CARD, StatCard, DistBar, DrawerShell, Avatar, levelTone, domainColor,
} from './lib/uikit';

const DISPLAY_CAP = 60;
const LEVEL_ORDER = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'];

const BIG_FIVE = [
  { key: 'personality_openness' as const,          name: 'Openness',          short: 'O' },
  { key: 'personality_conscientiousness' as const, name: 'Conscientiousness', short: 'C' },
  { key: 'personality_extraversion' as const,      name: 'Extraversion',      short: 'E' },
  { key: 'personality_agreeableness' as const,     name: 'Agreeableness',     short: 'A' },
  { key: 'personality_neuroticism' as const,       name: 'Neuroticism',       short: 'N' },
];

function isAvailable(e: Employee): boolean {
  return !e.current_staffed && new Date(e.available_from) <= new Date();
}

type AffinityMap = Record<string, Record<string, number>>;

interface Props {
  employees: Employee[];
  affinity: AffinityMap;
  historical: Assignment[];
  newHireIds: Set<string>;
}

export function PeopleTab({ employees, affinity, historical, newHireIds }: Props) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<'all' | string>('all');
  const [domain, setDomain] = useState<'all' | string>('all');
  const [role, setRole] = useState<'all' | string>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);

  const analytics = useMemo(() => computePeopleAnalytics(employees), [employees]);

  const historyCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of historical) m[a.employee_id] = (m[a.employee_id] ?? 0) + 1;
    return m;
  }, [historical]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter(e => {
        if (level !== 'all' && e.level !== level) return false;
        if (domain !== 'all' && (e.primary_domain ?? 'Undecided') !== domain) return false;
        if (role !== 'all' && e.role_category !== role) return false;
        if (onlyAvailable && !isAvailable(e)) return false;
        if (q && !(`${e.name} ${e.primary_domain ?? ''} ${e.role_category}`.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level) || a.name.localeCompare(b.name));
  }, [employees, query, level, domain, role, onlyAvailable]);

  const shown = filtered.slice(0, DISPLAY_CAP);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[28px] font-normal tracking-tight text-[#202124]">People</h2>
        <p className="mt-1 max-w-xl text-sm text-[#5f6368]">
          The full talent pool. Filter by level, domain, role, or availability, and open anyone for their
          skills, working-style profile, and learned domain affinities.
        </p>
      </div>

      {/* Analytics strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Headcount" value={analytics.total.toLocaleString()} sub="people in the pool" />
        <StatCard icon={<UserCheck className="h-4 w-4" />} label="Available now" value={analytics.availableNow.toLocaleString()} sub="free to be staffed today" accent="text-[#1e8e3e]" />
        <StatCard icon={<Award className="h-4 w-4" />} label="Avg performance" value={analytics.avgPerformance.toFixed(2)} sub="past review average (1–5)" accent="text-[#a142f4]" />
        <StatCard icon={<Briefcase className="h-4 w-4" />} label="Avg experience" value={`${analytics.avgYears}y`} sub="years across the pool" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${CARD} p-4`}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Headcount by level</div>
          <DistBar items={analytics.byLevel.map(d => ({ ...d, color: G.blue }))} />
        </div>
        <div className={`${CARD} p-4`}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Most common skills</div>
          <DistBar items={analytics.topSkills.map(d => ({ ...d, color: G.green }))} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa0a6]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search people by name, domain, or role…"
            className="w-full rounded-full border border-[#dadce0] bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={level} onChange={e => setLevel(e.target.value)} className="rounded-full border border-[#dadce0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a73e8]">
            <option value="all">All levels</option>
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={domain} onChange={e => setDomain(e.target.value)} className="rounded-full border border-[#dadce0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a73e8]">
            <option value="all">All domains</option>
            {EMPLOYEE_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={role} onChange={e => setRole(e.target.value)} className="rounded-full border border-[#dadce0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a73e8]">
            <option value="all">All roles</option>
            {EMPLOYEE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={() => setOnlyAvailable(v => !v)}
            className={`rounded-full border px-3 py-2.5 text-sm font-medium transition ${
              onlyAvailable ? 'border-[#34A853] bg-[#e6f4ea] text-[#137333]' : 'border-[#dadce0] bg-white text-[#5f6368] hover:bg-[#f1f3f4]'
            }`}
          >
            Available only
          </button>
        </div>
      </div>

      <div className="text-[11px] text-[#80868b]">
        Showing {Math.min(shown.length, filtered.length)} of {filtered.length} matching {filtered.length === 1 ? 'person' : 'people'}
        {filtered.length > DISPLAY_CAP && ' — refine filters to narrow further'}
      </div>

      {/* People grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(e => {
          const avail = isAvailable(e);
          const isNew = newHireIds.has(e.employee_id);
          return (
            <button
              key={e.employee_id}
              onClick={() => setSelected(e)}
              className={`${CARD} flex items-center gap-3 p-3.5 text-left transition hover:shadow-[0_2px_8px_rgba(60,64,67,0.18)]`}
            >
              <Avatar name={e.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-[#202124]">{e.name}</span>
                  {isNew && <span className="rounded-full bg-[#f3e8ff] px-1.5 py-0.5 text-[9px] font-semibold text-[#7b1fa2]">new</span>}
                </div>
                <div className="truncate text-[11px] text-[#80868b]">
                  <span className={levelTone(e.level)}>{e.level}</span> · {e.role_category} · {e.primary_domain ?? 'Undecided'}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${avail ? 'bg-[#e6f4ea] text-[#137333]' : 'bg-[#f1f3f4] text-[#9aa0a6]'}`}
              >
                {avail ? 'Free' : 'Staffed'}
              </span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#dadce0] py-12 text-center text-sm text-[#80868b]">
          No people match the current filters.
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <EmployeeDetailDrawer
            key={selected.employee_id}
            emp={selected}
            affinities={affinity[selected.employee_id]}
            isNewHire={newHireIds.has(selected.employee_id)}
            historyCount={historyCount[selected.employee_id] ?? 0}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Employee detail drawer ──────────────────────────────────────────────────
function EmployeeDetailDrawer({
  emp, affinities, isNewHire, historyCount, onClose,
}: {
  emp: Employee; affinities?: Record<string, number>; isNewHire: boolean; historyCount: number; onClose: () => void;
}) {
  const avail = isAvailable(emp);
  const affinityRows = affinities
    ? Object.entries(affinities).map(([label, v]) => ({ label, value: Math.round(v * 10) / 10 })).sort((a, b) => b.value - a.value)
    : [];

  return (
    <DrawerShell onClose={onClose} ariaLabel={`Profile for ${emp.name}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#e8eaed] bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <Avatar name={emp.name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[17px] font-semibold leading-tight text-[#202124]">{emp.name}</span>
              {isNewHire && <span className="rounded-full bg-[#f3e8ff] px-2 py-0.5 text-[10px] font-semibold text-[#7b1fa2]">new hire</span>}
            </div>
            <div className="mt-0.5 text-[11px] text-[#5f6368]">
              <span className={levelTone(emp.level)}>{emp.level}</span> · {emp.role_category} · {emp.primary_domain ?? 'Undecided'} · {emp.years_experience}y exp
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-[#5f6368] transition hover:bg-[#f1f3f4]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${avail ? 'bg-[#e6f4ea] text-[#137333]' : 'bg-[#f1f3f4] text-[#5f6368]'}`}>
            {avail ? 'Available now' : `Staffed · free ${emp.available_from}`}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-[#f1f3f4] px-2.5 py-1 text-[11px] text-[#5f6368]"><MapPin className="h-3 w-3" />{emp.primary_location}</span>
          <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-[11px] text-[#5f6368]">{historyCount} past project{historyCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="flex-1 space-y-5 px-5 py-4">
        {/* Key stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[#e8eaed] bg-[#f8f9fa] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#5f6368]">Avg performance</div>
            <div className="font-mono text-xl font-semibold text-[#a142f4]">{emp.avg_past_performance.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-[#e8eaed] bg-[#f8f9fa] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#5f6368]">Past projects</div>
            <div className="font-mono text-xl font-semibold text-[#202124]">{emp.past_projects_count}</div>
          </div>
        </div>

        {/* Education + companies */}
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-[12px] text-[#5f6368]">
            <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{emp.education?.degree} {emp.education?.field} · {emp.education?.university}</span>
          </div>
          {emp.previous_companies?.length > 0 && (
            <div className="flex items-start gap-2 text-[12px] text-[#5f6368]">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{emp.previous_companies.join(' · ')}</span>
            </div>
          )}
        </div>

        {/* Skills */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Skills</div>
          <div className="space-y-1.5">
            {emp.skills.map(s => (
              <div key={s.skill} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-[12px] text-[#202124]" title={s.skill}>{s.skill}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8eaed]">
                  <div className="h-full rounded-full" style={{ width: `${(s.proficiency / 5) * 100}%`, background: G.blue }} />
                </div>
                <span className="w-6 text-right font-mono text-[11px] text-[#80868b]">{s.proficiency}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Big Five */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Working style — Big Five</div>
          <div className="space-y-1.5">
            {BIG_FIVE.map(t => {
              const v = emp[t.key];
              return (
                <div key={t.key} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-[12px] text-[#202124]">{t.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8eaed]">
                    <div className="h-full rounded-full" style={{ width: `${(v / 5) * 100}%`, background: t.key === 'personality_neuroticism' ? G.red : G.green }} />
                  </div>
                  <span className="w-6 text-right font-mono text-[11px] text-[#80868b]">{v}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Domain affinity */}
        {affinityRows.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">
              <Sparkles className="h-3.5 w-3.5" /> Domain affinity {isNewHire ? '(from onboarding)' : '(learned by MF)'}
            </div>
            <div className="space-y-1.5">
              {affinityRows.map(r => (
                <div key={r.label} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-[12px] text-[#202124]">{r.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8eaed]">
                    <div className="h-full rounded-full" style={{ width: `${(r.value / 5) * 100}%`, background: domainColor(r.label) }} />
                  </div>
                  <span className="w-10 text-right font-mono text-[11px] text-[#80868b]">{r.value}/5</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="h-2" />
      </div>
    </DrawerShell>
  );
}
