import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createQuestion,
  deleteQuestion,
  getQuestionsPreview,
  updateQuestion,
  type QuestionItem,
} from "../api/engagements";
import "./Preview.css";
import "./PreviewInterviewQuestions.css";

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

function TrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function truncateQuestionPreview(text: string, max = 220) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default function PreviewInterviewQuestions() {
  const navigate = useNavigate();
  const engagementId = sessionStorage.getItem("ciassist_engagement_id");

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuestionItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ Load questions from backend
  useEffect(() => {
    if (!engagementId) return;
    (async () => {
      try {
        const data = await getQuestionsPreview(engagementId);
        setQuestions(data.questions);
      } catch (e) {
        console.error("Failed to load questions:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [engagementId]);

  useEffect(() => {
    if (editingId === null && !addingNew && !deleteTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (deleteTarget) {
        setDeleteTarget(null);
        setDeleteError(null);
        return;
      }
      if (addingNew) {
        setAddingNew(false);
        setSaveError(null);
        return;
      }
      setEditingId(null);
      setSaveError(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId, addingNew, deleteTarget]);

  useEffect(() => {
    if (editingId === null && !addingNew) return;
    const t = window.setTimeout(() => {
      const el = editTextareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }, 0);
    return () => clearTimeout(t);
  }, [editingId, addingNew]);

  const handleStartEdit = (q: QuestionItem) => {
    setSaveError(null);
    setAddingNew(false);
    setDraft(q.question_text);
    setEditingId(q.id);
  };

  const handleCancel = () => {
    setEditingId(null);
    setSaveError(null);
  };

  const handleStartAdd = () => {
    setSaveError(null);
    setEditingId(null);
    setDraft("");
    setAddingNew(true);
  };

  const handleCancelAdd = () => {
    setAddingNew(false);
    setSaveError(null);
  };

  async function handleSaveNew() {
    if (!engagementId || saving) return;
    const text = draft.trim();
    if (!text) {
      setSaveError("Question text cannot be empty.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const data = await createQuestion(engagementId, { question_text: text });
      setQuestions(data.questions);
      setAddingNew(false);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to save. Please try again.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  const openDeleteConfirm = (q: QuestionItem) => {
    setDeleteError(null);
    setDeleteTarget(q);
  };

  const closeDeleteConfirm = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };

  async function handleConfirmDelete() {
    if (!deleteTarget || !engagementId || deleteSubmitting) return;
    const id = deleteTarget.id;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const data = await deleteQuestion(engagementId, id);
      if (editingId === id) {
        setEditingId(null);
        setSaveError(null);
      }
      setDeleteTarget(null);
      setLeavingId(id);
      window.setTimeout(() => {
        setQuestions(
          data.questions.map((q) => ({
            ...q,
            pillar: q.pillar ?? null,
          })),
        );
        setLeavingId(null);
      }, 260);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to delete. Please try again.";
      setDeleteError(msg);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleSave(questionId: string) {
    if (!engagementId || saving) return;
    const text = draft.trim();
    if (!text) {
      setSaveError("Question text cannot be empty.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const data = await updateQuestion(engagementId, questionId, {
        question_text: text,
      });
      if (Array.isArray(data?.questions)) {
        setQuestions(
          data.questions.map((q: QuestionItem) => ({
            ...q,
            pillar: q.pillar ?? null,
          })),
        );
      } else {
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId ? { ...q, question_text: text } : q,
          ),
        );
      }
      setEditingId(null);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to save. Please try again.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="preview-questions-page preview-page">
        <header className="preview-questions-header preview-header card">
          <div className="preview-questions-header-content">
            <p className="preview-kicker">Stakeholder interview</p>
            <h1>Preview of Interview Questions</h1>
            <p>Loading questions…</p>
            <div className="preview-questions-header-meta">
              <span
                className="badge preview-questions-header-badge"
                aria-busy="true"
              >
                Loading…
              </span>
              <Link
                className="btn btn-outline preview-questions-back-stakeholders-btn"
                to="/add-stakeholders"
              >
                Back to Stakeholders
              </Link>
            </div>
          </div>
        </header>
        <section className="card preview-block preview-questions-section">
          <h2>Questions</h2>
          <p className="empty-row">Loading…</p>
        </section>
      </div>
    );
  }

  return (
    <div className="preview-questions-page preview-page">
      <header className="preview-questions-header preview-header card">
        <div className="preview-questions-header-content">
          <p className="preview-kicker">Stakeholder interview</p>
          <h1>Preview of Interview Questions</h1>
          <p className="preview-header-lead">
            Review and edit the interview questions generated for the
            stakeholder interview. You can add, edit, or remove questions before
            launching sessions.
          </p>
          <div className="preview-questions-header-meta">
            <span className="badge preview-questions-header-badge">
              {questions.length} Question{questions.length !== 1 ? "s" : ""}
            </span>
            <Link
              className="btn btn-outline preview-questions-back-stakeholders-btn"
              to="/add-stakeholders"
            >
              Back to Stakeholders
            </Link>
          </div>
        </div>
      </header>

      <section className="card preview-block preview-questions-section">
        <h2>Questions</h2>

        <div
          className="preview-extracted preview-questions-stack"
          role="list"
          aria-label="Interview questions"
        >
          {questions.length === 0 && !addingNew ? (
            <p className="empty-row preview-questions-empty-hint">
              No questions yet. Add a custom question below, or ensure documents
              were processed to generate a question set.
            </p>
          ) : null}

          {questions.map((q, i) => {
            const isEditing = editingId === q.id;
            return (
              <article
                key={q.id}
                className={`card preview-block preview-questions-card${leavingId === q.id ? " preview-questions-card--leaving" : ""}`}
                role="listitem"
              >
                <div className="preview-block-header preview-questions-card-header">
                  <div className="preview-questions-card-main">
                    <span
                      className="badge preview-questions-q-badge"
                      aria-label={`Question ${i + 1}`}
                    >
                      Q{i + 1}
                    </span>
                    {!isEditing ? (
                      <p className="preview-questions-card-text">
                        {q.question_text}
                      </p>
                    ) : null}
                  </div>
                  <div className="preview-block-actions preview-questions-card-actions">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost preview-questions-edit-btn"
                          onClick={handleCancel}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary preview-questions-save-btn"
                          onClick={() => handleSave(q.id)}
                          disabled={saving || !engagementId}
                          aria-busy={saving}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost preview-questions-delete-btn"
                          onClick={() => openDeleteConfirm(q)}
                          disabled={
                            !engagementId ||
                            editingId !== null ||
                            addingNew ||
                            deleteSubmitting ||
                            Boolean(deleteTarget)
                          }
                          aria-label={`Delete question ${i + 1}`}
                        >
                          <TrashIcon />
                          Delete
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost preview-questions-edit-btn"
                          onClick={() => handleStartEdit(q)}
                          disabled={
                            !engagementId || editingId !== null || addingNew
                          }
                          aria-label={`Edit question ${i + 1}`}
                        >
                          <PenIcon />
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <>
                    <textarea
                      ref={isEditing ? editTextareaRef : undefined}
                      className="preview-block-edit preview-block-edit--full preview-questions-inline-edit"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      aria-label={`Edit question ${i + 1}`}
                      rows={8}
                      disabled={saving}
                    />
                    {saveError ? (
                      <p className="preview-block-edit-error" role="alert">
                        {saveError}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </article>
            );
          })}

          {addingNew ? (
            <article
              className="card preview-block preview-questions-card preview-questions-card--draft"
              role="listitem"
            >
              <div className="preview-block-header preview-questions-card-header">
                <div className="preview-questions-card-main">
                  <span className="badge preview-questions-q-badge preview-questions-q-badge--new">
                    New
                  </span>
                </div>
                <div className="preview-block-actions preview-questions-card-actions">
                  <button
                    type="button"
                    className="btn btn-ghost preview-questions-edit-btn"
                    onClick={handleCancelAdd}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary preview-questions-save-btn"
                    onClick={handleSaveNew}
                    disabled={saving || !engagementId}
                    aria-busy={saving}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
              <textarea
                ref={editTextareaRef}
                className="preview-block-edit preview-block-edit--full preview-questions-inline-edit"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type your custom interview question…"
                aria-label="New question text"
                rows={8}
                disabled={saving}
              />
              {saveError ? (
                <p className="preview-block-edit-error" role="alert">
                  {saveError}
                </p>
              ) : null}
            </article>
          ) : null}
        </div>

        <div className="preview-questions-add-row">
          <button
            type="button"
            className="btn btn-outline preview-questions-add-btn"
            onClick={handleStartAdd}
            disabled={
              !engagementId ||
              editingId !== null ||
              addingNew ||
              saving ||
              Boolean(deleteTarget)
            }
          >
            ➕ Add Question
          </button>
        </div>
      </section>

      {deleteTarget ? (
        <div
          className="preview-questions-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteSubmitting) {
              closeDeleteConfirm();
            }
          }}
        >
          <div
            className="preview-questions-modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-questions-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="preview-questions-delete-title" className="preview-questions-modal-title">
              Delete question?
            </h3>
            <p className="preview-questions-modal-body">
              Are you sure you want to delete this question? This cannot be undone.
            </p>
            <p className="preview-questions-modal-preview">
              {truncateQuestionPreview(deleteTarget.question_text)}
            </p>
            {deleteError ? (
              <p className="preview-block-edit-error" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="preview-questions-modal-actions">
              <button
                type="button"
                className="btn btn-ghost preview-questions-edit-btn"
                onClick={closeDeleteConfirm}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn preview-questions-delete-confirm-btn"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting}
                aria-busy={deleteSubmitting}
              >
                {deleteSubmitting ? "Deleting…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="preview-actions">
        <Link className="btn btn-outline" to="/add-stakeholders">
          Back to Stakeholders
        </Link>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/launch")}
        >
          Continue to Launch
        </button>
      </footer>
    </div>
  );
}
