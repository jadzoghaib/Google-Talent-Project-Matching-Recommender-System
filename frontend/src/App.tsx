import { useState, useEffect, useMemo } from 'react';
import {
  Users, Play, Plus, RefreshCw, Award, Sparkles, CheckCircle2,
  AlertTriangle, X, Layers, Gauge, TrendingUp, ShieldCheck, BarChart2, UserPlus,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import type { Employee, Project, MatchScore, TeamAssignment, Assignment } from './lib/types';
import { loadEmployees, loadProjects, loadHistorical, loadMFAffinity, loadMFMetrics } from './lib/dataLoader';
import type { MFMetrics } from './lib/dataLoader';
import { computeMatchScore } from './lib/scorer';
import type { MFAffinity } from './lib/scorer';
import { optimizeAssignments, validateAssignments } from './lib/optimizer';
import type { AssignmentSource } from './lib/optimizer';
import { evaluateModel, computeCoverage } from './lib/evaluation';
import type { ModelEvaluation } from './lib/evaluation';
import { AnalysisDrawer } from './AnalysisDrawer';
import { OnboardingPage } from './OnboardingPage';
import type { NewHireResult } from './OnboardingPage';
import { SKILLS_CATALOG, PROJECT_DOMAINS, LEVELS, PROJECT_ROLES, DOMAIN_SKILLS } from './lib/catalog';

interface PipelineProject extends Project {
  isUserAdded?: boolean;
}

// Project-staffing types for the Add-Project form
type SkillReq = { skill: string; min_proficiency: number };
type RoleReq = { role: string; min_level: string; count: number };

const DEFAULT_ROLES: RoleReq[] = [
  { role: 'Tech Lead', min_level: 'L6', count: 1 },
  { role: 'Software Engineer', min_level: 'L4', count: 4 },
];

// Google brand palette
const G = { blue: '#4285F4', red: '#EA4335', yellow: '#FBBC04', green: '#34A853', blue600: '#1a73e8' };

// Material card surface
const CARD = 'rounded-2xl border border-[#dadce0] bg-white shadow-[0_1px_3px_rgba(60,64,67,0.10)]';

const SEGMENT_META: Record<string, { label: string; cls: string; dot: string }> = {
  exploration: { label: 'Explore', cls: 'bg-[#e8f0fe] text-[#1967d2]', dot: 'bg-[#4285F4]' },
  exploitation: { label: 'Exploit', cls: 'bg-[#fef7e0] text-[#b06000]', dot: 'bg-[#f9ab00]' },
  balanced: { label: 'Balanced', cls: 'bg-[#e6f4ea] text-[#137333]', dot: 'bg-[#34A853]' },
};

const AVATAR_COLORS = ['#4285F4', '#EA4335', '#34A853', '#1a73e8', '#a142f4', '#f9ab00', '#12b5cb'];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ---- The four-colour Google "G" mark (also used as the favicon) -------------
function GoogleG({ size = 24 }: { size?: number }) {
  const r = 14.5;
  const C = 2 * Math.PI * r;
  const arc = (deg: number) => `${(deg / 360) * C} ${C}`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="Google G">
      <g fill="none" strokeWidth={9}>
        <circle cx="24" cy="24" r={r} stroke={G.green} strokeDasharray={arc(110)} transform="rotate(40 24 24)" />
        <circle cx="24" cy="24" r={r} stroke={G.yellow} strokeDasharray={arc(85)} transform="rotate(150 24 24)" />
        <circle cx="24" cy="24" r={r} stroke={G.red} strokeDasharray={arc(65)} transform="rotate(235 24 24)" />
        <circle cx="24" cy="24" r={r} stroke={G.blue} strokeDasharray={arc(60)} transform="rotate(300 24 24)" />
      </g>
      <rect x="23" y="19.5" width="11" height="9" fill={G.blue} />
    </svg>
  );
}

// -------------------------------------------------------------------- helpers
function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${value.toFixed(2)}`}>
      <span className="w-4 text-[9px] font-semibold uppercase tracking-wide text-[#80868b]">{label}</span>
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-[#e8eaed]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, accent = 'text-[#202124]',
}: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-2 text-[#5f6368]">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={`mt-2 font-mono text-2xl font-medium tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[#80868b]">{sub}</div>}
    </div>
  );
}

function levelTone(level: string): string {
  const i = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'].indexOf(level);
  if (i >= 4) return 'text-[#a142f4]';
  if (i >= 2) return 'text-[#1a73e8]';
  return 'text-[#5f6368]';
}

