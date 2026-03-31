import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Preview.css";
import {
  getEngagementContext,
  getEngagementSummary,
  updateEngagementContext,
  type EngagementSummaryResponse,
  type ImpactGroup,
  type TypeOfChange,
} from "../api/engagements";

type UploadSection = {
  name: string;
  size: number;
  type?: string;
  lastModified?: number;
};

type UploadState = Record<string, UploadSection[]>;

type EditableCardId = "brief" | "type" | "rationale";

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
    title: "Groups Impacted",
    initialContent: "Rationale and drivers for the change initiative.",
  },
];

/** Keys and labels aligned with Upload page `UPLOAD_SECTIONS` */
const UPLOAD_ARTEFACT_SECTIONS: { id: string; label: string }[] = [
  { id: "brief", label: "Brief & Scope" },
  { id: "context", label: "Context Pack" },
  // { id: "method", label: "Method & Templates" },
  { id: "other", label: "Other Documents" },
];

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

/** Plain text shown in the editor for the brief + summary card (round-trips with parser below). */
function briefAndSummaryToPlain(brief: string, summaryList: string[]): string {
  const lines = (summaryList || []).map((p) => `• ${p}`);
  const summaryBlock =
    lines.length > 0 ? `Summary:\n${lines.join("\n")}` : "Summary:\n";
  return `${brief || ""}\n\n${summaryBlock}`.trimEnd();
}

function plainToBriefAndSummary(text: string): {
  brief: string;
  summary: string[];
} {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = normalized.match(/\n\s*Summary:\s*\n/i);
  if (!match || match.index === undefined) {
    return { brief: normalized.trim(), summary: [] };
  }
  const brief = normalized.slice(0, match.index).trim();
  const rest = normalized.slice(match.index + match[0].length);
  const summary = rest
    .split("\n")
    .map((l) => l.replace(/^\s*[•\-\*]\s*/, "").trim())
    .filter(Boolean);
  return { brief, summary };
}

function typeToPlain(t: TypeOfChange): string {
  return [
    `Current: ${t.current ?? ""}`,
    `Future: ${t.future ?? ""}`,
    `Description: ${t.description ?? ""}`,
  ].join("\n");
}

function plainToType(text: string, prev: TypeOfChange): TypeOfChange {
  let mode: "current" | "future" | "description" | null = null;
  const parts = {
    current: [] as string[],
    future: [] as string[],
    description: [] as string[],
  };

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const mc = line.match(/^Current:\s*(.*)$/i);
    if (mc) {
      mode = "current";
      parts.current.push(mc[1] ?? "");
      continue;
    }
    const mf = line.match(/^Future:\s*(.*)$/i);
    if (mf) {
      mode = "future";
      parts.future.push(mf[1] ?? "");
      continue;
    }
    const md = line.match(/^Description:\s*(.*)$/i);
    if (md) {
      mode = "description";
      parts.description.push(md[1] ?? "");
      continue;
    }
    if (mode) parts[mode].push(line);
  }

  const join = (a: string[]) => a.join("\n").trimEnd();
  const hasCurrent = /^Current:/im.test(text);
  const hasFuture = /^Future:/im.test(text);
  const hasDescription = /^Description:/im.test(text);

  if (!hasCurrent && !hasFuture && !hasDescription) {
    return { ...prev, description: text.trim() };
  }

  return {
    ...prev,
    current: hasCurrent ? join(parts.current) : (prev.current ?? ""),
    future: hasFuture ? join(parts.future) : (prev.future ?? ""),
    description: hasDescription
      ? join(parts.description)
      : (prev.description ?? ""),
  };
}

function groupsToPlain(groups: ImpactGroup[]): string {
  if (!groups?.length) return "None identified.";
  return groups
    .map((g) => {
      const desc = g.description ? ` — ${g.description}` : "";
      return `• ${g.name}${desc} (${g.confidence ?? "Low"})`;
    })
    .join("\n");
}

