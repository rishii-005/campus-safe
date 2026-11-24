import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { LayoutDashboard, FilePlus2, ListChecks, Bell, BookOpenCheck, FlaskConical, Settings, Users, Building2, ScrollText, Truck, LogOut, Menu, ShieldCheck, X, Siren } from 'lucide-react';
import { useApp } from '../context.jsx';
import { ROLE_LABEL } from '../lib/constants.js';

const NAV = {
  STUDENT: [['dashboard', 'Dashboard', LayoutDashboard], ['report', 'Report an incident', FilePlus2], ['incidents', 'My complaints', ListChecks], ['notifications', 'Notifications', Bell], ['safety', 'Safety and guidance', BookOpenCheck], ['simulation', 'Simulation centre', FlaskConical], ['settings', 'Account settings', Settings]],
  STAFF: [['dashboard', 'Dashboard', LayoutDashboard], ['incidents', 'Incidents', Siren], ['responders', 'Responders', Truck], ['notifications', 'Notifications', Bell], ['safety', 'Safety and guidance', BookOpenCheck], ['simulation', 'Simulation centre', FlaskConical], ['settings', 'Account settings', Settings]],
  ADMIN: [['dashboard', 'Dashboard', LayoutDashboard], ['incidents', 'All incidents', Siren], ['users', 'Users', Users], ['config', 'Configuration', Building2], ['responders', 'Responders', Truck], ['audit', 'Audit log', ScrollText], ['simulation', 'Simulation centre', FlaskConical], ['notifications', 'Notifications', Bell], ['settings', 'Account settings', Settings]],
};

export default function Layout() {
  const { user, logout, notes } = useApp();
  const [open, setOpen] = useState(false);
  const items = user.role === 'STUDENT' ? NAV.STUDENT : user.role === 'ADMIN' ? NAV.ADMIN : NAV.STAFF;
  return (
    <div className="flex h-dvh">
      {open && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-ink text-white transition-transform md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-extrabold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal"><ShieldCheck className="h-5 w-5" /></span>Campus Safe</Link>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
          {items.map(([to, label, Icon]) => (
            <NavLink key={to} to={`/portal/${to}`} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-white text-ink' : 'text-blue-100 hover:bg-white/10'}`}>
              <Icon className="h-4 w-4" />{label}{to === 'notifications' && notes.unread > 0 && <span className="ml-auto rounded-full bg-signal px-2 text-xs text-white">{notes.unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/15 p-3 text-sm">
          <p className="truncate font-bold">{user.name}</p>
          <p className="text-xs text-blue-200">{ROLE_LABEL[user.role]}{user.department_name ? ` · ${user.department_name}` : ''}</p>
          <button onClick={() => logout()} className="mt-2 flex items-center gap-2 text-blue-100 hover:text-white"><LogOut className="h-4 w-4" /> Log out</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <span className="hidden text-sm text-slate-500 md:block">Campus Portal · {ROLE_LABEL[user.role]}</span>
          <div className="flex items-center gap-3">
            <Link to="/portal/notifications" className="relative rounded-full p-2 hover:bg-slate-100" aria-label={`Notifications, ${notes.unread} unread`}><Bell className="h-5 w-5" />{notes.unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-signal px-1 text-center text-[11px] font-bold text-white">{notes.unread}</span>}</Link>
            <Link to="/" className="rounded-lg bg-signal px-3 py-1.5 text-sm font-bold text-white">SOS page</Link>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
  );
}
