import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Preview.css';

type UploadSection = {
  name: string;
  size: number;
};

type UploadState = Record<string, UploadSection[]>;

type EditableCardId =
  | 'brief'
  | 'type'
  | 'groups'
  | 'stakeholders'
  | 'research';

type StakeholderEntry = { name: string; email: string };

const EDITABLE_CARDS: { id: EditableCardId; title: string; initialContent: string }[] = [
  { id: 'brief', title: 'Change Brief & Summary', initialContent: 'High-level description and scope of the change initiative.' },
  { id: 'type', title: 'Type Of Change', initialContent: 'Classification of the change (e.g. process, technology, operating model).' },
  { id: 'groups', title: 'Groups Impacted By The Change', initialContent: 'Teams, functions, or business units affected by the change.' },
];

const SECTION_LABELS: Record<string, string> = {
  brief: 'Brief and scope',
  context: 'Context pack',
  method: 'Method and templates',
  stakeholder: 'Stakeholder list and interview plan',
};

function toReadableSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** idx;
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function readUploadState(): UploadState {
  try {
    const raw = sessionStorage.getItem('ciassist_upload_sections');
    if (!raw) return {};
    return JSON.parse(raw) as UploadState;
  } catch {
    return {};
  }
}

function PenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export default function Preview() {
  const navigate = useNavigate();
  const uploads = readUploadState();
  const totalFiles = Object.values(uploads).flat().length;

  const [content, setContent] = useState<Record<EditableCardId, string>>(() =>
    Object.fromEntries(EDITABLE_CARDS.map((c) => [c.id, c.initialContent])) as Record<EditableCardId, string>
  );
  const [stakeholdersList, setStakeholdersList] = useState<StakeholderEntry[]>([]);
  const [editingId, setEditingId] = useState<EditableCardId | null>(null);
  const [draft, setDraft] = useState('');
  const [newStakeholderName, setNewStakeholderName] = useState('');
  const [newStakeholderEmail, setNewStakeholderEmail] = useState('');
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingId !== null && editingId !== 'stakeholders') {
      setDraft(content[editingId]);
      const id = setTimeout(() => {
        const t = editInputRef.current;
        if (t) {
          t.focus();
          t.setSelectionRange(t.value.length, t.value.length);
        }
      }, 0);
      return () => clearTimeout(id);
    }
  }, [editingId, content]);

  useEffect(() => {
    if (editingId === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditingId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingId]);

  const handleStartEdit = (id: EditableCardId) => {
    setEditingId(id);
  };

  const handleCancel = () => {
    setEditingId(null);
  };

  const handlePublish = (id: EditableCardId) => {
    if (id === 'stakeholders') {
      setEditingId(null);
    } else {
      setContent((prev) => ({ ...prev, [id]: draft }));
      setEditingId(null);
    }
    // TODO: call existing save handler when available
  };

  const addStakeholder = () => {
    const name = newStakeholderName.trim();
    const email = newStakeholderEmail.trim();
    if (!name && !email) return;
    setStakeholdersList((prev) => [...prev, { name: name || '—', email: email || '—' }]);
    setNewStakeholderName('');
    setNewStakeholderEmail('');
  };

  const removeStakeholder = (index: number) => {
    setStakeholdersList((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="preview-page">
      <header className="preview-header card">
        <div>
          <p className="preview-kicker">Data Extraction Agent Output</p>
          <h1>Preview of Extracted Change Context</h1>
          <p>
            Validate extracted context before interviews begin. This preview becomes the baseline
            context for CIMMIE interview prompts and downstream CIA outputs.
          </p>
        </div>
        <div className="preview-meta">
          <span className="badge">Files uploaded: {totalFiles}</span>
          <button className="btn btn-primary" type="button" onClick={() => navigate('/preview-questions')}>
            Proceed to launch
          </button>
        </div>
      </header>

      <section className="preview-grid">
        <article className="card preview-block">
          <h2>Uploaded Artefacts</h2>
          {Object.keys(SECTION_LABELS).map((key) => {
            const files = uploads[key] || [];
            return (
              <div className="upload-group" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                {files.length === 0 ? (
                  <p className="empty-row">No files uploaded for this section.</p>
                ) : (
                  <ul>
                    {files.map((file) => (
                      <li key={`${key}-${file.name}`}>
                        <span>{file.name}</span>
                        <span>{toReadableSize(file.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </article>

        <div className="preview-extracted">
          {EDITABLE_CARDS.map((card) => {
            const isEditing = editingId === card.id;
            return (
              <article key={card.id} className="card preview-block">
                <div className="preview-block-header">
                  <h2>{card.title}</h2>
                  <div className="preview-block-actions">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={handleCancel}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handlePublish(card.id)}
                        >
                          Publish
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleStartEdit(card.id)}
                        aria-label={`Edit ${card.title}`}
                      >
                        <PenIcon />
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                {card.id === 'stakeholders' ? (
                  isEditing ? (
                    <div className="preview-stakeholders-wrap">
                      <ul className="preview-stakeholders-list">
                        {stakeholdersList.map((s, i) => (
                          <li key={i} className="preview-stakeholders-item">
                            <span className="preview-stakeholders-name">{s.name}</span>
                            <span className="preview-stakeholders-email">{s.email}</span>
                            <button
                              type="button"
                              className="btn btn-ghost preview-stakeholders-remove"
                              onClick={() => removeStakeholder(i)}
                              aria-label={`Remove ${s.name}`}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="preview-stakeholders-add">
                        <input
                          type="text"
                          className="preview-stakeholders-input"
                          placeholder="Name"
                          value={newStakeholderName}
                          onChange={(e) => setNewStakeholderName(e.target.value)}
                          aria-label="Stakeholder name"
                        />
                        <input
                          type="email"
                          className="preview-stakeholders-input"
                          placeholder="Email"
                          value={newStakeholderEmail}
                          onChange={(e) => setNewStakeholderEmail(e.target.value)}
                          aria-label="Stakeholder email"
                        />
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={addStakeholder}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="preview-stakeholders-wrap">
                      {stakeholdersList.length === 0 ? (
                        <p className="empty-row">No stakeholders added.</p>
                      ) : (
                        <ul className="preview-stakeholders-list">
                          {stakeholdersList.map((s, i) => (
                            <li key={i} className="preview-stakeholders-item preview-stakeholders-item-readonly">
                              <span className="preview-stakeholders-name">{s.name}</span>
                              <span className="preview-stakeholders-email">{s.email}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                ) : isEditing ? (
                  <textarea
                    ref={editInputRef}
                    className="preview-block-edit"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={`Edit ${card.title}`}
                    rows={3}
                  />
                ) : (
                  <div className="summary-points">
                    <p>{content[card.id]}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <footer className="preview-actions">
        <Link className="btn btn-outline" to="/initiate">
          Back to uploads
        </Link>
        <button className="btn btn-primary" type="button" onClick={() => navigate('/preview-questions')}>
          Continue to launch interview
        </button>
      </footer>
    </div>
  );
}
