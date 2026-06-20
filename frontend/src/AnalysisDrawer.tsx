import { useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Employee, Project, MatchScore } from './lib/types';
import { WEIGHTS } from './lib/scorer';
import type { AssignmentSource } from './lib/optimizer';
import type { MFMetrics } from './lib/dataLoader';

const G = { blue: '#4285F4', red: '#EA4335', yellow: '#FBBC04', green: '#34A853', blue600: '#1a73e8' };
const AVATAR_COLORS = ['#4285F4', '#EA4335', '#34A853', '#1a73e8', '#a142f4', '#f9ab00', '#12b5cb'];

const DOMAIN_COLORS: Record<string, string> = {
  Search: '#4285F4', Ads: '#FBBC04', YouTube: '#EA4335', Android: '#34A853',
  Cloud: '#1a73e8', 'AI Platform': '#a142f4', Payments: '#0F9D58',
  Infra: '#5f6368', Maps: '#F4B400', Workspace: '#4A90D9', Chrome: '#d93025',
};

const SEGMENT_META = {
  exploration: { label: 'Exploration', desc: 'Juniors — rewards novelty & serendipity', color: '#1967d2', bg: '#e8f0fe' },
  exploitation: { label: 'Exploitation', desc: 'Seniors — rewards proven track record', color: '#b06000', bg: '#fef7e0' },
  balanced:     { label: 'Balanced',     desc: 'Mid-level — blends skill + history', color: '#137333', bg: '#e6f4ea' },
};

const SOURCE_META: Record<AssignmentSource, { label: string; cls: string }> = {
  greedy: { label: 'Greedy (phase 1)', cls: 'bg-[#e6f4ea] text-[#137333]' },
  repair: { label: 'Repair (phase 2)', cls: 'bg-[#fef7e0] text-[#b06000]' },
  swap:   { label: 'Local-search swap (phase 3)', cls: 'bg-[#e8f0fe] text-[#1967d2]' },
};

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ── sub-components ─────────────────────────────────────────────────────────────

