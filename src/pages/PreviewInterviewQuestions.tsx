import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getQuestionsPreview,
  updateQuestion,
  type QuestionItem,
  type QuestionUpdatePayload,
} from "../api/engagements";
import "./PreviewInterviewQuestions.css";

export default function PreviewInterviewQuestions() {
  const navigate = useNavigate();
  const engagementId = sessionStorage.getItem("ciassist_engagement_id");

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [editQuestion, setEditQuestion] = useState<QuestionItem | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftSectionIndex, setDraftSectionIndex] = useState<number>(1);
  const [draftPillarIndex, setDraftPillarIndex] = useState<number>(1);

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

  // ✅ Open edit modal/panel
  const openEdit = (q: QuestionItem) => {
    setEditQuestion(q);
    setDraftText(q.question_text);
    setDraftSectionIndex(q.section_index);
    setDraftPillarIndex(q.pillar_index ?? 1);
  };

  // ✅ Save update to backend
  async function saveQuestion() {
    if (!engagementId || !editQuestion) return;

    const payload: QuestionUpdatePayload = {
      question_text: draftText.trim(),
      section_index: draftSectionIndex,
      pillar_index: draftPillarIndex,
    };

    try {
      await updateQuestion(engagementId, editQuestion.id, payload);

      // Update local UI
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editQuestion.id
            ? {
                ...q,
                question_text: payload.question_text ?? q.question_text,
                section_index: payload.section_index ?? q.section_index,
                pillar_index: payload.pillar_index ?? q.pillar_index,
              }
            : q,
        ),
      );
      setEditQuestion(null);
    } catch (err) {
      console.error("Failed to update question:", err);
      alert("Failed to update question.");
    }
  }

  if (loading) {
    return <p className="loading">Loading questions…</p>;
  }

  return (
    <div className="preview-questions-page">
      <header className="preview-questions-header card">
        <div className="preview-questions-header-content">
          <h1>Preview of Interview Questions</h1>
          <p>
            Review and edit the interview questions generated for the
            stakeholder interview. You can add, edit, or remove questions before
            launching sessions.
          </p>
          <span className="badge preview-questions-header-badge">
            {questions.length} question{questions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      <section className="card preview-questions-block">
        <h2>Questions</h2>

        {questions.length === 0 ? (
          <p>No questions found.</p>
        ) : (
          <ul className="preview-questions-list">
            {questions.map((q, i) => (
              <li key={q.id} className="preview-questions-item">
                <span className="preview-questions-number">{i + 1}.</span>
                <span className="preview-questions-text">
                  {q.question_text}
                </span>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => openEdit(q)}
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ✅ EDIT PANEL */}
      {editQuestion && (
        <div className="edit-modal">
          <div className="edit-modal-content card">
            <h3>Edit Question</h3>

            <label>Question Text</label>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={3}
            />

            <label>Section Index</label>
            <input
              type="number"
              value={draftSectionIndex}
              onChange={(e) => setDraftSectionIndex(Number(e.target.value))}
            />

            <label>Pillar Index</label>
            <input
              type="number"
              value={draftPillarIndex}
              onChange={(e) => setDraftPillarIndex(Number(e.target.value))}
            />

            <div className="edit-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setEditQuestion(null)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveQuestion}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="preview-questions-actions">
        <Link className="btn btn-outline" to="/preview">
          Back to extracted context
        </Link>
        <button className="btn btn-primary" onClick={() => navigate("/launch")}>
          Continue to launch interview
        </button>
      </footer>
    </div>
  );
}
