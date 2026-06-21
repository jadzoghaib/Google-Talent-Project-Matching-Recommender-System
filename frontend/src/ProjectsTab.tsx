import { useMemo, useState } from 'react';
import {
  Search, Layers, CircleDot, CheckCircle2, Users, Plus, Check, X, Calendar, Clock,
} from 'lucide-react';
import type { Project } from './lib/types';
import { PROJECT_DOMAINS } from './lib/catalog';
import { computeProjectAnalytics } from './lib/analytics';
import { AnimatePresence } from 'framer-motion';
import {
  G, CARD, StatCard, DistBar, DrawerShell, domainColor,
} from './lib/uikit';

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pipeline:  { label: 'Pipeline',  cls: 'bg-[#e8f0fe] text-[#1967d2]', dot: '#4285F4' },
  active:    { label: 'Active',    cls: 'bg-[#e6f4ea] text-[#137333]', dot: '#34A853' },
  completed: { label: 'Completed', cls: 'bg-[#f1f3f4] text-[#5f6368]', dot: '#9aa0a6' },
};

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, cls: 'bg-[#f1f3f4] text-[#5f6368]', dot: '#9aa0a6' };
}

const DISPLAY_CAP = 60;

interface Props {
  projects: Project[];
  pipelineIds: Set<string>;
  onAddToPipeline: (p: Project) => void;
}

