import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AddStakeholders.css";

import {
  getStakeholders,
  createStakeholderAndInterview,
  updateStakeholder,
  deleteStakeholder,
  type StakeholderWithInterview,
} from "../api/engagements";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function AddStakeholders() {
  const navigate = useNavigate();
  const engagementId = sessionStorage.getItem("ciassist_engagement_id");

  const [stakeholders, setStakeholders] = useState<StakeholderWithInterview[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  // Create fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const canAdd = name.trim().length > 0 && EMAIL_REGEX.test(email.trim());
  const [touched, setTouched] = useState(false);

  // Editing fields
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const emailValid =
    email.trim().length === 0 || EMAIL_REGEX.test(email.trim());

  useEffect(() => {
    if (!engagementId) {
      alert("Missing engagement. Please create or open an engagement first.");
      navigate("/");
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const data = await getStakeholders(engagementId!);
        setStakeholders(data.stakeholders);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [engagementId, navigate]);

  async function refreshList() {
    if (!engagementId) return;
    const data = await getStakeholders(engagementId);
    setStakeholders(data.stakeholders);
  }

  // ✅ CREATE stakeholder
  const handleAdd = async () => {
    if (!engagementId || !canAdd) return;

    try {
      await createStakeholderAndInterview(engagementId, {
        name: name.trim(),
        email: email.trim(),
        role: role.trim(),
        department: dept.trim(),
      });

      await refreshList();
      setName("");
      setEmail("");
      setRole("");
      setDept("");
      setTouched(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ✅ DELETE stakeholder
  const handleDelete = async (id: string, name: string) => {
    if (!engagementId) return;
    const ok = window.confirm(
      `Delete stakeholder "${name}"? Their interview will also be removed.`,
    );
    if (!ok) return;

    try {
      await deleteStakeholder(engagementId, id);
      await refreshList();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ✅ ENTER EDIT MODE
  const startEdit = (s: StakeholderWithInterview) => {
    setEditingId(s.stakeholder_id);
    setEditName(s.name);
    setEditEmail(s.email ?? "");
    setEditRole(s.role ?? "");
    setEditDept(s.department ?? "");
    setEditError(null);
  };

  // ✅ CANCEL editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  // ✅ SAVE edited stakeholder
  const handleSaveEdit = async (id: string) => {
    if (!engagementId) return;

    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }
    if (!editEmail.trim() || !EMAIL_REGEX.test(editEmail.trim())) {
      setEditError("Valid email is required.");
      return;
    }

    try {
      await updateStakeholder(engagementId, id, {
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole.trim() || undefined,
        department: editDept.trim() || undefined,
      });

      await refreshList();
      setEditingId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleContinue = () => navigate("/launch");

  return (
    <div className="add-stakeholders-page">
      <header className="add-stakeholders-header card">
        <div className="add-stakeholders-header-content">
          <p className="add-stakeholders-kicker">Interview setup</p>
          <h1>Add Stakeholders</h1>
          <p>
            Manage stakeholders for this engagement. Create, edit, or delete
            participants.
          </p>
          <div className="add-stakeholders-meta">
            <span className="badge">{stakeholders.length} stakeholders</span>
            <button
              className="btn btn-primary"
              onClick={handleContinue}
              disabled={stakeholders.length === 0}
            >
              Continue to launch
            </button>
          </div>
        </div>
      </header>

      {loading && <p>Loading stakeholders...</p>}

      {/* CREATE FORM  */}
      <section className="card add-stakeholders-block">
        <h2>Stakeholder list</h2>

        <div className="add-stakeholders-form">
          <div className="add-stakeholders-input-row">
            <label className="add-stakeholders-label">Name</label>
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
            <label className="add-stakeholders-label">Email</label>
            <input
              id="stakeholder-email"
              type="email"
              className={`add-stakeholders-input ${touched && !emailValid ? "add-stakeholders-input-invalid" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="email@example.com"
              aria-label="Stakeholder email"
              aria-invalid={touched && !emailValid}
            />
            {touched && !EMAIL_REGEX.test(email) && (
              <span className="error">Invalid email</span>
            )}
          </div>
          <div className="add-stakeholders-input-row">
            <div className="add-stakeholders-label-row">
              <label className="add-stakeholders-label">User Group</label>
              <span className="add-stakeholders-optional">(Optional)</span>
            </div>
            <input
              id="stakeholder-user-group"
              type="text"
              className="add-stakeholders-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Finance, IT"
              aria-label="User group (optional)"
            />
          </div>
          <div className="add-stakeholders-input-row">
            <div className="add-stakeholders-label-row">
              <label className="add-stakeholders-label">Sub-Group</label>
              <span className="add-stakeholders-optional">(Optional)</span>
            </div>
            <input
              id="stakeholder-sub-group"
              type="text"
              className="add-stakeholders-input"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              placeholder="e.g. Payables, Infrastructure"
              aria-label="Sub-group (optional)"
            />
          </div>

          <button
            className="btn btn-outline"
            disabled={!canAdd}
            onClick={handleAdd}
          >
            Add stakeholder
          </button>
        </div>

        {/* LIST */}
        {stakeholders.length === 0 ? (
          <p className="add-stakeholders-empty">No stakeholder record</p>
        ) : (
          <ul className="add-stakeholders-list">
            {stakeholders.map((s, idx) => {
              const isEditing = editingId === s.stakeholder_id;
              return (
                <li
                  key={s.stakeholder_id}
                  className="card preview-block add-stakeholders-item"
                >
                  <div className="preview-block-header add-stakeholders-item-header">
                    <span className="badge add-stakeholders-s-badge">
                      S{idx + 1}
                    </span>

                    {!isEditing ? (
                      <>
                        <div className="add-stakeholders-item-text">
                          <p className="add-stakeholders-item-name">{s.name}</p>
                          <p className="add-stakeholders-item-email">
                            {s.email}
                          </p>

                          {s.role && (
                            <p className="add-stakeholders-item-meta">
                              User Group: {s.role}
                            </p>
                          )}

                          {s.department && (
                            <p className="add-stakeholders-item-meta">
                              Sub-Group: {s.department}
                            </p>
                          )}
                        </div>

                        <div>
                          <button
                            className="btn btn-ghost add-stakeholders-delete-btn"
                            onClick={() =>
                              handleDelete(s.stakeholder_id, s.name)
                            }
                          >
                            <TrashIcon /> Delete
                          </button>
                          <button
                            className="btn btn-ghost add-stakeholders-edit-btn"
                            onClick={() => startEdit(s)}
                          >
                            <PenIcon /> Edit
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* EDIT MODE */}
                        <button
                          className="btn btn-ghost"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleSaveEdit(s.stakeholder_id)}
                        >
                          Save
                        </button>
                      </>
                    )}
                  </div>

                  {isEditing && (
                    <div className="add-stakeholders-edit-grid">
                      <div className="add-stakeholders-input-row">
                        <label className="add-stakeholders-label">Name</label>
                        <input
                          id={`stakeholder-edit-name-${s.stakeholder_id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>

                      <div className="add-stakeholders-input-row">
                        <label className="add-stakeholders-label">Email</label>
                        <input
                          id={`stakeholder-edit-email-${s.stakeholder_id}`}
                          type="email"
                          className="add-stakeholders-input"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                        />
                      </div>

                      <div className="add-stakeholders-input-row">
                        <div className="add-stakeholders-label-row">
                          <label className="add-stakeholders-label">
                            User Group
                          </label>
                          <span className="add-stakeholders-optional">
                            (Optional)
                          </span>
                        </div>
                        <input
                          id={`stakeholder-edit-user-group-${s.stakeholder_id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                        />
                      </div>

                      <div className="add-stakeholders-input-row">
                        <div className="add-stakeholders-label-row">
                          <label className="add-stakeholders-label">
                            Sub-Group
                          </label>
                          <span className="add-stakeholders-optional">
                            (Optional)
                          </span>
                        </div>
                        <input
                          id={`stakeholder-edit-sub-group-${s.stakeholder_id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editDept}
                          onChange={(e) => setEditDept(e.target.value)}
                        />
                      </div>

                      {editError && (
                        <p className="add-stakeholders-error">{editError}</p>
                      )}
                    </div>
                  )}
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
          onClick={handleContinue}
          disabled={stakeholders.length === 0}
        >
          Continue to launch
        </button>
      </footer>
    </div>
  );
}