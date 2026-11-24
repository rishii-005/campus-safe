import { Loader2, Inbox, AlertTriangle } from 'lucide-react';
import { STATUS_LABEL, STATUS_STYLE, PRIORITY_STYLE } from '../lib/constants.js';

export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-2 disabled:opacity-50 disabled:cursor-not-allowed',
  danger: 'inline-flex items-center justify-center gap-2 rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-white hover:bg-signal-dark disabled:opacity-50 disabled:cursor-not-allowed',
  ghost: 'inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed',
};
export const input = 'w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-ink';

export const Card = ({ title, action, children, className = '' }) => (
  <section className={`rounded-xl border border-line bg-white ${className}`}>
    {(title || action) && (
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-base font-bold text-ink">{title}</h2>{action}
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);

export const StatusBadge = ({ status }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] || 'bg-slate-100 text-slate-700'}`}>{STATUS_LABEL[status] || status}</span>
);
export const PriorityBadge = ({ priority }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_STYLE[priority] || ''}`}>{priority}</span>
);

export const Stat = ({ label, value, tone = 'ink', hint }) => {
  const color = { ink: 'text-ink', red: 'text-signal', amber: 'text-amber', green: 'text-safe' }[tone];
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold tabular-nums ${color}`}>{value ?? '-'}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
};

export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center justify-center gap-2 p-8 text-slate-500" role="status"><Loader2 className="h-5 w-5 animate-spin" /> {label}…</div>
);
export const Empty = ({ title, hint, children }) => (
  <div className="flex flex-col items-center gap-2 p-8 text-center text-slate-500"><Inbox className="h-8 w-8" /><p className="font-semibold text-slate-700">{title}</p>{hint && <p className="max-w-sm text-sm">{hint}</p>}{children}</div>
);
export const ErrorBox = ({ message, onRetry }) => (
  <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{message}</div>
    {onRetry && <button onClick={onRetry} className="font-semibold underline">Try again</button>}
  </div>
);

export const Field = ({ label, id, hint, children }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate-800">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
);

export const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold text-ink">{title}</h2><button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button></div>
      {children}
    </div>
  </div>
);

// Page wrapper used by every portal page.
export const Page = ({ title, subtitle, action, children }) => (
  <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold text-ink">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}</div>{action}
    </div>
    {children}
  </div>
);
