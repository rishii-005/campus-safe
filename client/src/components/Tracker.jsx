import { Check, XCircle } from 'lucide-react';
import { STATUS_LABEL, fmt } from '../lib/constants.js';

// Horizontal progress tracker: Submitted -> ... -> Closed
export function ProgressTracker({ flow, current }) {
  if (['REJECTED', 'CANCELLED'].includes(current)) {
    return <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-3 font-semibold text-slate-700"><XCircle className="h-5 w-5" /> This report is {STATUS_LABEL[current].toLowerCase()}.</div>;
  }
  const idx = current === 'REOPENED' ? 0 : flow.indexOf(current);
  return (
    <ol className="flex gap-1 overflow-x-auto pb-2" aria-label="Progress">
      {flow.map((s, i) => {
        const done = i < idx || (i === idx && ['CLOSED'].includes(s)); const now = i === idx && !done;
        return (
          <li key={s} className="flex min-w-[5.5rem] flex-1 flex-col items-center text-center" aria-current={now ? 'step' : undefined}>
            <div className="flex w-full items-center">
              <div className={`h-1 flex-1 ${i === 0 ? 'bg-transparent' : i <= idx ? 'bg-safe' : 'bg-line'}`} />
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${done ? 'border-safe bg-safe text-white' : now ? 'border-ink bg-ink text-white' : 'border-line bg-white text-slate-400'}`}>{done ? <Check className="h-4 w-4" /> : i + 1}</div>
              <div className={`h-1 flex-1 ${i === flow.length - 1 ? 'bg-transparent' : i < idx ? 'bg-safe' : 'bg-line'}`} />
            </div>
            <span className={`mt-1 text-xs leading-tight ${now ? 'font-bold text-ink' : 'text-slate-500'}`}>{STATUS_LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Vertical history of every update with who and when.
export function Timeline({ updates }) {
  if (!updates?.length) return <p className="text-sm text-slate-500">No updates yet.</p>;
  return (
    <ol className="space-y-4 border-l-2 border-line pl-4">
      {[...updates].reverse().map((u) => (
        <li key={u.id} className="relative">
          <span className={`absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full ${u.is_internal ? 'bg-amber' : 'bg-ink'}`} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {u.status && <span className="font-bold text-ink">{STATUS_LABEL[u.status] || u.status}</span>}
            {u.is_internal && <span className="rounded bg-amber/15 px-1.5 py-0.5 text-xs font-semibold text-amber">Internal only</span>}
            <span className="text-slate-500">{fmt(u.created_at)}{u.actor ? ` · ${u.actor}` : ''}</span>
          </div>
          {u.comment && <p className="mt-0.5 text-sm text-slate-700">{u.comment}</p>}
        </li>
      ))}
    </ol>
  );
}
