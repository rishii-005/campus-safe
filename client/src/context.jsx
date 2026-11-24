import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken, setToken } from './lib/api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(); const g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(a.currentTime + 0.25);
  } catch { /* sound is optional */ }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [socket, setSocket] = useState(null);
  const [notes, setNotes] = useState({ list: [], unread: 0 });
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const logout = useCallback(async (message) => {
    if (getToken()) api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null); setUser(null); setNotes({ list: [], unread: 0 });
    if (message) toast(message, 'error');
  }, [toast]);

  const refreshNotes = useCallback(async () => {
    try { const d = await api('/notifications'); setNotes({ list: d.notifications, unread: d.unread }); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const h = () => logout('Your session expired. Please log in again.');
    window.addEventListener('cs-unauthorized', h);
    return () => window.removeEventListener('cs-unauthorized', h);
  }, [logout]);

  // One authenticated socket per login. On every (re)connect we reload notifications so none are missed.
  useEffect(() => {
    if (!user) { setSocket(null); return; }
    const s = io(import.meta.env.VITE_SOCKET_URL || undefined, { auth: { token: getToken() } });
    s.on('connect', refreshNotes);
    s.on('notification', (n) => {
      setNotes((x) => ({ list: [n, ...x.list].slice(0, 100), unread: x.unread + 1 }));
      toast(n.title, n.type === 'SOS' || n.type === 'ESCALATION' ? 'alert' : 'info');
    });
    if (user.role !== 'STUDENT') s.on('incident:new', () => beep());
    setSocket(s);
    return () => s.disconnect();
  }, [user, refreshNotes, toast]);

  const login = async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    setToken(d.token);
    const me = await api('/auth/me');
    setUser(me.user);
    return me.user;
  };

  const markRead = async (id) => {
    setNotes((x) => ({ list: x.list.map((n) => (n.id === id ? { ...n, is_read: true } : n)), unread: Math.max(0, x.unread - (x.list.find((n) => n.id === id && !n.is_read) ? 1 : 0)) }));
    api(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  };
  const markAllRead = async () => { setNotes((x) => ({ list: x.list.map((n) => ({ ...n, is_read: true })), unread: 0 })); api('/notifications/read-all', { method: 'POST' }).catch(() => {}); };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, socket, notes, refreshNotes, markRead, markAllRead, toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${t.kind === 'error' ? 'bg-signal text-white' : t.kind === 'alert' ? 'bg-signal-dark text-white' : t.kind === 'success' ? 'bg-safe text-white' : 'bg-ink text-white'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// Run a handler whenever the server pushes a given event (kept fresh without re-subscribing).
export function useSocketEvent(event, handler) {
  const { socket } = useApp();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (...a) => ref.current(...a);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const run = useCallback(async () => {
    try { setState((s) => ({ ...s, error: '' })); const data = await fn(); setState({ data, loading: false, error: '' }); }
    catch (e) { setState({ data: null, loading: false, error: e.message }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}
