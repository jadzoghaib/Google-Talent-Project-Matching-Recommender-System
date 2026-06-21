import { useState } from 'react';
import { X, ClipboardCheck } from 'lucide-react';
import type { Employee, Project } from './lib/types';
import { DrawerShell, Avatar, levelTone } from './lib/uikit';

export interface ReviewRow {
  employee_id: string;
  pm_review: number;
  peer_collaboration_avg: number;
  delivery_score: number;
}

const METRICS: Array<{ key: keyof Omit<ReviewRow, 'employee_id'>; label: string; hint: string }> = [
  { key: 'pm_review',             label: 'PM review',          hint: "manager's assessment" },
  { key: 'peer_collaboration_avg', label: 'Peer collaboration', hint: 'how well they meshed with the team' },
  { key: 'delivery_score',        label: 'Delivery',           hint: 'shipped quality & reliability' },
];

function Rating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-6 w-6 rounded text-[11px] font-semibold transition ${
            n <= value ? 'bg-[#1a73e8] text-white' : 'border border-[#dadce0] bg-white text-[#9aa0a6] hover:border-[#1a73e8]'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

interface Props {
  project: Project;
  members: Employee[];
  onSubmit: (rows: ReviewRow[]) => void;
  onClose: () => void;
}

export function ReviewDrawer({ project, members, onSubmit, onClose }: Props) {
  const [rows, setRows] = useState<Record<string, ReviewRow>>(() =>
    Object.fromEntries(members.map(m => [
      m.employee_id,
      { employee_id: m.employee_id, pm_review: 4, peer_collaboration_avg: 4, delivery_score: 4 },
    ])),
  );

  const update = (id: string, key: keyof Omit<ReviewRow, 'employee_id'>, v: number) =>
    setRows(prev => ({ ...prev, [id]: { ...prev[id], [key]: v } }));

  return (
    <DrawerShell onClose={onClose} ariaLabel={`Review ${project.title}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#e8eaed] bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#137333]">
              <ClipboardCheck className="h-3.5 w-3.5" /> Project close-out review
            </div>
            <div className="mt-1 text-[16px] font-semibold leading-tight text-[#202124]">{project.title}</div>
            <div className="mt-0.5 text-[11px] text-[#5f6368]">Score each member — these write to their work history.</div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-[#5f6368] transition hover:bg-[#f1f3f4]" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-3 px-5 py-4">
        {members.map(m => {
          const r = rows[m.employee_id];
          return (
            <div key={m.employee_id} className="rounded-xl border border-[#e8eaed] bg-[#f8f9fa] p-3.5">
              <div className="mb-3 flex items-center gap-3">
                <Avatar name={m.name} size={36} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#202124]">{m.name}</div>
                  <div className="text-[11px] text-[#80868b]">
                    <span className={levelTone(m.level)}>{m.level}</span> · {m.role_category} · {m.primary_domain ?? 'No domain'}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {METRICS.map(metric => (
                  <div key={metric.key} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-[#202124]">{metric.label}</div>
                      <div className="text-[10px] text-[#9aa0a6]">{metric.hint}</div>
                    </div>
                    <Rating value={r[metric.key]} onChange={v => update(m.employee_id, metric.key, v)} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 border-t border-[#e8eaed] bg-white px-5 py-3">
        <button
          onClick={() => onSubmit(Object.values(rows))}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#34A853] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d9147]"
        >
          <ClipboardCheck className="h-4 w-4" /> Submit reviews & update history
        </button>
      </div>
    </DrawerShell>
  );
}
