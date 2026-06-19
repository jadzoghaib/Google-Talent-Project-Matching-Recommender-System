import { useState, useEffect, useMemo } from 'react';
import {
  Users, Target, Play, Plus, RefreshCw, Award, Sparkles, CheckCircle2,
  AlertTriangle, X, Layers, Gauge, TrendingUp, ShieldCheck, UserCheck,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import type { Employee, Project, MatchScore, TeamAssignment, Assignment } from './lib/types';
import { loadEmployees, loadProjects, loadHistorical } from './lib/dataLoader';
import { computeMatchScore } from './lib/scorer';
import { optimizeAssignments, validateAssignments } from './lib/optimizer';
import { evaluateModel, computeCoverage } from './lib/evaluation';
import type { ModelEvaluation } from './lib/evaluation';

interface PipelineProject extends Project {
  isUserAdded?: boolean;
}

const DOMAINS = ['Search', 'Ads', 'YouTube', 'Android', 'Cloud', 'AI Platform', 'Payments', 'Infra', 'Maps', 'Workspace', 'Chrome'];

const SEGMENT_META: Record<string, { label: string; cls: string; dot: string }> = {
  exploration: { label: 'Explore', cls: 'bg-sky-500/15 text-sky-300 border border-sky-500/30', dot: 'bg-sky-400' },
  exploitation: { label: 'Exploit', cls: 'bg-amber-500/15 text-amber-300 border border-amber-500/30', dot: 'bg-amber-400' },
  balanced: { label: 'Balanced', cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30', dot: 'bg-emerald-400' },
};

// -------------------------------------------------------------------- helpers
function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${value.toFixed(2)}`}>
      <span className="w-4 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, accent = 'text-white',
}: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--panel)] p-4">
      <div className="flex items-center gap-2 text-zinc-400">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function levelTone(level: string): string {
  const i = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'].indexOf(level);
  if (i >= 4) return 'text-fuchsia-300';
  if (i >= 2) return 'text-blue-300';
  return 'text-zinc-300';
}

function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [historical, setHistorical] = useState<Assignment[]>([]);
  const [pipeline, setPipeline] = useState<PipelineProject[]>([]);
  const [results, setResults] = useState<{ assignments: TeamAssignment[]; totalScore: number; scores: MatchScore[] } | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [modelEval, setModelEval] = useState<ModelEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({
    title: '', domain: 'Search', priority: 3, minSize: 3, targetSize: 5, maxSize: 7,
    skills: 'Python, Distributed Systems',
  });

  // ---- data load ----------------------------------------------------------
  useEffect(() => {
    async function loadData() {
      try {
        const [emps, projs, hist] = await Promise.all([loadEmployees(), loadProjects(), loadHistorical()]);
        setEmployees(emps);
        setAllProjects(projs);
        setHistorical(hist);
        setPipeline(projs.filter(p => p.status === 'pipeline').slice(0, 6).map(p => ({ ...p, isUserAdded: false })));

        // Honest evaluation against stored ground truth (runs once on load).
        try { setModelEval(evaluateModel(emps, projs, hist)); } catch { /* eval is best-effort */ }

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
    () => employees.filter(e => !e.current_staffed && new Date(e.available_from) <= new Date()).length,
    [employees],
  );

  const coverage = useMemo(
    () => (results ? computeCoverage(results.assignments, pipeline) : null),
    [results, pipeline],
  );

  // ---- recommender --------------------------------------------------------
  const runRecommender = async () => {
    if (pipeline.length === 0) { toast.error('Add at least one project to the pipeline'); return; }
    setIsRunning(true);
    await new Promise(r => setTimeout(r, 40)); // let the spinner paint

    try {
      const availableEmps = employees.filter(e => !e.current_staffed);
      const projectDomainMap: Record<string, string> = {};
      [...allProjects, ...pipeline].forEach(p => { if (p.project_id) projectDomainMap[p.project_id] = p.domain; });

      const allScores: MatchScore[] = [];
      pipeline.forEach(proj => {
        availableEmps.forEach(emp => {
          allScores.push(computeMatchScore(emp, proj, historical, projectDomainMap));
        });
      });

      const { assignments, totalScore } = optimizeAssignments(pipeline, employees, allScores, historical);
      setResults({ assignments, totalScore, scores: allScores });

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
    const { title, minSize, targetSize, maxSize, skills } = newProject;
    if (!title.trim()) return 'Project title is required.';
    if ([minSize, targetSize, maxSize].some(v => !Number.isFinite(v) || v < 1)) return 'Team sizes must be positive whole numbers.';
    if (minSize > targetSize) return 'Minimum size cannot exceed target size.';
    if (targetSize > maxSize) return 'Target size cannot exceed maximum size.';
    if (maxSize > 20) return 'Maximum team size for this demo is 20.';
    if (skills.split(',').map(s => s.trim()).filter(Boolean).length === 0) return 'Add at least one required skill.';
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
      required_roles: [
        { role: 'Tech Lead', min_level: 'L6', count: 1 },
        { role: 'Software Engineer', min_level: 'L4', count: Math.max(1, newProject.targetSize - 1) },
      ],
      required_skills: newProject.skills.split(',').map(s => s.trim()).filter(Boolean).map(s => ({ skill: s, min_proficiency: 3, weight: 1.0 })),
      tech_requirements: [],
      duration_weeks: 16,
      target_start_date: new Date(Date.now() + 1000 * 3600 * 24 * 30).toISOString().split('T')[0],
      status: 'pipeline',
      isUserAdded: true,
    };

    setPipeline(prev => [...prev, proj]);
    setShowAddForm(false);
    setResults(null);
    setNewProject({ title: '', domain: 'Search', priority: 3, minSize: 3, targetSize: 5, maxSize: 7, skills: 'Python, Distributed Systems' });
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

  const getEmployee = (id: string) => employees.find(e => e.employee_id === id);

  // ---- loading state ------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-300">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
          <span>Loading TeamMatch data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-zinc-100">
      <Toaster position="top-center" theme="dark" richColors />

      {/* ---- Header ---- */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0b11]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-lg font-semibold tracking-tight">TeamMatch</h1>
              <p className="text-[11px] text-zinc-500">Talent → Project Recommender</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 sm:flex">
              <Users className="h-3.5 w-3.5 text-zinc-400" />
              <span className="tabular-nums">{employees.length}</span>
              <span className="text-zinc-500">staff</span>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 sm:flex">
              <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="tabular-nums">{availableCount}</span>
              <span className="text-zinc-500">available</span>
            </div>
            <button
              onClick={resetPipeline}
              className="flex items-center gap-2 rounded-xl border border-white/15 px-3 py-1.5 text-sm transition hover:bg-white/5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* ---- Title + actions ---- */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Pipeline Recommender</h2>
            <p className="mt-1 max-w-xl text-sm text-zinc-400">
              Hybrid scoring (skills · track record · personality · level) feeds a portfolio-global,
              cohesion-aware optimizer that staffs every open project at once.
            </p>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => { setShowAddForm(v => !v); setFormError(null); }}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium transition hover:bg-white/10"
            >
              <Plus className="h-4 w-4" /> Add Project
            </button>
            <button
              onClick={runRecommender}
              disabled={isRunning || pipeline.length === 0}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-400 hover:to-indigo-500 disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
            >
              {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isRunning ? 'Optimizing…' : 'Run Recommender'}
            </button>
          </div>
        </div>

        {/* ---- Model validity (ground-truth eval) ---- */}
        {modelEval && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 text-blue-300">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Model validity</span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-blue-200">
                r = {modelEval.correlation.toFixed(2)}
              </div>
              <div className="mt-0.5 text-xs text-zinc-400">
                predicted score vs. stored ground truth · n={modelEval.n.toLocaleString()}
              </div>
            </div>
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Top-decile precision"
              value={`${Math.round(modelEval.topDecilePrecision * 100)}%`}
              sub="top-10% picks that were genuinely top-tier"
              accent="text-emerald-300"
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
              value={(pipeline.length * availableCount).toLocaleString()}
              sub="candidate (person × project) pairs"
            />
          </div>
        )}

        {/* ---- Add Project form ---- */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-white/10 bg-[var(--panel)] p-5">
                <h3 className="mb-4 flex items-center gap-2 font-medium">
                  <Plus className="h-4 w-4 text-blue-400" /> New project
                </h3>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <label className="col-span-2 block">
                    <span className="text-xs text-zinc-400">Title</span>
                    <input
                      value={newProject.title}
                      onChange={e => setNewProject({ ...newProject, title: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm focus:border-blue-500/60"
                      placeholder="Real-Time Ranking Engine"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Domain</span>
                    <select
                      value={newProject.domain}
                      onChange={e => setNewProject({ ...newProject, domain: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm focus:border-blue-500/60"
                    >
                      {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Priority (1–5)</span>
                    <input
                      type="number" min={1} max={5} value={newProject.priority}
                      onChange={e => setNewProject({ ...newProject, priority: parseInt(e.target.value) || 1 })}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm focus:border-blue-500/60"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Min size</span>
                    <input
                      type="number" min={1} max={20} value={newProject.minSize}
                      onChange={e => setNewProject({ ...newProject, minSize: parseInt(e.target.value) || 1 })}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm focus:border-blue-500/60"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Target size</span>
                    <input
                      type="number" min={1} max={20} value={newProject.targetSize}
                      onChange={e => setNewProject({ ...newProject, targetSize: parseInt(e.target.value) || 1 })}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm focus:border-blue-500/60"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Max size</span>
                    <input
                      type="number" min={1} max={20} value={newProject.maxSize}
                      onChange={e => setNewProject({ ...newProject, maxSize: parseInt(e.target.value) || 1 })}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm focus:border-blue-500/60"
                    />
                  </label>
                  <label className="col-span-2 block lg:col-span-4">
                    <span className="text-xs text-zinc-400">Required skills (comma-separated)</span>
                    <input
                      value={newProject.skills}
                      onChange={e => setNewProject({ ...newProject, skills: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm focus:border-blue-500/60"
                      placeholder="Machine Learning, Distributed Systems, Python"
                    />
                  </label>
                </div>

                {formError && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
                  </div>
                )}

                <div className="mt-4 flex gap-2.5">
                  <button onClick={addToPipeline} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500">
                    Add to pipeline
                  </button>
                  <button onClick={() => { setShowAddForm(false); setFormError(null); }} className="px-4 py-2 text-sm text-zinc-400 transition hover:text-white">
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Pipeline chips ---- */}
        <section>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Current pipeline · {pipeline.length} project{pipeline.length !== 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            {pipeline.length > 0 ? pipeline.map(proj => (
              <div key={proj.project_id} className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-[var(--panel)] py-2 pl-3.5 pr-2.5 text-sm">
                <span className="font-medium">{proj.title}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">{proj.domain}</span>
                <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">P{proj.priority}</span>
                {proj.isUserAdded && <span className="text-[10px] text-emerald-400">new</span>}
                <button
                  onClick={() => removeFromPipeline(proj.project_id)}
                  className="rounded-md p-0.5 text-zinc-500 opacity-50 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  aria-label={`Remove ${proj.title}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )) : (
              <div className="text-sm text-zinc-500">No projects in the pipeline. Add one above or hit Reset.</div>
            )}
          </div>
        </section>

        {/* ---- Results ---- */}
        {results && coverage && (
          <section className="space-y-5 animate-fade-in-up">
            {/* portfolio summary */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={<Award className="h-4 w-4" />} label="Portfolio score" value={results.totalScore} sub="sum of all matched individual scores" accent="text-emerald-300" />
              <StatCard icon={<Gauge className="h-4 w-4" />} label="Coverage" value={`${coverage.coveragePct}%`} sub={`${coverage.slotsFilled}/${coverage.slotsTarget} target slots filled`} accent="text-blue-300" />
              <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Teams staffed" value={`${coverage.fullyStaffed}/${coverage.totalProjects}`} sub={`${coverage.partiallyStaffed} partial · ${coverage.unstaffed} unstaffed`} />
              <StatCard icon={<Users className="h-4 w-4" />} label="Avg cohesion" value={coverage.avgCohesion.toFixed(2)} sub="team personality chemistry (0–1)" accent="text-fuchsia-300" />
            </div>

            {/* constraint validation */}
            <div className={`rounded-2xl border p-4 ${violations.length === 0 ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
              <div className="flex items-center gap-2">
                {violations.length === 0
                  ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="text-sm font-medium text-emerald-300">All hard constraints satisfied</span></>
                  : <><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="text-sm font-medium text-amber-300">{violations.length} constraint note{violations.length > 1 ? 's' : ''}</span></>}
              </div>
              {violations.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-200/80">
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
                  <div key={proj.project_id} className="rounded-2xl border border-white/10 bg-[var(--panel)] p-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">{proj.title}</span>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">{proj.domain}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          Priority {proj.priority} · target {proj.required_team_size_target} (min {proj.required_team_size_min} / max {proj.required_team_size_max})
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className={`text-xs font-medium ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{filled}/{proj.required_team_size_target} staffed</div>
                          <div className="text-[10px] text-zinc-500">cohesion {team.cohesion.toFixed(2)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-2xl font-semibold tabular-nums text-emerald-300">{team.teamScore}</div>
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">team score</div>
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
                            <div key={empId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3.5 py-2.5">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-[11px] font-semibold text-zinc-200">
                                  {emp.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{emp.name}</div>
                                  <div className="text-[11px] text-zinc-500">
                                    <span className={levelTone(emp.level)}>{emp.level}</span> · {emp.role_category} · {emp.primary_domain || 'No domain'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {fs && (
                                  <div className="hidden items-center gap-2 md:flex">
                                    <Bar label="Sk" value={fs.breakdown.skill} color="bg-emerald-400" />
                                    <Bar label="Hi" value={fs.breakdown.history} color="bg-blue-400" />
                                    <Bar label="Pe" value={fs.breakdown.personality} color="bg-fuchsia-400" />
                                    <Bar label="Lv" value={fs.breakdown.level} color="bg-amber-400" />
                                  </div>
                                )}
                                {seg && (
                                  <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex ${seg.cls}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${seg.dot}`} />{seg.label}
                                  </span>
                                )}
                                <div className="w-10 text-right font-mono text-base font-semibold tabular-nums text-emerald-300">{indScore}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3 text-xs text-amber-300">
                        <AlertTriangle className="h-4 w-4" /> No qualified team found under the current constraints and available pool.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="pt-2 text-center text-[11px] text-zinc-600">
              Scores: hybrid model (content-based + collaborative + personality + level) with segment-specific weighting.
              Optimizer maximizes portfolio value with a cohesion-weighted objective and hard role/size/availability constraints.
            </p>
          </section>
        )}

        {!results && pipeline.length > 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center">
            <Play className="mx-auto mb-3 h-6 w-6 text-zinc-600" />
            <p className="text-sm text-zinc-400">
              Hit <span className="font-medium text-white">Run Recommender</span> to score every available engineer against each project and staff the whole pipeline.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