// Vertical "thermometer" comparing the achieved portfolio score against the
// theoretical ceiling (every project staffed with its dream team).
function PortfolioThermometer({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const efficiency = Math.round(pct * 1000) / 10;
  const gap = Math.round((max - current) * 10) / 10;

  const tubeTop = 16, tubeBottom = 196, tubeH = tubeBottom - tubeTop;
  const mercuryTop = tubeBottom - pct * tubeH;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-stretch">
      <div className="flex items-stretch gap-3">
        <svg viewBox="0 0 70 250" className="h-56 w-16 shrink-0" role="img" aria-label={`Portfolio score ${current} of a maximum ${max}`}>
          <defs>
            <linearGradient id="mercury" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={G.blue600} />
              <stop offset="100%" stopColor={G.green} />
            </linearGradient>
          </defs>
          {/* track */}
          <rect x="24" y={tubeTop} width="22" height={tubeH} rx="11" fill="#e8eaed" />
          <circle cx="35" cy="212" r="24" fill="#e8eaed" />
          {/* mercury */}
          <circle cx="35" cy="212" r="17" fill="url(#mercury)" />
          <rect x="28" y={mercuryTop} width="14" height={tubeBottom - mercuryTop + 14} rx="7" fill="url(#mercury)" />
          {/* max cap tick */}
          <line x1="46" y1={tubeTop} x2="58" y2={tubeTop} stroke="#9aa0a6" strokeWidth="1.5" />
          {/* current marker */}
          <line x1="46" y1={mercuryTop} x2="62" y2={mercuryTop} stroke={G.blue600} strokeWidth="2" />
        </svg>
        <div className="flex flex-col justify-between py-1 text-[10px] text-[#80868b]">
          <span>Max · {max}</span>
          <span className="text-[#9aa0a6]">ceiling</span>
          <span>0</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Achieved portfolio score</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-medium tabular-nums text-[#1a73e8]">{current}</span>
            <span className="text-sm text-[#80868b]">/ {max} max</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#dadce0] bg-[#f8f9fa] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#5f6368]">Efficiency</div>
            <div className="font-mono text-xl font-medium text-[#1e8e3e]">{efficiency}%</div>
            <div className="text-[10px] text-[#80868b]">of the ceiling captured</div>
          </div>
          <div className="rounded-xl border border-[#dadce0] bg-[#f8f9fa] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#5f6368]">Gap to ceiling</div>
            <div className="font-mono text-xl font-medium text-[#e37400]">{gap}</div>
            <div className="text-[10px] text-[#80868b]">pts lost to contention + cohesion</div>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-[#5f6368]">
          <span className="text-[#202124]">Max</span> = every project staffed with its ideal team if star
          engineers weren&apos;t contended across projects. Real assignments can&apos;t beat it, so the gap is the
          unavoidable cost of one person fitting only one team — plus the slight individual-score trade the optimizer
          makes to raise team cohesion.
        </p>
      </div>
    </div>
  );
}

// Multi-select skills editor — draws from the shared catalog so project skill
// requirements live in the same namespace as employee skills (exact-match scoring).
function SkillsEditor({ value, onChange, domain }: {
  value: SkillReq[]; onChange: (v: SkillReq[]) => void; domain: string;
}) {
  const selected = new Set(value.map(s => s.skill));
  const available = SKILLS_CATALOG.filter(s => !selected.has(s));
  const suggestions = (DOMAIN_SKILLS[domain] ?? []).filter(s => !selected.has(s));

  const add = (skill: string) => {
    if (!skill || selected.has(skill)) return;
    onChange([...value, { skill, min_proficiency: 3 }]);
  };
  const remove = (skill: string) => onChange(value.filter(s => s.skill !== skill));
  const setProf = (skill: string, p: number) =>
    onChange(value.map(s => (s.skill === skill ? { ...s, min_proficiency: p } : s)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value=""
          onChange={e => add(e.target.value)}
          className="rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8]"
        >
          <option value="" disabled>+ Add a skill…</option>
          {available.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-[#80868b]">
            <span>Suggested for {domain}:</span>
            {suggestions.slice(0, 4).map(s => (
              <button key={s} type="button" onClick={() => add(s)}
                className="rounded-full border border-dashed border-[#dadce0] px-2 py-0.5 text-[#1a73e8] transition hover:bg-[#e8f0fe]">
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {value.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {value.map(({ skill, min_proficiency }) => (
            <div key={skill} className="flex items-center gap-2 rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-2.5 py-1.5">
              <span className="flex-1 truncate text-sm text-[#202124]">{skill}</span>
              <span className="hidden text-[10px] text-[#80868b] sm:inline">min prof.</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setProf(skill, n)}
                    title={`Minimum proficiency ${n}`}
                    className={`h-6 w-6 rounded text-[11px] font-semibold transition ${
                      n <= min_proficiency ? 'bg-[#1a73e8] text-white' : 'border border-[#dadce0] bg-white text-[#9aa0a6]'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => remove(skill)}
                className="rounded p-1 text-[#9aa0a6] transition hover:bg-[#fce8e6] hover:text-[#d93025]" aria-label={`Remove ${skill}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-[#9aa0a6]">No skills added yet — pick from the dropdown above.</div>
      )}
    </div>
  );
}

// Required-roles editor — role name + minimum level + headcount. Feeds the
// Level/Role-Fit signal directly (previously these were hardcoded).
function RolesEditor({ value, onChange }: { value: RoleReq[]; onChange: (v: RoleReq[]) => void }) {
  const add = () => onChange([...value, { role: 'Software Engineer', min_level: 'L4', count: 1 }]);
  const update = (i: number, patch: Partial<RoleReq>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-2.5 py-1.5">
          <select value={r.role} onChange={e => update(i, { role: e.target.value })}
            className="rounded-lg border border-[#dadce0] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#1a73e8]">
            {PROJECT_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <span className="text-[11px] text-[#80868b]">min level</span>
          <select value={r.min_level} onChange={e => update(i, { min_level: e.target.value })}
            className="rounded-lg border border-[#dadce0] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#1a73e8]">
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="text-[11px] text-[#80868b]">count</span>
          <input type="number" min={1} max={20} value={r.count}
            onChange={e => update(i, { count: parseInt(e.target.value) || 1 })}
            className="w-16 rounded-lg border border-[#dadce0] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#1a73e8]" />
          <button type="button" onClick={() => remove(i)}
            className="ml-auto rounded p-1 text-[#9aa0a6] transition hover:bg-[#fce8e6] hover:text-[#d93025]" aria-label="Remove role">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1 rounded-lg border border-dashed border-[#dadce0] px-3 py-1.5 text-xs font-medium text-[#1a73e8] transition hover:bg-[#e8f0fe]">
        <Plus className="h-3.5 w-3.5" /> Add role
      </button>
    </div>
  );
}

function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [historical, setHistorical] = useState<Assignment[]>([]);
  const [pipeline, setPipeline] = useState<PipelineProject[]>([]);
  const [results, setResults] = useState<{
    assignments: TeamAssignment[];
    totalScore: number;
    upperBound: number;
    scores: MatchScore[];
    assignmentSources: Record<string, AssignmentSource>;
  } | null>(null);
  const [analysis, setAnalysis] = useState<{ empId: string; projId: string } | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [modelEval, setModelEval] = useState<ModelEvaluation | null>(null);
  const [mfAffinity, setMfAffinity] = useState<MFAffinity>({});
  const [mfMetrics, setMfMetrics] = useState<MFMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [poolCap, setPoolCap] = useState(70); // how many free engineers the optimizer may draw from
  const [newEmployees, setNewEmployees] = useState<Employee[]>([]);
  const [onboardingAffinities, setOnboardingAffinities] = useState<Record<string, Record<string, number>>>({});
  const [activeTab, setActiveTab] = useState<'recommender' | 'onboard'>('recommender');

  const [showAddForm, setShowAddForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newProject, setNewProject] = useState<{
    title: string; domain: string; priority: number;
    minSize: number; targetSize: number; maxSize: number;
    skills: SkillReq[]; roles: RoleReq[];
  }>({
    title: '', domain: 'Search', priority: 3, minSize: 3, targetSize: 5, maxSize: 7,
    skills: [{ skill: 'Python', min_proficiency: 3 }, { skill: 'Distributed Systems', min_proficiency: 3 }],
    roles: DEFAULT_ROLES,
  });

  // ---- data load ----------------------------------------------------------
  useEffect(() => {
    async function loadData() {
      try {
        const [emps, projs, hist, mf, mfMx] = await Promise.all([
          loadEmployees(), loadProjects(), loadHistorical(), loadMFAffinity(), loadMFMetrics(),
        ]);
        setEmployees(emps);
        setAllProjects(projs);
        setHistorical(hist);
        setMfAffinity(mf);
        setMfMetrics(mfMx);
        setPipeline(projs.filter(p => p.status === 'pipeline').slice(0, 6).map(p => ({ ...p, isUserAdded: false })));

        // Honest evaluation against stored ground truth (runs once on load).
        try { setModelEval(evaluateModel(emps, projs, hist, mf)); } catch { /* eval is best-effort */ }

        toast.success(`Loaded ${emps.length} employees · ${projs.length} projects`);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load data. Make sure CSVs are in public/data/');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const availableCount = useMemo(
    () => employees.filter(e => !e.current_staffed && new Date(e.available_from) <= new Date()).length + newEmployees.length,
    [employees, newEmployees],
  );
  const effectivePool = availableCount ? Math.min(poolCap, availableCount) : poolCap;

  const coverage = useMemo(
    () => (results ? computeCoverage(results.assignments, pipeline) : null),
    [results, pipeline],
  );

  // Resolve all data needed by the analysis drawer in one place.
  const drawerData = useMemo(() => {
    if (!analysis || !results) return null;
    const emp = employees.find(e => e.employee_id === analysis.empId) ?? newEmployees.find(e => e.employee_id === analysis.empId);
    const proj = pipeline.find(p => p.project_id === analysis.projId);
    const score = results.scores.find(s => s.employee_id === analysis.empId && s.project_id === analysis.projId);
    if (!emp || !proj || !score) return null;
    return {
      emp, proj, score,
      source: (results.assignmentSources[analysis.empId] ?? 'greedy') as AssignmentSource,
      isOnboardingEmployee: newEmployees.some(e => e.employee_id === analysis.empId),
    };
  }, [analysis, results, employees, newEmployees, pipeline]);

  // ---- recommender --------------------------------------------------------
  const runRecommender = async () => {
    if (pipeline.length === 0) { toast.error('Add at least one project to the pipeline'); return; }
    setIsRunning(true);
    await new Promise(r => setTimeout(r, 40)); // let the spinner paint

    try {
      // Cap the available pool — fewer free engineers => more contention for the
      // best people => the optimizer is forced further below the ceiling.
      const regularPool = employees
        .filter(e => !e.current_staffed && new Date(e.available_from) <= new Date())
        .slice(0, poolCap);
      // New hires always enter the pool; their domain affinities replace MF training data.
      const availablePool = [...regularPool, ...newEmployees];

      const projectDomainMap: Record<string, string> = {};
      [...allProjects, ...pipeline].forEach(p => { if (p.project_id) projectDomainMap[p.project_id] = p.domain; });

      // Merge onboarding assessment affinities into the MF lookup.
      const mergedMfAffinity: MFAffinity = { ...mfAffinity, ...onboardingAffinities };

      const allScores: MatchScore[] = [];
      pipeline.forEach(proj => {
        availablePool.forEach(emp => {
          allScores.push(computeMatchScore(emp, proj, historical, projectDomainMap, mergedMfAffinity));
        });
      });

      const { assignments, totalScore, upperBound, debug, assignmentSources } = optimizeAssignments(pipeline, availablePool, allScores, historical);
      setResults({ assignments, totalScore, upperBound, scores: allScores, assignmentSources });

      // Diagnostics — open DevTools console to confirm every stage executed.
      const eff = upperBound ? Math.round((totalScore / upperBound) * 1000) / 10 : 0;
      console.log(
        `[TeamMatch] ${pipeline.length} projects · pool ${debug.available} · scored ${debug.candidatesScored} pairs ` +
        `(range ${debug.scoreMin}–${debug.scoreMax}, avg ${debug.scoreAvg}) | ` +
        `greedy ${debug.greedyAssigned} assigns · ${debug.localPasses} local passes · ${debug.localSwaps} cohesion swaps | ` +
        `top-hire contention: ${debug.contendedTopPicks}/${pipeline.length} projects | ` +
        `achieved ${totalScore} / ceiling ${upperBound} = ${eff}% | ${debug.elapsedMs}ms`,
      );

      const v = validateAssignments(assignments, employees, pipeline, allScores);
      setViolations(v);
      if (v.length > 0) toast.warning(`${v.length} constraint note${v.length > 1 ? 's' : ''} — see the validation panel`);
      else toast.success(`Portfolio optimized · score ${totalScore}`);
    } catch (err) {
      console.error(err);
      toast.error('Error running recommender');
    } finally {
      setIsRunning(false);
    }
  };

  // ---- pipeline editing ---------------------------------------------------
  function validateForm(): string | null {
    const { title, minSize, targetSize, maxSize, skills, roles } = newProject;
    if (!title.trim()) return 'Project title is required.';
    if ([minSize, targetSize, maxSize].some(v => !Number.isFinite(v) || v < 1)) return 'Team sizes must be positive whole numbers.';
    if (minSize > targetSize) return 'Minimum size cannot exceed target size.';
    if (targetSize > maxSize) return 'Target size cannot exceed maximum size.';
    if (maxSize > 20) return 'Maximum team size for this demo is 20.';
    if (skills.length === 0) return 'Add at least one required skill.';
    if (roles.length === 0) return 'Add at least one required role.';
    if (pipeline.some(p => p.title.trim().toLowerCase() === title.trim().toLowerCase()))
      return 'A project with this title is already in the pipeline.';
    return null;
  }

  const addToPipeline = () => {
    const err = validateForm();
    if (err) { setFormError(err); return; }
    setFormError(null);

    const proj: PipelineProject = {
      project_id: `NEW-${Date.now()}`,
      title: newProject.title.trim(),
      description: `User-added project in ${newProject.domain}`,
      domain: newProject.domain,
      priority: newProject.priority,
      required_team_size_min: newProject.minSize,
      required_team_size_max: newProject.maxSize,
      required_team_size_target: newProject.targetSize,
      required_roles: newProject.roles,
      required_skills: newProject.skills.map(s => ({ skill: s.skill, min_proficiency: s.min_proficiency, weight: 1.0 })),
      tech_requirements: [],
      duration_weeks: 16,
      target_start_date: new Date(Date.now() + 1000 * 3600 * 24 * 30).toISOString().split('T')[0],
      status: 'pipeline',
      isUserAdded: true,
    };

    setPipeline(prev => [...prev, proj]);
    setShowAddForm(false);
    setResults(null);
    setNewProject({
      title: '', domain: 'Search', priority: 3, minSize: 3, targetSize: 5, maxSize: 7,
      skills: [{ skill: 'Python', min_proficiency: 3 }, { skill: 'Distributed Systems', min_proficiency: 3 }],
      roles: DEFAULT_ROLES,
    });
    toast.success(`Added "${proj.title}" to the pipeline`);
  };

  const removeFromPipeline = (projId: string) => {
    setPipeline(prev => prev.filter(p => p.project_id !== projId));
    setResults(null);
  };

  const resetPipeline = () => {
    setPipeline(allProjects.filter(p => p.status === 'pipeline').slice(0, 6).map(p => ({ ...p, isUserAdded: false })));
    setResults(null);
    setViolations([]);
    toast('Pipeline reset to sample projects');
  };

  const getEmployee = (id: string) => employees.find(e => e.employee_id === id) ?? newEmployees.find(e => e.employee_id === id);

  function handleOnboardingSubmit({ employee, domainAffinities }: NewHireResult) {
    setNewEmployees(prev => [...prev, employee]);
    setOnboardingAffinities(prev => ({ ...prev, [employee.employee_id]: domainAffinities }));
    setActiveTab('recommender');
    setResults(null);
    toast.success(`${employee.name} added to talent pool — run the recommender to assign them.`);
  }

  // Material text-field classes (reused across the add-project form)
  const field = 'mt-1 w-full rounded-lg border border-[#dadce0] bg-white px-3 py-2.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]';
  const fieldLabel = 'text-xs text-[#5f6368]';

  // ---- loading state ------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-[#5f6368]">
          <RefreshCw className="h-5 w-5 animate-spin text-[#1a73e8]" />
          <span>Loading TeamMatch data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#202124]">
      <Toaster position="top-center" theme="light" richColors />

      {/* ---- Header ---- */}
      <header className="sticky top-0 z-50 border-b border-[#dadce0] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <GoogleG size={30} />
            <div className="leading-tight">
              <h1 className="text-[19px] font-medium tracking-tight text-[#202124]">TeamMatch</h1>
              <p className="text-[11px] text-[#5f6368]">Talent → Project Recommender</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="hidden items-center gap-1.5 rounded-full bg-[#f1f3f4] px-3 py-1.5 sm:flex">
              <Users className="h-3.5 w-3.5 text-[#5f6368]" />
              <span className="font-medium tabular-nums">{employees.length}</span>
              <span className="text-[#5f6368]">staff</span>
            </div>
            <button
              onClick={() => setActiveTab(activeTab === 'onboard' ? 'recommender' : 'onboard')}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                activeTab === 'onboard'
                  ? 'border-[#1a73e8] bg-[#e8f0fe] text-[#1a73e8]'
                  : 'border-[#dadce0] text-[#5f6368] hover:bg-[#f1f3f4]'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" /> Onboard
            </button>
            <button
              onClick={resetPipeline}
              className="flex items-center gap-2 rounded-full border border-[#dadce0] px-4 py-1.5 text-sm font-medium text-[#5f6368] transition hover:bg-[#f1f3f4]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">

        {/* ---- Onboarding tab ---- */}
        {activeTab === 'onboard' && (
          <OnboardingPage
            onSubmit={handleOnboardingSubmit}
            onCancel={() => setActiveTab('recommender')}
          />
        )}

        {/* ---- Pipeline recommender tab ---- */}
        {activeTab === 'recommender' && <>

        {/* ---- Title + actions ---- */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[28px] font-normal tracking-tight text-[#202124]">Pipeline Recommender</h2>
            <p className="mt-1 max-w-xl text-sm text-[#5f6368]">
              Hybrid scoring (skills · track record · personality · level) feeds a portfolio-global,
              cohesion-aware optimizer that staffs every open project at once.
            </p>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => { setShowAddForm(v => !v); setFormError(null); }}
              className="flex items-center gap-2 rounded-full border border-[#dadce0] bg-white px-5 py-2.5 text-sm font-medium text-[#1a73e8] transition hover:bg-[#f8fbff]"
            >
              <Plus className="h-4 w-4" /> Add project
            </button>
            <button
              onClick={runRecommender}
              disabled={isRunning || pipeline.length === 0}
              className="flex items-center gap-2 rounded-full bg-[#1a73e8] px-6 py-2.5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(60,64,67,0.3)] transition hover:bg-[#1b66c9] disabled:cursor-not-allowed disabled:bg-[#e8eaed] disabled:text-[#9aa0a6] disabled:shadow-none"
            >
              {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isRunning ? 'Optimizing…' : 'Run Recommender'}
            </button>
          </div>
        </div>

        {/* ---- Model validity (ground-truth eval) ---- */}
        {modelEval && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#d2e3fc] bg-[#e8f0fe] p-4 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 text-[#1967d2]">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Model validity</span>
              </div>
              <div className="mt-2 font-mono text-2xl font-medium tabular-nums text-[#1967d2]">
                r = {modelEval.correlation.toFixed(2)}
              </div>
              <div className="mt-0.5 text-xs text-[#5f6368]">
                predicted score vs. stored ground truth · n={modelEval.n.toLocaleString()}
              </div>
              {mfMetrics && (
                <div className="mt-2 border-t border-[#d2e3fc] pt-2 text-[11px] text-[#5f6368]">
                  CF = Matrix Factorization · test RMSE{' '}
                  <span className="font-medium text-[#1967d2]">{mfMetrics.rmse_mf}</span>
                  <span className="text-[#1e8e3e]"> · beats baseline {mfMetrics.mf_lift_over_domain_mean_pct}%</span>
                </div>
              )}
            </div>
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Top-decile precision"
              value={`${Math.round(modelEval.topDecilePrecision * 100)}%`}
              sub="top-10% picks that were genuinely top-tier"
              accent="text-[#1e8e3e]"
            />
            <StatCard
              icon={<Layers className="h-4 w-4" />}
              label="Pipeline"
              value={pipeline.length}
              sub="open projects to staff"
            />
            <StatCard
              icon={<Sparkles className="h-4 w-4" />}
              label="Search space"
              value={(pipeline.length * effectivePool).toLocaleString()}
              sub="candidate (person × project) pairs"
            />
          </div>
        )}

        {/* Talent-pool control: shrink the available pool to create contention */}
        <div className={`${CARD} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5`}>
          <div className="shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Available talent pool</div>
            <div className="text-xs text-[#80868b]">How many free engineers the optimizer may draw from</div>
          </div>
          <input
            type="range" min={20} max={Math.max(availableCount, 40)} step={5}
            value={poolCap}
            onChange={e => { setPoolCap(parseInt(e.target.value)); setResults(null); }}
            className="h-2 flex-1 cursor-pointer accent-[#1a73e8]"
          />
          <div className="shrink-0 font-mono text-sm tabular-nums text-[#202124]">
            {effectivePool} <span className="text-[#80868b]">/ {availableCount} free</span>
          </div>
        </div>

        {/* ---- Add Project form ---- */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className={`${CARD} p-5`}>
                <h3 className="mb-4 flex items-center gap-2 font-medium text-[#202124]">
                  <Plus className="h-4 w-4 text-[#1a73e8]" /> New project
                </h3>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <label className="col-span-2 block">
                    <span className={fieldLabel}>Title</span>
                    <input
                      value={newProject.title}
                      onChange={e => setNewProject({ ...newProject, title: e.target.value })}
                      className={field}
                      placeholder="Real-Time Ranking Engine"
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabel}>Domain</span>
                    <select
                      value={newProject.domain}
                      onChange={e => setNewProject({ ...newProject, domain: e.target.value })}
                      className={field}
                    >
                      {PROJECT_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className={fieldLabel}>Priority (1–5)</span>
                    <input
                      type="number" min={1} max={5} value={newProject.priority}
                      onChange={e => setNewProject({ ...newProject, priority: parseInt(e.target.value) || 1 })}
                      className={field}
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabel}>Min size</span>
                    <input
                      type="number" min={1} max={20} value={newProject.minSize}
                      onChange={e => setNewProject({ ...newProject, minSize: parseInt(e.target.value) || 1 })}
                      className={field}
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabel}>Target size</span>
                    <input
                      type="number" min={1} max={20} value={newProject.targetSize}
                      onChange={e => setNewProject({ ...newProject, targetSize: parseInt(e.target.value) || 1 })}
                      className={field}
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabel}>Max size</span>
                    <input
                      type="number" min={1} max={20} value={newProject.maxSize}
                      onChange={e => setNewProject({ ...newProject, maxSize: parseInt(e.target.value) || 1 })}
                      className={field}
                    />
                  </label>
                  <div className="col-span-2 lg:col-span-4">
                    <span className={fieldLabel}>Required skills</span>
                    <div className="mt-1.5">
                      <SkillsEditor
                        value={newProject.skills}
                        onChange={skills => setNewProject({ ...newProject, skills })}
                        domain={newProject.domain}
                      />
                    </div>
                  </div>
                  <div className="col-span-2 lg:col-span-4">
                    <span className={fieldLabel}>Required roles</span>
                    <div className="mt-1.5">
                      <RolesEditor
                        value={newProject.roles}
                        onChange={roles => setNewProject({ ...newProject, roles })}
                      />
                    </div>
                  </div>
                </div>

                {formError && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#f6c4c0] bg-[#fce8e6] px-3 py-2 text-sm text-[#c5221f]">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <button onClick={addToPipeline} className="rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1b66c9]">
                    Add to pipeline
                  </button>
                  <button onClick={() => { setShowAddForm(false); setFormError(null); }} className="rounded-full px-4 py-2 text-sm font-medium text-[#1a73e8] transition hover:bg-[#f1f3f4]">
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Pipeline chips ---- */}
        <section>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">
            Current pipeline · {pipeline.length} project{pipeline.length !== 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            {pipeline.length > 0 ? pipeline.map(proj => (
              <div key={proj.project_id} className="group flex items-center gap-2.5 rounded-xl border border-[#dadce0] bg-white py-2 pl-3.5 pr-2.5 text-sm shadow-[0_1px_2px_rgba(60,64,67,0.08)]">
                <span className="font-medium text-[#202124]">{proj.title}</span>
                <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[10px] text-[#5f6368]">{proj.domain}</span>
                <span className="rounded-full bg-[#e8f0fe] px-1.5 py-0.5 text-[10px] font-semibold text-[#1967d2]">P{proj.priority}</span>
                {proj.isUserAdded && <span className="text-[10px] font-medium text-[#34A853]">new</span>}
                <button
                  onClick={() => removeFromPipeline(proj.project_id)}
                  className="rounded-md p-0.5 text-[#9aa0a6] opacity-60 transition hover:bg-[#fce8e6] hover:text-[#d93025] group-hover:opacity-100"
                  aria-label={`Remove ${proj.title}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )) : (
              <div className="text-sm text-[#80868b]">No projects in the pipeline. Add one above or hit Reset.</div>
            )}
          </div>
        </section>

        {/* ---- Results ---- */}
        {results && coverage && (
          <section className="space-y-5 animate-fade-in-up">
            {/* portfolio thermometer: achieved vs theoretical ceiling */}
            <div className={`${CARD} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-[#5f6368]">
                <Award className="h-4 w-4 text-[#1a73e8]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Portfolio optimization · achieved vs. ceiling</span>
              </div>
              <PortfolioThermometer current={results.totalScore} max={results.upperBound} />
            </div>

            {/* portfolio summary */}
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard icon={<Gauge className="h-4 w-4" />} label="Coverage" value={`${coverage.coveragePct}%`} sub={`${coverage.slotsFilled}/${coverage.slotsTarget} target slots filled`} accent="text-[#1a73e8]" />
              <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Teams staffed" value={`${coverage.fullyStaffed}/${coverage.totalProjects}`} sub={`${coverage.partiallyStaffed} partial · ${coverage.unstaffed} unstaffed`} />
              <StatCard icon={<Users className="h-4 w-4" />} label="Avg cohesion" value={coverage.avgCohesion.toFixed(2)} sub="team personality chemistry (0–1)" accent="text-[#a142f4]" />
            </div>

            {/* constraint validation */}
            <div className={`rounded-2xl border p-4 ${violations.length === 0 ? 'border-[#ceead6] bg-[#e6f4ea]' : 'border-[#feefc3] bg-[#fef7e0]'}`}>
              <div className="flex items-center gap-2">
                {violations.length === 0
                  ? <><CheckCircle2 className="h-4 w-4 text-[#1e8e3e]" /><span className="text-sm font-medium text-[#137333]">All hard constraints satisfied</span></>
                  : <><AlertTriangle className="h-4 w-4 text-[#e37400]" /><span className="text-sm font-medium text-[#b06000]">{violations.length} constraint note{violations.length > 1 ? 's' : ''}</span></>}
              </div>
              {violations.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-[#7d5800]">
                  {violations.slice(0, 6).map((v, i) => <li key={i}>• {v}</li>)}
                  {violations.length > 6 && <li>• …and {violations.length - 6} more</li>}
                </ul>
              )}
            </div>

            {/* per-project teams */}
            <div className="grid gap-4">
              {pipeline.map(proj => {
                const team = results.assignments.find(a => a.project_id === proj.project_id);
                if (!team) return null;
                const filled = team.employees.length;
                const ok = filled >= proj.required_team_size_min;

                return (
                  <div key={proj.project_id} className={`${CARD} p-5`}>
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-medium text-[#202124]">{proj.title}</span>
                          <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[10px] text-[#5f6368]">{proj.domain}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-[#80868b]">
                          Priority {proj.priority} · target {proj.required_team_size_target} (min {proj.required_team_size_min} / max {proj.required_team_size_max})
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className={`text-xs font-medium ${ok ? 'text-[#1e8e3e]' : 'text-[#e37400]'}`}>{filled}/{proj.required_team_size_target} staffed</div>
                          <div className="text-[10px] text-[#80868b]">cohesion {team.cohesion.toFixed(2)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-2xl font-medium tabular-nums text-[#1e8e3e]">{team.teamScore}</div>
                          <div className="text-[10px] uppercase tracking-wider text-[#80868b]">team score</div>
                        </div>
                      </div>
                    </div>

                    {team.employees.length > 0 ? (
                      <div className="space-y-1.5">
                        {team.employees.map(empId => {
                          const emp = getEmployee(empId);
                          if (!emp) return null;
                          const indScore = team.individualScores[empId] || 0;
                          const fs = results.scores.find(s => s.employee_id === empId && s.project_id === proj.project_id);
                          const seg = fs ? SEGMENT_META[fs.segment] : null;
                          return (
                            <div key={empId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8eaed] bg-[#f8f9fa] px-3.5 py-2.5">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: avatarColor(emp.name) }}>
                                  {emp.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-[#202124]">{emp.name}</div>
                                  <div className="text-[11px] text-[#80868b]">
                                    <span className={levelTone(emp.level)}>{emp.level}</span> · {emp.role_category} · {emp.primary_domain || 'No domain'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {fs && (
                                  <div className="hidden items-center gap-2 md:flex">
                                    <Bar label="Sk" value={fs.breakdown.skill} color={G.blue} />
                                    <Bar label="Hi" value={fs.breakdown.history} color={G.green} />
                                    <Bar label="Pe" value={fs.breakdown.personality} color={G.red} />
                                    <Bar label="Lv" value={fs.breakdown.level} color={G.yellow} />
                                  </div>
                                )}
                                {seg && (
                                  <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex ${seg.cls}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${seg.dot}`} />{seg.label}
                                  </span>
                                )}
                                <div className="w-10 text-right font-mono text-base font-medium tabular-nums text-[#1e8e3e]">{indScore}</div>
                                <button
                                  onClick={() => setAnalysis({ empId, projId: proj.project_id })}
                                  className="flex items-center gap-1 rounded-lg border border-[#dadce0] px-2 py-1 text-[10px] font-medium text-[#1a73e8] transition hover:bg-[#e8f0fe]"
                                  title="Open detailed analysis"
                                >
                                  <BarChart2 className="h-3 w-3" />
                                  Analyze
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl border border-[#feefc3] bg-[#fef7e0] px-3.5 py-3 text-xs text-[#b06000]">
                        <AlertTriangle className="h-4 w-4" /> No qualified team found under the current constraints and available pool.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="pt-2 text-center text-[11px] text-[#9aa0a6]">
              Scores: hybrid model (content-based + collaborative + personality + level) with segment-specific weighting.
              Optimizer maximizes portfolio value with a cohesion-weighted objective and hard role/size/availability constraints.
            </p>
          </section>
        )}

        {!results && pipeline.length > 0 && (
          <div className="rounded-2xl border border-dashed border-[#dadce0] py-14 text-center">
            <Play className="mx-auto mb-3 h-6 w-6 text-[#9aa0a6]" />
            <p className="text-sm text-[#5f6368]">
              Hit <span className="font-medium text-[#202124]">Run Recommender</span> to score every available engineer against each project and staff the whole pipeline.
            </p>
          </div>
        )}
        </> /* end recommender tab */}
      </div>

      {/* ---- Analysis drawer (slide-in from right) ---- */}
      <AnimatePresence>
        {drawerData && (
          <AnalysisDrawer
            key={`${drawerData.emp.employee_id}-${drawerData.proj.project_id}`}
            emp={drawerData.emp}
            proj={drawerData.proj}
            score={drawerData.score}
            allScores={results!.scores}
            pipeline={pipeline}
            mfMetrics={mfMetrics}
            assignmentSource={drawerData.source}
            isOnboardingEmployee={drawerData.isOnboardingEmployee}
            onClose={() => setAnalysis(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
