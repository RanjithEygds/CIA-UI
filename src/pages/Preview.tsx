import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Preview.css";
import {
  getEngagementContext,
  getEngagementSummary,
  updateEngagementContext,
  type EngagementSummaryResponse,
  type ImpactGroup,
  type Stakeholder,
  type TypeOfChange,
} from "../api/engagements";

type UploadSection = {
  name: string;
  size: number;
  type?: string;
  lastModified?: number;
};

type UploadState = Record<string, UploadSection[]>;

type EditableCardId =
  | "brief"
  | "type"
  | "rationale"
  | "stakeholders"
  | "research";

type StakeholderEntry = { name: string; email: string };

const EDITABLE_CARDS: {
  id: EditableCardId;
  title: string;
  initialContent: string;
}[] = [
  {
    id: "brief",
    title: "Change Brief & Summary",
    initialContent:
      "High-level description and scope of the change initiative.",
  },
  {
    id: "type",
    title: "Type Of Change",
    initialContent:
      "Classification of the change (e.g. process, technology, operating model).",
  },
  {
    id: "rationale",
    title: "Change Rationale",
    initialContent: "Rationale and drivers for the change initiative.",
  },
];

const SECTION_LABELS: Record<string, string> = {
  brief: "Brief and scope",
  context: "Context pack",
  method: "Method and templates",
  stakeholder: "Stakeholder list and interview plan",
};

function toReadableSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** idx;
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function readUploadState(): UploadState {
  try {
    const manifestStr = sessionStorage.getItem(
      "ciassist_file_manifest_by_section",
    );
    if (manifestStr) {
      const manifest = JSON.parse(manifestStr) as UploadState;
      const ok = typeof manifest === "object" && manifest !== null;
      return ok ? manifest : {};
    }
  } catch {
    /* ignore and fallback */
  }
  return {};
}

