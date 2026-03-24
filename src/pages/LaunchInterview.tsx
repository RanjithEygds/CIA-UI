import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadStakeholders } from './AddStakeholders';
import './LaunchInterview.css';

type Stakeholder = {
  id: string;
  name: string;
  email?: string;
  userGroup?: string;
  subGroup?: string;
  role: string;
  depth: 'High-level' | 'Detailed';
  slot: string;
  status: 'Queued' | 'Invited' | 'In Progress' | 'Completed';
};

const stakeholderSeed: Stakeholder[] = [
  {
    id: 'st-1',
    name: 'Nina Patel',
    role: 'Head of Operations',
    depth: 'Detailed',
    slot: '08 Mar 2026, 10:00',
    status: 'Queued',
  },
  {
    id: 'st-2',
    name: 'Marcus Lee',
    role: 'Regional Service Lead',
    depth: 'Detailed',
    slot: '08 Mar 2026, 11:30',
    status: 'Invited',
  },
  {
    id: 'st-3',
    name: 'Asha Nair',
    role: 'Data Governance Manager',
    depth: 'High-level',
    slot: '08 Mar 2026, 14:00',
    status: 'Queued',
  },
  {
    id: 'st-4',
    name: 'Daniel Brooks',
    role: 'Technology Workstream Lead',
    depth: 'Detailed',
    slot: '08 Mar 2026, 15:30',
    status: 'Completed',
  },
];

function statusClass(status: Stakeholder['status']) {
  return `status-${status.toLowerCase().replace(' ', '-')}`;
}

const COPY_FEEDBACK_MS = 2500;
const TOAST_DURATION_MS = 2500;

function useStakeholders(): { stakeholders: Stakeholder[]; fromSaved: boolean } {
  return useMemo(() => {
    const saved = loadStakeholders();
    if (saved.length > 0) {
      const mapped: Stakeholder[] = saved.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        userGroup: s.userGroup,
        subGroup: s.subGroup,
        role: '—',
        depth: 'Detailed',
        slot: '—',
        status: 'Queued' as const,
      }));
      return { stakeholders: mapped, fromSaved: true };
    }
    return { stakeholders: stakeholderSeed, fromSaved: false };
  }, []);
}

export default function LaunchInterview() {
  const navigate = useNavigate();
  const { stakeholders, fromSaved } = useStakeholders();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCopyToast, setShowCopyToast] = useState(false);

  function copyStakeholderLink(stakeholder: Stakeholder) {
    const url = `${window.location.origin}/cimmie/${stakeholder.id}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(stakeholder.id);
    setShowCopyToast(true);
    setTimeout(() => setCopiedId(null), COPY_FEEDBACK_MS);
    setTimeout(() => setShowCopyToast(false), TOAST_DURATION_MS);
  }

  return (
    <div className="launch-page">
      <header className="launch-header card">
        <div>
          <p className="launch-kicker">Interview Control Centre</p>
          <h1>Launch and Track Stakeholder Interviews</h1>
          <p>
            Start interviews for the current change or review previous change packs including
            response summaries, structured findings, narrative drafts, and populated CIA templates.
          </p>
        </div>
        <div className="launch-header-actions">
          <button className="btn btn-primary" type="button" onClick={() => navigate('/cimmie')}>
            Launch all sessions
          </button>
        </div>
      </header>

      <section className="card">
        <div className="stakeholder-header-row">
          <h2>Scheduled Stakeholder Interviews</h2>
          <span className="badge">{stakeholders.length} stakeholders</span>
        </div>
        <table className="stakeholder-table">
          <thead>
            <tr>
              <th>Name</th>
              {fromSaved && <th>Email</th>}
              {fromSaved && <th>User Group</th>}
              {fromSaved && <th>Sub-Group</th>}
              <th>Role</th>
              <th>Depth</th>
              <th>Session slot</th>
              <th>Status</th>
              <th>Link</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stakeholders.map((stakeholder) => (
              <tr key={stakeholder.id}>
                <td>{stakeholder.name}</td>
                {fromSaved && <td>{stakeholder.email ?? '—'}</td>}
                {fromSaved && <td>{stakeholder.userGroup ?? '—'}</td>}
                {fromSaved && <td>{stakeholder.subGroup ?? '—'}</td>}
                <td>{stakeholder.role}</td>
                <td>{stakeholder.depth}</td>
                <td>{stakeholder.slot}</td>
                <td>
                  <span className={`status-chip ${statusClass(stakeholder.status)}`}>
                    {stakeholder.status}
                  </span>
                </td>
                <td>
                  <button
                    className={`btn btn-teal-blue compact ${copiedId === stakeholder.id ? 'copy-copied' : ''}`}
                    type="button"
                    onClick={() => copyStakeholderLink(stakeholder)}
                  >
                    {copiedId === stakeholder.id ? 'Copied!' : 'Copy Link'}
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-primary compact"
                    type="button"
                    onClick={() => navigate('/cimmie')}
                  >
                    Initiate Session
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="launch-actions">
        <div className="launch-actions-row">
          <Link className="btn btn-outline" to="/add-stakeholders">
            Back to add Stakeholders
          </Link>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => navigate('/cimmie')}
          >
            Continue to Launch Interview
          </button>
        </div>
      </footer>

      {showCopyToast && (
        <div className="copy-toast" role="status" aria-live="polite">
          Link copied!
        </div>
      )}
    </div>
  );
}
