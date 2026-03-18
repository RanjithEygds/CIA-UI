import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './AddStakeholders.css';

const STORAGE_KEY = 'ciassist_stakeholders';

export type StakeholderEntry = {
  id: string;
  name: string;
  email: string;
};

function generateId(): string {
  return `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadStakeholders(): StakeholderEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s: unknown): s is StakeholderEntry =>
        typeof s === 'object' &&
        s !== null &&
        'id' in s &&
        'name' in s &&
        'email' in s &&
        typeof (s as StakeholderEntry).name === 'string' &&
        typeof (s as StakeholderEntry).email === 'string'
    );
  } catch {
    return [];
  }
}

function saveStakeholders(stakeholders: StakeholderEntry[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stakeholders));
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddStakeholders() {
  const navigate = useNavigate();
  const [stakeholders, setStakeholders] = useState<StakeholderEntry[]>(() => loadStakeholders());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    saveStakeholders(stakeholders);
  }, [stakeholders]);

  const nameValid = name.trim().length > 0;
  const emailValid = email.trim().length === 0 || EMAIL_REGEX.test(email.trim());
  const canAdd = name.trim().length > 0 && email.trim().length > 0 && emailValid;

  const handleAdd = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) return;
    setStakeholders((prev) => [...prev, { id: generateId(), name: trimmedName, email: trimmedEmail }]);
    setName('');
    setEmail('');
    setTouched(false);
  };

  const handleRemove = (id: string) => {
    setStakeholders((prev) => prev.filter((s) => s.id !== id));
  };

  const handleContinue = () => {
    navigate('/launch');
  };

  return (
    <div className="add-stakeholders-page">
      <header className="add-stakeholders-header card">
        <div>
          <p className="add-stakeholders-kicker">Interview setup</p>
          <h1>Add Stakeholders</h1>
          <p>
            Add the names and email addresses of stakeholders who will participate in the interviews.
            You can add or remove entries before proceeding to launch and track sessions.
          </p>
        </div>
        <div className="add-stakeholders-meta">
          <span className="badge">{stakeholders.length} stakeholder{stakeholders.length !== 1 ? 's' : ''}</span>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleContinue}
            disabled={stakeholders.length === 0}
          >
            Continue to launch
          </button>
        </div>
      </header>

      <section className="card add-stakeholders-block">
        <div className="add-stakeholders-block-header">
          <h2>Stakeholder list</h2>
        </div>

        <div className="add-stakeholders-form">
          <div className="add-stakeholders-input-row">
            <label htmlFor="stakeholder-name" className="add-stakeholders-label">
              Name
            </label>
            <input
              id="stakeholder-name"
              type="text"
              className="add-stakeholders-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Stakeholder name"
              aria-label="Stakeholder name"
            />
          </div>
          <div className="add-stakeholders-input-row">
            <label htmlFor="stakeholder-email" className="add-stakeholders-label">
              Email
            </label>
            <input
              id="stakeholder-email"
              type="email"
              className={`add-stakeholders-input ${touched && !emailValid ? 'add-stakeholders-input-invalid' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="email@example.com"
              aria-label="Stakeholder email"
              aria-invalid={touched && !emailValid}
            />
            {touched && !emailValid && email.trim().length > 0 && (
              <span className="add-stakeholders-error">Please enter a valid email address.</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-outline add-stakeholders-add-btn"
            onClick={handleAdd}
            disabled={!canAdd}
          >
            Add stakeholder
          </button>
        </div>

        {stakeholders.length === 0 ? (
          <p className="empty-row">No stakeholders added yet. Enter a name and email above, then click Add stakeholder.</p>
        ) : (
          <ul className="add-stakeholders-list">
            {stakeholders.map((s) => (
              <li key={s.id} className="add-stakeholders-item">
                <span className="add-stakeholders-item-name">{s.name}</span>
                <span className="add-stakeholders-item-email">{s.email}</span>
                <button
                  type="button"
                  className="btn btn-ghost add-stakeholders-remove"
                  onClick={() => handleRemove(s.id)}
                  aria-label={`Remove ${s.name}`}
                >
                  <TrashIcon />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="add-stakeholders-actions">
        <Link className="btn btn-outline" to="/preview-questions">
          Back to interview questions
        </Link>
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleContinue}
          disabled={stakeholders.length === 0}
        >
          Continue to launch interview
        </button>
      </footer>
    </div>
  );
}
