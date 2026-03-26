import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './AddStakeholders.css';

const STORAGE_KEY = 'ciassist_stakeholders';

export type StakeholderEntry = {
  id: string;
  name: string;
  email: string;
  userGroup?: string;
  subGroup?: string;
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
        typeof (s as StakeholderEntry).email === 'string' &&
        ((s as StakeholderEntry).userGroup === undefined || typeof (s as StakeholderEntry).userGroup === 'string') &&
        ((s as StakeholderEntry).subGroup === undefined || typeof (s as StakeholderEntry).subGroup === 'string')
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

function PenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddStakeholders() {
  const navigate = useNavigate();
  const [stakeholders, setStakeholders] = useState<StakeholderEntry[]>(() => loadStakeholders());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [userGroup, setUserGroup] = useState('');
  const [subGroup, setSubGroup] = useState('');
  const [touched, setTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUserGroup, setEditUserGroup] = useState('');
  const [editSubGroup, setEditSubGroup] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    saveStakeholders(stakeholders);
  }, [stakeholders]);

  const nameValid = name.trim().length > 0;
  const emailValid = email.trim().length === 0 || EMAIL_REGEX.test(email.trim());
  const canAdd = nameValid && email.trim().length > 0 && emailValid;

  const handleAdd = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) return;
    setStakeholders((prev) => [
      ...prev,
      {
        id: generateId(),
        name: trimmedName,
        email: trimmedEmail,
        ...(userGroup.trim() && { userGroup: userGroup.trim() }),
        ...(subGroup.trim() && { subGroup: subGroup.trim() }),
      },
    ]);
    setName('');
    setEmail('');
    setUserGroup('');
    setSubGroup('');
    setTouched(false);
  };

  const handleRemove = (id: string) => {
    setStakeholders((prev) => prev.filter((s) => s.id !== id));
  };

  const handleStartEdit = (s: StakeholderEntry) => {
    setEditError(null);
    setEditingId(s.id);
    setEditName(s.name);
    setEditEmail(s.email);
    setEditUserGroup(s.userGroup ?? '');
    setEditSubGroup(s.subGroup ?? '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = (id: string) => {
    const nextName = editName.trim();
    const nextEmail = editEmail.trim();
    if (!nextName) {
      setEditError('Name is required.');
      return;
    }
    if (!nextEmail || !EMAIL_REGEX.test(nextEmail)) {
      setEditError('Please enter a valid email address.');
      return;
    }
    setStakeholders((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              name: nextName,
              email: nextEmail,
              userGroup: editUserGroup.trim() || undefined,
              subGroup: editSubGroup.trim() || undefined,
            }
          : s,
      ),
    );
    setEditingId(null);
    setEditError(null);
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
          <div className="add-stakeholders-input-row">
            <label htmlFor="stakeholder-user-group" className="add-stakeholders-label">
              User Group <span className="add-stakeholders-optional">(optional)</span>
            </label>
            <input
              id="stakeholder-user-group"
              type="text"
              className="add-stakeholders-input"
              value={userGroup}
              onChange={(e) => setUserGroup(e.target.value)}
              placeholder="e.g. Finance, IT"
              aria-label="User group (optional)"
            />
          </div>
          <div className="add-stakeholders-input-row">
            <label htmlFor="stakeholder-sub-group" className="add-stakeholders-label">
              Sub-Group <span className="add-stakeholders-optional">(optional)</span>
            </label>
            <input
              id="stakeholder-sub-group"
              type="text"
              className="add-stakeholders-input"
              value={subGroup}
              onChange={(e) => setSubGroup(e.target.value)}
              placeholder="e.g. Payables, Infrastructure"
              aria-label="Sub-group (optional)"
            />
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
            {stakeholders.map((s, i) => {
              const isEditing = editingId === s.id;
              return (
                <li key={s.id} className="card preview-block add-stakeholders-item">
                  <div className="preview-block-header add-stakeholders-item-header">
                    <div className="add-stakeholders-item-main">
                      <span className="badge add-stakeholders-s-badge" aria-label={`Stakeholder ${i + 1}`}>
                        S{i + 1}
                      </span>
                      {!isEditing ? (
                        <div className="add-stakeholders-item-text">
                          <p className="add-stakeholders-item-name">{s.name}</p>
                          <p className="add-stakeholders-item-email">{s.email}</p>
                          {s.userGroup ? (
                            <p className="add-stakeholders-item-meta">
                              <span>User Group:</span> {s.userGroup}
                            </p>
                          ) : null}
                          {s.subGroup ? (
                            <p className="add-stakeholders-item-meta">
                              <span>Sub-Group:</span> {s.subGroup}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="preview-block-actions add-stakeholders-item-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="btn btn-ghost add-stakeholders-edit-btn" onClick={handleCancelEdit}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary add-stakeholders-save-btn"
                            onClick={() => handleSaveEdit(s.id)}
                          >
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost add-stakeholders-delete-btn"
                            onClick={() => handleRemove(s.id)}
                            aria-label={`Remove ${s.name}`}
                          >
                            <TrashIcon />
                            Delete
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost add-stakeholders-edit-btn"
                            onClick={() => handleStartEdit(s)}
                            aria-label={`Edit ${s.name}`}
                          >
                            <PenIcon />
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="add-stakeholders-edit-grid">
                      <div className="add-stakeholders-input-row">
                        <label htmlFor={`stakeholder-edit-name-${s.id}`} className="add-stakeholders-label">
                          Name
                        </label>
                        <input
                          id={`stakeholder-edit-name-${s.id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div className="add-stakeholders-input-row">
                        <label htmlFor={`stakeholder-edit-email-${s.id}`} className="add-stakeholders-label">
                          Email
                        </label>
                        <input
                          id={`stakeholder-edit-email-${s.id}`}
                          type="email"
                          className="add-stakeholders-input"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                        />
                      </div>
                      <div className="add-stakeholders-input-row">
                        <label htmlFor={`stakeholder-edit-user-group-${s.id}`} className="add-stakeholders-label">
                          User Group <span className="add-stakeholders-optional">(optional)</span>
                        </label>
                        <input
                          id={`stakeholder-edit-user-group-${s.id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editUserGroup}
                          onChange={(e) => setEditUserGroup(e.target.value)}
                        />
                      </div>
                      <div className="add-stakeholders-input-row">
                        <label htmlFor={`stakeholder-edit-sub-group-${s.id}`} className="add-stakeholders-label">
                          Sub-Group <span className="add-stakeholders-optional">(optional)</span>
                        </label>
                        <input
                          id={`stakeholder-edit-sub-group-${s.id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editSubGroup}
                          onChange={(e) => setEditSubGroup(e.target.value)}
                        />
                      </div>
                      {editError ? <p className="add-stakeholders-error">{editError}</p> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
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
          Continue to launch
        </button>
      </footer>
    </div>
  );
}