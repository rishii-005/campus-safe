import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useApp } from '../context.jsx';
import { Card, Page, btn } from '../components/ui.jsx';
import IncidentList from '../components/IncidentList.jsx';

export default function Incidents() {
  const { user } = useApp();
  const student = user.role === 'STUDENT';
  return (
    <Page title={student ? 'My complaints' : user.role === 'ADMIN' ? 'All incidents' : 'Incidents'}
      subtitle={student ? 'Every complaint you have submitted, with its current status.' : 'Emergency alerts and complaints routed to you. The list updates live.'}
      action={student && <Link to="/portal/report" className={btn.primary}><Plus className="h-4 w-4" /> Report new incident</Link>}>
      <Card><IncidentList filters emptyText={student ? 'You have not reported anything yet' : 'No incidents match'} /></Card>
    </Page>
  );
}