function SignalBar({
  label, value, weight, color, modelTag, modelHighlight,
}: {
  label: string; value: number; weight: number; color: string;
  modelTag: string; modelHighlight?: boolean;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const contribution = Math.round(value * weight * 100) / 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#202124]">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${modelHighlight ? 'bg-[#e6f4ea] text-[#137333]' : 'bg-[#f1f3f4] text-[#5f6368]'}`}>
            {modelTag}
          </span>
          <span className="w-9 text-right font-mono text-[12px] font-semibold text-[#202124]">
            {value.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8eaed]">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="w-24 text-right text-[10px] text-[#9aa0a6]">
          ×{weight.toFixed(2)} = <span className="font-medium text-[#5f6368]">{contribution}</span>
        </span>
      </div>
    </div>
  );
}

function RankBox({
  label, value, sub, highlight,
}: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'border-[#34A853] bg-[#f8fef9]' : 'border-[#e8eaed] bg-[#f8f9fa]'}`}>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-[#5f6368]">{label}</div>
      <div className={`font-mono text-xl font-semibold leading-tight ${highlight ? 'text-[#34A853]' : 'text-[#202124]'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-[#80868b]">{sub}</div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

interface Props {
  emp: Employee;
  proj: Project;
  score: MatchScore;
  allScores: MatchScore[];
  pipeline: Project[];
  mfMetrics: MFMetrics | null;
  assignmentSource: AssignmentSource;
  onClose: () => void;
}

export function AnalysisDrawer({ emp, proj, score, allScores, pipeline, mfMetrics, assignmentSource, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Derived analysis data
  const projScores = allScores
    .filter(s => s.project_id === proj.project_id)
    .sort((a, b) => b.score - a.score);
  const candidateRank = projScores.findIndex(s => s.employee_id === emp.employee_id) + 1;
  const totalCandidates = projScores.length;

  const empScores = allScores
    .filter(s => s.employee_id === emp.employee_id)
    .sort((a, b) => b.score - a.score);
  const preferredProjectRank = empScores.findIndex(s => s.project_id === proj.project_id) + 1;

  const topProjects = empScores
    .slice(0, 5)
    .map(s => ({ project: pipeline.find(p => p.project_id === s.project_id), sc: s.score, assigned: s.project_id === proj.project_id }))
    .filter(x => x.project != null);

  const weights = WEIGHTS[score.segment];
  const segMeta = SEGMENT_META[score.segment];
  const sourceMeta = SOURCE_META[assignmentSource];
  const isCrossDomain = emp.primary_domain !== proj.domain && emp.primary_domain !== null;

  const initials = emp.name.split(' ').map(p => p[0]).slice(0, 2).join('');
  const color = avatarColor(emp.name);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[500px] flex-col overflow-y-auto bg-white shadow-2xl"
        role="dialog"
        aria-label={`Analysis for ${emp.name}`}
      >

        {/* ── Sticky header ─────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 border-b border-[#e8eaed] bg-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: color }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold leading-tight text-[#202124]">{emp.name}</div>
              <div className="mt-0.5 text-[11px] text-[#5f6368]">
                {emp.level} · {emp.role_category} · {emp.primary_domain ?? 'No domain'} · {emp.years_experience}y exp
              </div>
            </div>
            <div className="mr-1 shrink-0 text-right">
              <div className="font-mono text-3xl font-semibold leading-tight text-[#1a73e8]">{score.score}</div>
              <div className="text-[10px] uppercase tracking-wide text-[#80868b]">match / 10</div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-[#5f6368] transition hover:bg-[#f1f3f4]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Project context pill */}
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wide text-[#5f6368]">Assigned to</span>
            <ChevronRight className="h-3 w-3 text-[#9aa0a6]" />
            <span className="text-[12px] font-medium text-[#202124]">{proj.title}</span>
            <span className="ml-auto rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[10px] font-medium text-[#1967d2]">
              {proj.domain}
            </span>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-5 px-5 py-4">

          {/* Status chips */}
          <div className="flex flex-wrap gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ background: segMeta.bg, color: segMeta.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: segMeta.color }} />
              {segMeta.label} segment
            </span>
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${score.usedMF ? 'bg-[#e6f4ea] text-[#137333]' : 'bg-[#f1f3f4] text-[#5f6368]'}`}>
              {score.usedMF ? '✦ Matrix Factorization' : 'CF: historical avg'}
            </span>
            {isCrossDomain && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#fce8e6] px-2.5 py-1 text-[11px] font-medium text-[#c5221f]">
                Cross-domain match
              </span>
            )}
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${sourceMeta.cls}`}>
              {sourceMeta.label}
            </span>
          </div>

          {/* ── 1. Score breakdown ─────────────────────────────────── */}
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">
              Score breakdown — 5 signals
            </div>
            <div className="space-y-3.5">
              <SignalBar
                label="Skill Match"
                value={score.breakdown.skill}
                weight={weights.skill}
                color={G.blue}
                modelTag="Content-Based (CBF)"
              />
              <SignalBar
                label="Collaborative Filtering"
                value={score.breakdown.history}
                weight={weights.history}
                color={G.green}
                modelTag={score.usedMF && score.mfRawPred !== undefined
                  ? `MF pred ${score.mfRawPred.toFixed(1)}/5`
                  : 'Historical avg'}
                modelHighlight={score.usedMF}
              />
              <SignalBar
                label="Personality Fit"
                value={score.breakdown.personality}
                weight={weights.personality}
                color={G.red}
                modelTag="Big Five OCEAN"
              />
              <SignalBar
                label="Level / Role Fit"
                value={score.breakdown.level}
                weight={weights.level}
                color={G.yellow}
                modelTag={`${emp.level} · ${emp.role_category}`}
              />
              {score.breakdown.novelty !== undefined && weights.novelty > 0 && (
                <SignalBar
                  label="Novelty Bonus"
                  value={score.breakdown.novelty}
                  weight={weights.novelty}
                  color="#9aa0a6"
                  modelTag="Cross-domain"
                />
              )}
            </div>
            <div className="mt-3 rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-3 py-2 text-[10px] text-[#80868b]">
              Weights ({score.segment}): skill ×{weights.skill} · CF ×{weights.history} · personality ×{weights.personality} · level ×{weights.level}{weights.novelty > 0 ? ` · novelty ×${weights.novelty}` : ''}
            </div>
          </div>

          <hr className="border-[#e8eaed]" />

          {/* ── 2. Optimizer context ───────────────────────────────── */}
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">
              Optimizer context
            </div>
            <div className="grid grid-cols-2 gap-2">
              <RankBox
                label="Candidate rank for this project"
                value={`#${candidateRank}`}
                sub={`of ${totalCandidates} eligible candidates`}
                highlight={candidateRank === 1}
              />
              <RankBox
                label="Their project preference rank"
                value={preferredProjectRank === 1 ? '#1 ✓' : `#${preferredProjectRank}`}
                sub={preferredProjectRank === 1
                  ? 'This was their first-choice project'
                  : `${preferredProjectRank === 2 ? 'Second choice' : `Choice #${preferredProjectRank}`} — top pick was taken`}
                highlight={preferredProjectRank === 1}
              />
              <RankBox
                label="Assignment phase"
                value={assignmentSource === 'greedy' ? 'Phase 1' : assignmentSource === 'repair' ? 'Phase 2' : 'Phase 3'}
                sub={sourceMeta.label}
              />
              <RankBox
                label="Project priority"
                value={`P${proj.priority}`}
                sub={proj.priority === 1 ? 'Highest priority' : `Priority ${proj.priority} / 5`}
              />
            </div>
          </div>

          <hr className="border-[#e8eaed]" />

          {/* ── 3. Alternative fits ────────────────────────────────── */}
          <div>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">
              Their top matches across the pipeline
            </div>
            <div className="space-y-1.5">
              {topProjects.map(({ project, sc, assigned }, i) => (
                <div
                  key={project!.project_id}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${assigned ? 'border-[#d2e3fc] bg-[#e8f0fe]' : 'border-[#e8eaed] bg-[#f8f9fa]'}`}
                >
                  <span className="w-5 text-[11px] font-semibold text-[#9aa0a6]">#{i + 1}</span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: DOMAIN_COLORS[project!.domain] ?? '#5f6368' }}
                  />
                  <span className="flex-1 truncate text-[12px] font-medium text-[#202124]">{project!.title}</span>
                  {assigned && (
                    <span className="shrink-0 rounded-full bg-[#4285F4] px-2 py-0.5 text-[10px] font-medium text-white">
                      assigned ✓
                    </span>
                  )}
                  <span className={`shrink-0 font-mono text-[13px] font-semibold ${assigned ? 'text-[#1a73e8]' : 'text-[#5f6368]'}`}>
                    {sc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 4. MF model callout ────────────────────────────────── */}
          {mfMetrics && (
            <>
              <hr className="border-[#e8eaed]" />
              <div className="rounded-xl border-l-4 border-[#4285F4] bg-[#f8f9fa] p-4">
                <div className="mb-1.5 text-[12px] font-semibold text-[#1967d2]">
                  Collaborative Filtering model — Matrix Factorization (Unit 6)
                </div>
                <div className="space-y-1 text-[11px] text-[#5f6368]">
                  <div>
                    Funk/Koren biased SGD · k={mfMetrics.latent_factors} latent factors · λ={mfMetrics.regularization}
                    · density {mfMetrics.density_pct}%
                  </div>
                  <div>
                    Test RMSE:{' '}
                    <span className="font-semibold text-[#202124]">{mfMetrics.rmse_mf}</span>
                    {' '}· beats domain-mean baseline by{' '}
                    <span className="font-semibold text-[#137333]">{mfMetrics.mf_lift_over_domain_mean_pct}%</span>
                    {' '}· trained on {mfMetrics.n_train} (emp, domain) cells
                  </div>
                </div>

                {/* Per-employee MF detail */}
                {score.usedMF && score.mfRawPred !== undefined ? (
                  <div className="mt-3 rounded-lg border border-[#ceead6] bg-[#e6f4ea] px-3 py-2 text-[11px]">
                    MF predicted <span className="font-semibold text-[#202124]">{emp.name.split(' ')[0]}</span>'s
                    {' '}affinity for the <span className="font-semibold">{proj.domain}</span> domain:{' '}
                    <span className="font-mono font-bold text-[#137333]">{score.mfRawPred.toFixed(2)} / 5</span>
                    {' '}→ normalised CF signal:{' '}
                    <span className="font-mono font-bold text-[#1a73e8]">{score.breakdown.history.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-[#feefc3] bg-[#fef7e0] px-3 py-2 text-[11px] text-[#b06000]">
                    MF affinity not found for this employee — historical domain average used as CF fallback (cold-start behaviour).
                  </div>
                )}
              </div>
            </>
          )}

          {/* Bottom padding so last card isn't flush against the edge */}
          <div className="h-4" />
        </div>
      </motion.aside>
    </>
  );
}
