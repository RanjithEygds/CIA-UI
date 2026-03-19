import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './PreviewInterviewQuestions.css';

const STORAGE_KEY = 'ciassist_interview_questions';

type QuestionEntry = { id: string; text: string };

function generateId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadQuestions(): QuestionEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q: unknown): q is QuestionEntry =>
        typeof q === 'object' && q !== null && 'id' in q && 'text' in q && typeof (q as QuestionEntry).text === 'string'
    );
  } catch {
    return [];
  }
}

function saveQuestions(questions: QuestionEntry[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
}

function PenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
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

export default function PreviewInterviewQuestions() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionEntry[]>(() => loadQuestions());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const addInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    saveQuestions(questions);
  }, [questions]);

  useEffect(() => {
    if (editingId !== null) {
      const q = questions.find((x) => x.id === editingId);
      setDraft(q ? q.text : '');
      const id = setTimeout(() => {
        const t = editInputRef.current;
        if (t) {
          t.focus();
          t.setSelectionRange(t.value.length, t.value.length);
        }
      }, 0);
      return () => clearTimeout(id);
    }
  }, [editingId, questions]);

  useEffect(() => {
    if (showAddInput) {
      const id = setTimeout(() => addInputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [showAddInput]);

  useEffect(() => {
    if (editingId === null && !showAddInput) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditingId(null);
        setShowAddInput(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingId, showAddInput]);

  const handleStartEdit = (id: string) => {
    setShowAddInput(false);
    setEditingId(id);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = draft.trim();
    if (trimmed) {
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, text: trimmed } : q))
      );
    }
    setEditingId(null);
  };

  const handleRemove = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleAddQuestion = () => {
    const trimmed = newQuestionText.trim();
    if (trimmed) {
      setQuestions((prev) => [...prev, { id: generateId(), text: trimmed }]);
      setNewQuestionText('');
      setShowAddInput(false);
    }
  };

  const openAddQuestion = () => {
    setEditingId(null);
    setShowAddInput(true);
  };

  return (
    <div className="preview-questions-page">
      <header className="preview-questions-header card">
        <div className="preview-questions-header-content">
          <h1>Preview of Interview Questions</h1>
          <p>
            Review and edit the interview questions generated for the stakeholder interview.
            You can add, edit, or remove questions before launching sessions.
          </p>
          <span className="badge preview-questions-header-badge">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      <section className="card preview-questions-block">
        <div className="preview-questions-block-header">
          <h2>Interview Questions</h2>
          <button
            type="button"
            className="btn btn-outline"
            onClick={openAddQuestion}
            disabled={showAddInput}
          >
            Add Question
          </button>
        </div>

        {showAddInput && (
          <div className="preview-questions-add-wrap">
            <textarea
              ref={addInputRef}
              className="preview-questions-edit"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              placeholder="Enter new question..."
              aria-label="New question text"
              rows={2}
            />
            <div className="preview-questions-add-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowAddInput(false); setNewQuestionText(''); }}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAddQuestion}>
                Add
              </button>
            </div>
          </div>
        )}

        {questions.length === 0 && !showAddInput ? (
          <p className="empty-row">No questions yet. Add questions manually or they will appear here once generated by the Questionnaire Agent.</p>
        ) : (
          <ul className="preview-questions-list">
            {questions.map((q) => {
              const isEditing = editingId === q.id;
              return (
                <li key={q.id} className="preview-questions-item">
                  {isEditing ? (
                    <>
                      <textarea
                        ref={editInputRef}
                        className="preview-questions-edit"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        aria-label="Edit question"
                        rows={2}
                      />
                      <div className="preview-questions-item-actions">
                        <button type="button" className="btn btn-ghost" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => handleSaveEdit(q.id)}>
                          Save
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="preview-questions-text">{q.text}</span>
                      <div className="preview-questions-item-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleStartEdit(q.id)}
                          aria-label={`Edit question: ${q.text.slice(0, 40)}...`}
                        >
                          <PenIcon />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost preview-questions-remove"
                          onClick={() => handleRemove(q.id)}
                          aria-label={`Remove question: ${q.text.slice(0, 40)}...`}
                        >
                          <TrashIcon />
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="preview-questions-actions">
        <Link className="btn btn-outline" to="/preview">
          Back to extracted context
        </Link>
        <button className="btn btn-primary" type="button" onClick={() => navigate('/add-stakeholders')}>
          Next
        </button>
      </footer>
    </div>
  );
}