export function ProjectsTab({ projects, pipelineIds, onAddToPipeline }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'pipeline' | 'active' | 'completed'>('all');
  const [domain, setDomain] = useState<'all' | string>('all');
  const [selected, setSelected] = useState<Project | null>(null);

  const analytics = useMemo(() => computeProjectAnalytics(projects), [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(p => {
      if (status !== 'all' && p.status !== status) return false;
      if (domain !== 'all' && p.domain !== domain) return false;
      if (q && !(`${p.title} ${p.domain}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [projects, query, status, domain]);

  const shown = filtered.slice(0, DISPLAY_CAP);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[28px] font-normal tracking-tight text-[#202124]">All Projects</h2>
        <p className="mt-1 max-w-xl text-sm text-[#5f6368]">
          Browse the full portfolio — pipeline, active, and completed. Open any project for its full
          spec, and stage pipeline projects for the recommender.
        </p>
      </div>

      {/* Analytics strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Layers className="h-4 w-4" />} label="Total projects" value={analytics.total} sub="across all statuses" />
        <StatCard icon={<CircleDot className="h-4 w-4" />} label="Pipeline" value={analytics.byStatus.pipeline ?? 0} sub={`${analytics.openHeadcountDemand} open seats to staff`} accent="text-[#1a73e8]" />
        <StatCard icon={<Users className="h-4 w-4" />} label="Active" value={analytics.byStatus.active ?? 0} sub="teams currently running" accent="text-[#1e8e3e]" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={analytics.byStatus.completed ?? 0} sub={`avg team target ${analytics.avgTeamTarget}`} />
      </div>

      <div className={`${CARD} p-4`}>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Projects by domain</div>
        <DistBar items={analytics.byDomain.map(d => ({ ...d, color: domainColor(d.label) }))} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa0a6]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects by title or domain…"
            className="w-full rounded-full border border-[#dadce0] bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
          />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
          className="rounded-full border border-[#dadce0] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1a73e8]">
          <option value="all">All statuses</option>
          <option value="pipeline">Pipeline</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
        <select value={domain} onChange={e => setDomain(e.target.value)}
          className="rounded-full border border-[#dadce0] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#1a73e8]">
          <option value="all">All domains</option>
          {PROJECT_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="text-[11px] text-[#80868b]">
        Showing {Math.min(shown.length, filtered.length)} of {filtered.length} matching project{filtered.length !== 1 ? 's' : ''}
        {filtered.length > DISPLAY_CAP && ' — refine filters to narrow further'}
      </div>

      {/* Project grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(p => {
          const sm = statusMeta(p.status);
          const staged = pipelineIds.has(p.project_id);
          return (
            <button
              key={p.project_id}
              onClick={() => setSelected(p)}
              className={`${CARD} flex flex-col gap-2 p-4 text-left transition hover:shadow-[0_2px_8px_rgba(60,64,67,0.18)]`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 text-sm font-medium text-[#202124]">{p.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${sm.cls}`}>{sm.label}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[10px] text-[#5f6368]">
                  <span className="h-2 w-2 rounded-full" style={{ background: domainColor(p.domain) }} />
                  {p.domain}
                </span>
                <span className="rounded-full bg-[#e8f0fe] px-1.5 py-0.5 text-[10px] font-semibold text-[#1967d2]">P{p.priority}</span>
                {staged && <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#34A853]"><Check className="h-3 w-3" /> staged</span>}
              </div>
              <div className="mt-auto flex items-center justify-between text-[11px] text-[#80868b]">
                <span>target {p.required_team_size_target} · {p.required_skills.length} skills</span>
                <span>{p.duration_weeks}w</span>
              </div>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#dadce0] py-12 text-center text-sm text-[#80868b]">
          No projects match the current filters.
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <ProjectDetailDrawer
            key={selected.project_id}
            project={selected}
            staged={pipelineIds.has(selected.project_id)}
            onAddToPipeline={() => { onAddToPipeline(selected); }}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Project detail drawer ───────────────────────────────────────────────────
function ProjectDetailDrawer({
  project, staged, onAddToPipeline, onClose,
}: { project: Project; staged: boolean; onAddToPipeline: () => void; onClose: () => void }) {
  const sm = statusMeta(project.status);
  return (
    <DrawerShell onClose={onClose} ariaLabel={`Details for ${project.title}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#e8eaed] bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold leading-tight text-[#202124]">{project.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[10px] text-[#5f6368]">
                <span className="h-2 w-2 rounded-full" style={{ background: domainColor(project.domain) }} />{project.domain}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sm.cls}`}>{sm.label}</span>
              <span className="rounded-full bg-[#e8f0fe] px-1.5 py-0.5 text-[10px] font-semibold text-[#1967d2]">P{project.priority}</span>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-[#5f6368] transition hover:bg-[#f1f3f4]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 px-5 py-4">
        {project.description && (
          <p className="text-[13px] leading-relaxed text-[#5f6368]">{project.description}</p>
        )}

        {/* Team sizing */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Min', value: project.required_team_size_min },
            { label: 'Target', value: project.required_team_size_target, hi: true },
            { label: 'Max', value: project.required_team_size_max },
          ].map(b => (
            <div key={b.label} className={`rounded-xl border p-3 text-center ${b.hi ? 'border-[#d2e3fc] bg-[#e8f0fe]' : 'border-[#e8eaed] bg-[#f8f9fa]'}`}>
              <div className="text-[10px] uppercase tracking-wider text-[#5f6368]">{b.label}</div>
              <div className={`font-mono text-xl font-semibold ${b.hi ? 'text-[#1a73e8]' : 'text-[#202124]'}`}>{b.value}</div>
            </div>
          ))}
        </div>

        {/* Required roles */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Required roles</div>
          <div className="space-y-1.5">
            {project.required_roles.length ? project.required_roles.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-3 py-2 text-[12px]">
                <span className="font-medium text-[#202124]">{r.role}</span>
                <span className="text-[#5f6368]">{r.count}× · min {r.min_level}</span>
              </div>
            )) : <div className="text-[12px] text-[#9aa0a6]">No specific roles listed.</div>}
          </div>
        </div>

        {/* Required skills */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#5f6368]">Required skills</div>
          <div className="flex flex-wrap gap-1.5">
            {project.required_skills.length ? project.required_skills.map((s, i) => (
              <span key={i} className="rounded-full border border-[#dadce0] bg-white px-2.5 py-1 text-[11px] text-[#202124]">
                {s.skill} <span className="text-[#9aa0a6]">· min {s.min_proficiency}</span>
              </span>
            )) : <span className="text-[12px] text-[#9aa0a6]">No specific skills listed.</span>}
          </div>
        </div>

        {/* Timeline */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-3 py-2 text-[12px] text-[#5f6368]">
            <Clock className="h-3.5 w-3.5" /> {project.duration_weeks} weeks
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[#e8eaed] bg-[#f8f9fa] px-3 py-2 text-[12px] text-[#5f6368]">
            <Calendar className="h-3.5 w-3.5" /> {project.target_start_date}
          </div>
        </div>
      </div>

      {/* Footer action */}
      {project.status === 'pipeline' && (
        <div className="sticky bottom-0 border-t border-[#e8eaed] bg-white px-5 py-3">
          <button
            onClick={onAddToPipeline}
            disabled={staged}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1a73e8] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#1b66c9] disabled:cursor-not-allowed disabled:bg-[#e8eaed] disabled:text-[#9aa0a6]"
            style={{ background: staged ? undefined : G.blue600 }}
          >
            {staged ? <><Check className="h-4 w-4" /> Already in pipeline</> : <><Plus className="h-4 w-4" /> Add to recommender pipeline</>}
          </button>
        </div>
      )}
    </DrawerShell>
  );
}