function useEngagementId(): string | null {
  return sessionStorage.getItem("ciassist_engagement_id") || null;
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

export default function Preview() {
  const navigate = useNavigate();
  const uploads = useMemo(() => readUploadState(), []);
  const engagementId = useEngagementId();
  const [rawContext, setRawContext] = useState<{
    change_brief: string;
    change_summary: string[];
    impacted_groups: ImpactGroup[];
    type_of_change: TypeOfChange;
  }>({
    change_brief: "",
    change_summary: [],
    impacted_groups: [],
    type_of_change: {
      current: "",
      future: "",
      description: "",
      confidence: "Low",
    },
  });

  const [summary, setSummary] = useState<EngagementSummaryResponse | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(true);

  const [content, setContent] = useState<Record<EditableCardId, string>>(
    () =>
      Object.fromEntries(
        EDITABLE_CARDS.map((c) => [c.id, c.initialContent]),
      ) as Record<EditableCardId, string>,
  );
  const [stakeholdersList, setStakeholdersList] = useState<StakeholderEntry[]>(
    [],
  );
  const [editingId, setEditingId] = useState<EditableCardId | null>(null);
  const [draft, setDraft] = useState("");
  const [newStakeholderName, setNewStakeholderName] = useState("");
  const [newStakeholderEmail, setNewStakeholderEmail] = useState("");
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingId !== null && editingId !== "stakeholders") {
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
      if (e.key === "Escape") {
        e.preventDefault();
        setEditingId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId]);

  const handleStartEdit = (id: EditableCardId) => {
    setEditingId(id);
  };

  const handleCancel = () => {
    setEditingId(null);
  };

  const handlePublish = async (id: EditableCardId) => {
    if (!engagementId) return;

    let payload: any = {};

    if (id === "brief") {
      // draft contains plain text of brief only
      rawContext.change_brief = draft;
      payload.change_brief = rawContext.change_brief;
    }

    if (id === "type") {
      // Currently only editing description — adjust when UI supports full editing
      rawContext.type_of_change = {
        ...rawContext.type_of_change,
        description: draft,
      };
      payload.type_of_change = rawContext.type_of_change;
    }

    // if (id === "groups") {
    //   // Convert drafted text into ImpactGroup[]
    //   rawContext.impacted_groups = draft
    //     .split("\n")
    //     .filter((line) => line.trim())
    //     .map((line) => ({
    //       name: line.replace("•", "").trim(),
    //       description: null,
    //       confidence: "Low",
    //     }));

    //   payload.impacted_groups = rawContext.impacted_groups;
    // }

    if (id === "stakeholders") {
      // stakeholdersList already holds the updated list
      payload.stakeholders = stakeholdersList.map((s) => ({
        name: s.name,
        email: s.email,
      }));
    }

    // ✅ SEND UPDATE TO BACKEND
    await updateEngagementContext(engagementId, payload);

    // ✅ UPDATE PRETTY UI CONTENT
    setContent((prev) => ({ ...prev, [id]: draft }));

    setEditingId(null);
  };

  const addStakeholder = () => {
    const name = newStakeholderName.trim();
    const email = newStakeholderEmail.trim();
    if (!name && !email) return;
    setStakeholdersList((prev) => [
      ...prev,
      { name: name || "—", email: email || "—" },
    ]);
    setNewStakeholderName("");
    setNewStakeholderEmail("");
  };

  const removeStakeholder = (index: number) => {
    setStakeholdersList((prev) => prev.filter((_, i) => i !== index));
  };

  function prettyPrintTypeOfChange(t: any): string {
    if (!t) return "Unknown";
    return [
      `Current: ${t.current || "Unknown"}`,
      `Future: ${t.future || "Unknown"}`,
      `Description: ${t.description || "Unknown"}`,
    ].join("<br />");
  }

  function prettyPrintGroups(groups: any[]): string {
    if (!groups || groups.length === 0) return "None identified.";

    return groups
      .map(
        (g) =>
          `• ${g.name}${g.description ? ` — ${g.description}` : ""} (${g.confidence})`,
      )
      .join("<br />");
  }

  function formatBriefAndSummary(brief: string, summaryList: string[]): string {
    const bullets = (summaryList || [])
      .map((point) => `• ${point}`)
      .join("<br/>");

    return `
    <div>
      <p>${brief}</p>
      <br/>
      <strong>Summary:</strong><br/>
      ${bullets}
    </div>
  `;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!engagementId) {
        console.log("Missing engagement id. Please go back and start again.");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // This calls Agent 1 (prep) behind the scenes and returns summary + docs
        const summaryData = await getEngagementSummary(engagementId);
        const contextData = await getEngagementContext(engagementId);
        if (!mounted) return;
        setSummary(summaryData);
        setRawContext({
          change_brief: contextData.change_brief,
          change_summary: contextData.change_summary,
          impacted_groups: contextData.impacted_groups,
          type_of_change: contextData.type_of_change,
        });

        setContent((prev) => ({
          ...prev,
          brief: formatBriefAndSummary(
            contextData.change_brief,
            contextData.change_summary,
          ),
          type: prettyPrintTypeOfChange(contextData.type_of_change),
          groups: prettyPrintGroups(contextData.impacted_groups),
          stakeholders: "", // stakeholders use separate UI list
          research: prev.research, // leave untouched
        }));

        // ✅ Populate stakeholder list (for stakeholder card)
        setStakeholdersList(
          contextData.stakeholders.map((s: Stakeholder) => ({
            name: s.name || "—",
            email: s.email || "—",
          })),
        );

        // Optionally cache for other pages
        sessionStorage.setItem(
          "ciassist_preview_summary",
          JSON.stringify(summaryData),
        );
        sessionStorage.setItem(
          "ciassist_preview_context",
          JSON.stringify(contextData),
        );
      } catch (e: any) {
        if (!mounted) return;
        console.log(e?.message || "Failed to load engagement summary.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [engagementId]);

  if (loading) {
    return (
      <div className="preview-page">
        <header className="preview-header card">
          <div>
            <p className="preview-kicker">Data Extraction Agent Output</p>
            <h1>Preview of Extracted Change Context</h1>
            <p>Loading extracted context…</p>
          </div>
        </header>

        <section className="preview-grid">
          <article className="card preview-block">
            <h2>Uploaded Artefacts</h2>
            <p>Loading files…</p>
          </article>

          <div className="preview-extracted">
            {EDITABLE_CARDS.map((card) => (
              <article key={card.id} className="card preview-block">
                <h2>{card.title}</h2>
                <p className="empty-row">Loading…</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="preview-page">
      <header className="preview-header card">
        <div className="preview-header-content">
          <p className="preview-kicker">Data Extraction Agent Output</p>
          <h1>Preview of Extracted Change Context</h1>
          <p>
            Validate extracted context before interviews begin. This preview
            becomes the baseline context for CIMMIE interview prompts and
            downstream CIA outputs.
          </p>
          <span className="badge preview-header-badge">
            {/* Files uploaded: {totalFiles} */}
          </span>
        </div>
        <div className="preview-meta">
          {summary && (
            <span className="badge">
              Files uploaded: {summary.document_count}
            </span>
          )}
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => navigate("/preview-questions")}
          >
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
                  <p className="empty-row">
                    No files uploaded for this section.
                  </p>
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
                {card.id === "stakeholders" ? (
                  isEditing ? (
                    <div className="preview-stakeholders-wrap">
                      <ul className="preview-stakeholders-list">
                        {stakeholdersList.map((s, i) => (
                          <li key={i} className="preview-stakeholders-item">
                            <span className="preview-stakeholders-name">
                              {s.name}
                            </span>
                            <span className="preview-stakeholders-email">
                              {s.email}
                            </span>
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
                          onChange={(e) =>
                            setNewStakeholderName(e.target.value)
                          }
                          aria-label="Stakeholder name"
                        />
                        <input
                          type="email"
                          className="preview-stakeholders-input"
                          placeholder="Email"
                          value={newStakeholderEmail}
                          onChange={(e) =>
                            setNewStakeholderEmail(e.target.value)
                          }
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
                            <li
                              key={i}
                              className="preview-stakeholders-item preview-stakeholders-item-readonly"
                            >
                              <span className="preview-stakeholders-name">
                                {s.name}
                              </span>
                              <span className="preview-stakeholders-email">
                                {s.email}
                              </span>
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
                    <div
                      className="summary-points"
                      dangerouslySetInnerHTML={{ __html: content[card.id] }}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <footer className="preview-actions">
        <Link className="btn btn-outline" to="/upload">
          Back to uploads
        </Link>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => navigate("/preview-questions")}
        >
          Next
        </button>
      </footer>
    </div>
  );
}
