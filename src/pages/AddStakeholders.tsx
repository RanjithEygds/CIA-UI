import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AddStakeholders.css";

import {
  getStakeholders,
  createStakeholderAndInterview,
  type StakeholderWithInterview,
} from "../api/engagements";

export type StakeholderEntry = {
  id: string;
  name: string;
  email: string;
  userGroup?: string;
  subGroup?: string;
};

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddStakeholders() {
  const navigate = useNavigate();

  // ✅ Engagement ID comes from sessionStorage
  const engagementId = sessionStorage.getItem("ciassist_engagement_id");

  const [stakeholders, setStakeholders] = useState<StakeholderWithInterview[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [userGroup, setUserGroup] = useState("");
  const [subGroup, setSubGroup] = useState("");
  const [touched, setTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editUserGroup, setEditUserGroup] = useState("");
  const [editSubGroup, setEditSubGroup] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // ✅ If engagementId missing → redirect back to dashboard
  useEffect(() => {
    if (!engagementId) {
      alert("Missing engagement. Please create or open an engagement first.");
      navigate("/");
    }
  }, [engagementId, navigate]);

  // ✅ Load stakeholders from backend
  useEffect(() => {
    if (!engagementId) return;

    async function load() {
      try {
        const data = await getStakeholders(engagementId!);
        setStakeholders(data.stakeholders);
      } catch (err: any) {
        console.log(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [engagementId]);

  const emailValid =
    email.trim().length === 0 || EMAIL_REGEX.test(email.trim());
  const canAdd = name.trim().length > 0 && EMAIL_REGEX.test(email.trim());

  const handleAdd = async () => {
    if (!engagementId) return;

    try {
      await createStakeholderAndInterview(engagementId, {
        name: name.trim(),
        email: email.trim(),
        role: userGroup || undefined,
        department: subGroup || undefined,
        engagement_level: undefined,
      });

      // ✅ Reload updated list
      const data = await getStakeholders(engagementId);
      setStakeholders(data.stakeholders);

      // Reset fields
      setName("");
      setEmail("");
      setUserGroup("");
      setSubGroup("");
      setTouched(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemove = () => {
    alert("Removing stakeholders is not yet supported from the backend.");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleSaveEdit = (id: string) => {
    const nextName = editName.trim();
    const nextEmail = editEmail.trim();
    if (!nextName) {
      setEditError("Name is required.");
      return;
    }
    if (!nextEmail || !EMAIL_REGEX.test(nextEmail)) {
      setEditError("Please enter a valid email address.");
      return;
    }
    setStakeholders((prev) =>
      prev.map((s) =>
        s.stakeholder_id === id
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
    navigate("/launch");
  };

  return (
    <div className="add-stakeholders-page">
      <header className="add-stakeholders-header card">
        <div>
          <p className="add-stakeholders-kicker">Interview setup</p>
          <h1>Add Stakeholders</h1>
          <p>
            Add names and email addresses for interview participants.
            Stakeholders are saved instantly and linked to interviews.
          </p>
        </div>

        <div className="add-stakeholders-meta">
          <span className="badge">
            {stakeholders.length} stakeholder
            {stakeholders.length !== 1 ? "s" : ""}
          </span>

          <button
            className="btn btn-primary"
            type="button"
            onClick={handleContinue}
            disabled={stakeholders.length === 0}
          >
            Continue to launch
          </button>
          <div className="add-stakeholders-meta">
            <span className="badge">
              {stakeholders.length} stakeholder
              {stakeholders.length !== 1 ? "s" : ""}
            </span>
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

      {loading && <p>Loading stakeholders...</p>}

      <section className="card add-stakeholders-block">
        <h2>Stakeholder list</h2>

        {/* Form */}
        <div className="add-stakeholders-form">
          <div className="add-stakeholders-input-row">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onBlur={() => setTouched(true)}
              onChange={(e) => setName(e.target.value)}
              placeholder="Stakeholder name"
            />
          </div>

          <div className="add-stakeholders-input-row">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onBlur={() => setTouched(true)}
              onChange={(e) => setEmail(e.target.value)}
              className={touched && !emailValid ? "invalid" : ""}
            />
            {touched && !emailValid && (
              <span className="error">Invalid email</span>
            )}
          </div>

          <button
            className="btn btn-outline"
            onClick={handleAdd}
            disabled={!canAdd}
          >
            Add stakeholder
          </button>
        </div>

        {stakeholders.length === 0 ? (
          <p>No stakeholders added yet.</p>
        ) : (
          <ul className="add-stakeholders-list">
            {stakeholders.map((s, i) => {
              const isEditing = editingId === s.stakeholder_id;
              return (
                <li
                  key={s.stakeholder_id}
                  className="card preview-block add-stakeholders-item"
                >
                  <div className="preview-block-header add-stakeholders-item-header">
                    <div className="add-stakeholders-item-main">
                      <span
                        className="badge add-stakeholders-s-badge"
                        aria-label={`Stakeholder ${i + 1}`}
                      >
                        S{i + 1}
                      </span>
                      {!isEditing ? (
                        <div className="add-stakeholders-item-text">
                          <p className="add-stakeholders-item-name">{s.name}</p>
                          <p className="add-stakeholders-item-email">
                            {s.email}
                          </p>
                          {s.role ? (
                            <p className="add-stakeholders-item-meta">
                              <span>User Group:</span> {s.role}
                            </p>
                          ) : null}
                          {s.engagement_level ? (
                            <p className="add-stakeholders-item-meta">
                              <span>Sub-Group:</span> {s.engagement_level}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="preview-block-actions add-stakeholders-item-actions">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost add-stakeholders-edit-btn"
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary add-stakeholders-save-btn"
                            onClick={() => handleSaveEdit(s.stakeholder_id)}
                          >
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost add-stakeholders-delete-btn"
                            onClick={() => handleRemove()}
                            aria-label={`Remove ${s.name}`}
                          >
                            <TrashIcon />
                            Delete
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost add-stakeholders-edit-btn"
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
                        <label
                          htmlFor={`stakeholder-edit-name-${s.stakeholder_id}`}
                          className="add-stakeholders-label"
                        >
                          Name
                        </label>
                        <input
                          id={`stakeholder-edit-name-${s.stakeholder_id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div className="add-stakeholders-input-row">
                        <label
                          htmlFor={`stakeholder-edit-email-${s.stakeholder_id}`}
                          className="add-stakeholders-label"
                        >
                          Email
                        </label>
                        <input
                          id={`stakeholder-edit-email-${s.stakeholder_id}`}
                          type="email"
                          className="add-stakeholders-input"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                        />
                      </div>
                      <div className="add-stakeholders-input-row">
                        <label
                          htmlFor={`stakeholder-edit-user-group-${s.stakeholder_id}`}
                          className="add-stakeholders-label"
                        >
                          User Group{" "}
                          <span className="add-stakeholders-optional">
                            (optional)
                          </span>
                        </label>
                        <input
                          id={`stakeholder-edit-user-group-${s.stakeholder_id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editUserGroup}
                          onChange={(e) => setEditUserGroup(e.target.value)}
                        />
                      </div>
                      <div className="add-stakeholders-input-row">
                        <label
                          htmlFor={`stakeholder-edit-sub-group-${s.stakeholder_id}`}
                          className="add-stakeholders-label"
                        >
                          Sub-Group{" "}
                          <span className="add-stakeholders-optional">
                            (optional)
                          </span>
                        </label>
                        <input
                          id={`stakeholder-edit-sub-group-${s.stakeholder_id}`}
                          type="text"
                          className="add-stakeholders-input"
                          value={editSubGroup}
                          onChange={(e) => setEditSubGroup(e.target.value)}
                        />
                      </div>
                      {editError ? (
                        <p className="add-stakeholders-error">{editError}</p>
                      ) : null}
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
