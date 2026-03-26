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
  status: 'Queued' | 'Completed';
};

const stakeholderSeed: Stakeholder[] = [
  {
    id: 'st-1',
    name: 'Nina Patel',
    status: 'Queued',
  },
  {
    id: 'st-2',
    name: 'Marcus Lee',
    status: 'Queued',
  },
  {
    id: 'st-3',
    name: 'Asha Nair',
    status: 'Queued',
  },
  {
    id: 'st-4',
    name: 'Daniel Brooks',
    status: 'Queued',
  },
];

function statusClass(status: Stakeholder['status']) {
  return `status-${status.toLowerCase().replace(' ', '-')}`;
}

const COPY_FEEDBACK_MS = 2500;
const TOAST_DURATION_MS = 2500;
const ACTIVE_STAKEHOLDER_KEY = 'ciassist_active_stakeholder_id';
const COMPLETED_STAKEHOLDERS_KEY = 'ciassist_completed_stakeholders';
function getCompletedStakeholderIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(COMPLETED_STAKEHOLDERS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function useStakeholders(): { stakeholders: Stakeholder[]; fromSaved: boolean } {
  return useMemo(() => {
    const completedIds = getCompletedStakeholderIds();
    const toStatus = (id: string): Stakeholder['status'] =>
      completedIds.has(id) ? 'Completed' : 'Queued';

    const saved = loadStakeholders();
    if (saved.length > 0) {
      const mapped: Stakeholder[] = saved.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        userGroup: s.userGroup,
        subGroup: s.subGroup,
        status: toStatus(s.id),
      }));
      return { stakeholders: mapped, fromSaved: true };
    }
    return {
      stakeholders: stakeholderSeed.map((s) => ({
        ...s,
        status: toStatus(s.id),
      })),
      fromSaved: false,
    };
  }, []);
}

export default function LaunchInterview() {
  const navigate = useNavigate();
  const { stakeholders } = useStakeholders();
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

  function initiateStakeholderSession(stakeholderId: string) {
    sessionStorage.setItem(ACTIVE_STAKEHOLDER_KEY, stakeholderId);
    navigate('/cimmie');
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
              <th>Email</th>
              <th>User Group</th>
              <th>Sub-Group</th>
              <th>Depth</th>
              <th>Status</th>
              <th>Link</th>
              <th>Action</th>
              <th>Extend Session</th>
            </tr>
          </thead>
          <tbody>
            {stakeholders.map((stakeholder) => (
              <tr key={stakeholder.id}>
                <td>{stakeholder.name}</td>
                <td>{stakeholder.email ?? '—'}</td>
                <td>{stakeholder.userGroup ?? '—'}</td>
                <td>{stakeholder.subGroup ?? '—'}</td>
                <td>Detailed</td>
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
                    onClick={() => initiateStakeholderSession(stakeholder.id)}
                  >
                    Initiate Session
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-primary compact launch-extend-session-btn"
                    type="button"
                    disabled
                  >
                    Extend Session
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
