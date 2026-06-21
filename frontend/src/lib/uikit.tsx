// Shared visual primitives used across the workspace tabs and detail drawers.
// Keeping them in one place stops the palette / avatar / drawer chrome from
// drifting between screens.
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export const G = { blue: '#4285F4', red: '#EA4335', yellow: '#FBBC04', green: '#34A853', blue600: '#1a73e8' };

export const CARD = 'rounded-2xl border border-[#dadce0] bg-white shadow-[0_1px_3px_rgba(60,64,67,0.10)]';

export const DOMAIN_COLORS: Record<string, string> = {
  Search: '#4285F4', Ads: '#FBBC04', YouTube: '#EA4335', Android: '#34A853',
  Cloud: '#1a73e8', 'AI Platform': '#a142f4', Payments: '#0F9D58',
  Infra: '#5f6368', Maps: '#F4B400', Workspace: '#4A90D9', Chrome: '#d93025', Undecided: '#9aa0a6',
};

export function domainColor(domain: string | null): string {
  return (domain && DOMAIN_COLORS[domain]) || '#5f6368';
}

const AVATAR_COLORS = ['#4285F4', '#EA4335', '#34A853', '#1a73e8', '#a142f4', '#f9ab00', '#12b5cb'];
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('');
}

export function levelTone(level: string): string {
  const i = ['L3', 'L4', 'L5', 'L6', 'L7', 'L8'].indexOf(level);
  if (i >= 4) return 'text-[#a142f4]';
  if (i >= 2) return 'text-[#1a73e8]';
  return 'text-[#5f6368]';
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.32) }}
    >
      {initials(name)}
    </div>
  );
}

export function StatCard({
  icon, label, value, sub, accent = 'text-[#202124]',
}: { icon?: ReactNode; label: string; value: ReactNode; sub?: string; accent?: string }) {
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

// Horizontal labelled distribution bars (counts → proportional fill).
export function DistBar({
  items, max,
}: { items: Array<{ label: string; value: number; color?: string }>; max?: number }) {
  const peak = max ?? Math.max(1, ...items.map(i => i.value));
  return (
    <div className="space-y-1.5">
      {items.map(it => {
        const pct = Math.round((it.value / peak) * 100);
        return (
          <div key={it.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-[11px] text-[#5f6368]" title={it.label}>{it.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8eaed]">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: it.color ?? G.blue }} />
            </div>
            <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-[#80868b]">{it.value}</span>
          </div>
        );
      })}
    </div>
  );
}

// Right-side slide-in drawer chrome (backdrop + spring panel + Escape-to-close).
// The caller supplies the panel content; render inside <AnimatePresence>.
export function DrawerShell({
  onClose, ariaLabel, children, maxWidth = 520,
}: { onClose: () => void; ariaLabel: string; children: ReactNode; maxWidth?: number }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        className="fixed right-0 top-0 z-50 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl"
        style={{ maxWidth }}
        role="dialog"
        aria-label={ariaLabel}
      >
        {children}
      </motion.aside>
    </>
  );
}