function plainToGroups(text: string): ImpactGroup[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized || /^none identified\.?$/i.test(normalized)) return [];

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let s = line.replace(/^\s*[•\-\*]\s*/, "").trim();
      const confMatch = s.match(/\(\s*(High|Medium|Low)\s*\)\s*$/i);
      const confidence = (confMatch?.[1] ?? "Low") as ImpactGroup["confidence"];
      if (confMatch) s = s.slice(0, confMatch.index).trim();

      const em = s.match(/^(.+?)\s*[—–\-]\s*(.+)$/);
      if (em) {
        return {
          name: em[1].trim(),
          description: em[2].trim(),
          confidence,
        };
      }
      return { name: s, description: null, confidence };
    });
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
  const [editingId, setEditingId] = useState<EditableCardId | null>(null);
  const [draft, setDraft] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  const plainDraftForCard = (
    id: EditableCardId,
    ctx: typeof rawContext,
  ): string => {
    if (id === "brief") {
      return briefAndSummaryToPlain(ctx.change_brief, ctx.change_summary);
    }
    if (id === "type") return typeToPlain(ctx.type_of_change);
    return groupsToPlain(ctx.impacted_groups);
  };

  const applyContextToUi = (
    ctx: typeof rawContext,
  ): Record<EditableCardId, string> => ({
    brief: formatBriefAndSummary(ctx.change_brief, ctx.change_summary),
    type: prettyPrintTypeOfChange(ctx.type_of_change),
    rationale: prettyPrintGroups(ctx.impacted_groups),
  });

  useEffect(() => {
    if (editingId === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setEditingId(null);
        setPublishError(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId]);

  useEffect(() => {
    if (editingId === null) return;
    const timer = window.setTimeout(() => {
      const el = editInputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }, 0);
    return () => clearTimeout(timer);
  }, [editingId]);

  const handleStartEdit = (id: EditableCardId) => {
    setPublishError(null);
    setDraft(plainDraftForCard(id, rawContext));
    setEditingId(id);
  };

  const handleCancel = () => {
    setEditingId(null);
    setPublishError(null);
  };

  const handlePublish = async (id: EditableCardId) => {
    if (!engagementId || publishing) return;

    let payload: Partial<{
      change_brief: string;
      change_summary: string[];
      impacted_groups: ImpactGroup[];
      type_of_change: TypeOfChange;
    }> = {};

    if (id === "brief") {
      const { brief, summary } = plainToBriefAndSummary(draft);
      payload = { change_brief: brief, change_summary: summary };
    } else if (id === "type") {
      payload = {
        type_of_change: plainToType(draft, rawContext.type_of_change),
      };
    } else if (id === "rationale") {
      payload = { impacted_groups: plainToGroups(draft) };
    }

    setPublishing(true);
    setPublishError(null);
    try {
      await updateEngagementContext(engagementId, payload);
      const contextData = await getEngagementContext(engagementId);
      const next = {
        change_brief: contextData.change_brief,
        change_summary: contextData.change_summary,
        impacted_groups: contextData.impacted_groups,
        type_of_change: contextData.type_of_change,
      };
      setRawContext(next);
      setContent((prev) => ({ ...prev, ...applyContextToUi(next) }));
      sessionStorage.setItem(
        "ciassist_preview_context",
        JSON.stringify(contextData),
      );
      setEditingId(null);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to save. Please try again.";
      setPublishError(msg);
    } finally {
      setPublishing(false);
    }
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
          rationale: prettyPrintGroups(contextData.impacted_groups),
        }));

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
          <p className="preview-header-lead">
            Validate extracted context before interviews begin. This preview
            becomes the baseline context for CIMMIE interview prompts and
            downstream CIA outputs.
          </p>
          {summary ? (
            <span className="badge preview-header-files-badge">
              Files uploaded: {summary.document_count}
            </span>
          ) : null}
        </div>
      </header>

      <section className="preview-grid">
        <article className="card preview-block">
          <h2>Uploaded Artefacts</h2>
          {UPLOAD_ARTEFACT_SECTIONS.map(({ id: key, label }) => {
            const files = uploads[key] || [];
            return (
              <div className="upload-group" key={key}>
                <h3>{label}</h3>
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
                          disabled={publishing}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handlePublish(card.id)}
                          disabled={publishing || !engagementId}
                          aria-busy={publishing}
                        >
                          {publishing ? "Saving…" : "Publish"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleStartEdit(card.id)}
                        disabled={!engagementId}
                        aria-label={`Edit ${card.title}`}
                      >
                        <PenIcon />
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <>
                    <textarea
                      ref={editInputRef}
                      className="preview-block-edit preview-block-edit--full"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      aria-label={`Edit ${card.title}`}
                      rows={14}
                      disabled={publishing}
                    />
                    {publishError ? (
                      <p className="preview-block-edit-error" role="alert">
                        {publishError}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div
                    className="summary-points summary-points--header-body"
                    dangerouslySetInnerHTML={{ __html: content[card.id] }}
                  />
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
