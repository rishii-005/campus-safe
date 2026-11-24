import { useNavigate } from 'react-router-dom';
import { CheckCheck } from 'lucide-react';
import { useApp } from '../context.jsx';
import { fmt } from '../lib/constants.js';
import { Card, Empty, Page, btn } from '../components/ui.jsx';

export default function Notifications() {
  const { notes, markRead, markAllRead, user } = useApp();
  const nav = useNavigate();
  return (
    <Page title="Notifications" subtitle={`${notes.unread} unread`} action={notes.unread > 0 && <button className={btn.ghost} onClick={markAllRead}><CheckCheck className="h-4 w-4" /> Mark all read</button>}>
      <Card>
        {!notes.list.length ? <Empty title="No notifications yet" hint={user.role === 'STUDENT' ? 'You will be told here whenever a complaint changes.' : 'New alerts and assignments appear here.'} /> : (
          <ul className="divide-y divide-line">
            {notes.list.map((n) => (
              <li key={n.id}>
                <button onClick={() => { markRead(n.id); if (n.incident_id) nav(`/portal/incidents/${n.incident_id}`); }} className="flex w-full items-start gap-3 py-3 text-left hover:bg-slate-50">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : n.type === 'SOS' || n.type === 'ESCALATION' ? 'bg-signal' : 'bg-blue-600'}`} aria-label={n.is_read ? 'Read' : 'Unread'} />
                  <span className="min-w-0"><span className={`block text-sm ${n.is_read ? 'text-slate-700' : 'font-bold text-ink'}`}>{n.title}</span>{n.body && <span className="block truncate text-sm text-slate-500">{n.body}</span>}<span className="text-xs text-slate-400">{fmt(n.created_at)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
