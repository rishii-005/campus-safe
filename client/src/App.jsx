import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './context.jsx';
const Layout = lazy(() => import('./components/Layout.jsx'));
import { Spinner } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Incidents = lazy(() => import('./pages/Incidents.jsx'));
const IncidentDetail = lazy(() => import('./pages/IncidentDetail.jsx'));
const ReportIncident = lazy(() => import('./pages/ReportIncident.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Safety = lazy(() => import('./pages/Safety.jsx'));
const Simulation = lazy(() => import('./pages/Simulation.jsx'));
const Responders = lazy(() => import('./pages/Responders.jsx'));
const Users = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.Users })));
const Config = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.Config })));
const Audit = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.Audit })));
const Settings = lazy(() => import('./pages/Settings.jsx'));

function Protected({ roles, children }) {
  const { user, loading } = useApp();
  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/portal/dashboard" replace />;
  return children;
}
const STAFF = ['SECURITY', 'WARDEN', 'MEDICAL', 'ADMIN'];

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/portal" element={<Protected><Layout /></Protected>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="report" element={<Protected roles={['STUDENT']}><ReportIncident /></Protected>} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="incidents/:id" element={<IncidentDetail />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="safety" element={<Safety />} />
        <Route path="simulation" element={<Simulation />} />
        <Route path="responders" element={<Protected roles={STAFF}><Responders /></Protected>} />
        <Route path="users" element={<Protected roles={['ADMIN']}><Users /></Protected>} />
        <Route path="config" element={<Protected roles={['ADMIN']}><Config /></Protected>} />
        <Route path="audit" element={<Protected roles={['ADMIN']}><Audit /></Protected>} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
