import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./UploadDocument.css";
import {
  createEngagement,
  getEngagementSummary,
  uploadDocumentWithProgress,
} from "../api/engagements";

const UPLOAD_SECTIONS = [
  {
    id: "brief",
    label: "Brief & Scope",
    desc: "Programme objectives, case for change, timeline/waves, known constraints",
  },
  {
    id: "context",
    label: "Context Pack",
    desc: "Org charts, role lists, process maps, programme materials, project uploads",
  },
  // {
  //   id: "method",
  //   label: "Method & Templates",
  //   desc: "CIA structure/sections, CIA Questionnaire and CIA template workbook",
  // },
  {
    id: "other",
    label: "Other Documents",
    desc: "Any additional change-related documents not covered above",
  },
] as const;

type UploadStatus = "uploading" | "success" | "error" | "pending";

type UploadEntry = {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  errorMessage?: string;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(i > 0 ? 1 : 0))} ${sizes[i]}`;
}

type FileKind =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "txt"
  | "csv"
  | "image"
  | "zip"
  | "generic";

function getFileKind(file: File): { kind: FileKind; label: string } {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1) : "";

  if (ext === "pdf") return { kind: "pdf", label: "PDF" };
  if (ext === "docx" || ext === "doc")
    return { kind: "docx", label: ext === "doc" ? "DOC" : "DOCX" };
  if (ext === "xlsx" || ext === "xls")
    return { kind: "xlsx", label: ext === "xls" ? "XLS" : "XLSX" };
  if (ext === "pptx" || ext === "ppt")
    return { kind: "pptx", label: ext === "ppt" ? "PPT" : "PPTX" };
  if (ext === "csv") return { kind: "csv", label: "CSV" };
  if (ext === "txt") return { kind: "txt", label: "TXT" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return { kind: "image", label: "IMG" };
  if (["zip", "rar", "7z", "gz", "tar"].includes(ext))
    return { kind: "zip", label: "ZIP" };
  return { kind: "generic", label: "Other" };
}

function FileTypeIcon({ kind, label }: { kind: FileKind; label: string }) {
  const svgProps = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg" as const,
    "aria-hidden": true as const,
  };

  const inner = (() => {
    switch (kind) {
      case "pdf":
        return (
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        );
      case "docx":
        return (
          <>
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M8 12h8M8 16h5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        );
      case "xlsx":
        return (
          <>
            <rect
              x="4"
              y="4"
              width="16"
              height="16"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M4 9h16M9 4v16M14 4v16"
              stroke="currentColor"
              strokeWidth="1.25"
            />
          </>
        );
      case "pptx":
        return (
          <>
            <rect
              x="3"
              y="4"
              width="18"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M3 10h18M10 4v14"
              stroke="currentColor"
              strokeWidth="1.25"
            />
          </>
        );
      case "txt":
        return (
          <>
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M8 13h8M8 17h6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        );
      case "csv":
        return (
          <>
            <rect
              x="4"
              y="4"
              width="16"
              height="16"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M4 10h16M4 14h16M12 4v16"
              stroke="currentColor"
              strokeWidth="1.25"
            />
          </>
        );
      case "image":
        return (
          <>
            <rect
              x="3"
              y="5"
              width="18"
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
            <path
              d="M21 15l-5-5-4 4-3-3-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        );
      case "zip":
        return (
          <>
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M12 2v6M10 8h4M10 11h4M10 14h4"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </>
        );
      default:
        return (
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        );
    }
  })();

  return (
    <span
      className={`upload-file-type-icon-wrap upload-file-type-icon-wrap--${kind}`}
      title={label}
      aria-label={label}
    >
      <svg {...svgProps}>{inner}</svg>
    </span>
  );
}

function UploadFileRow({
  entry,
  onRemove,
}: {
  entry: UploadEntry;
  onRemove: () => void;
}) {
  const { kind, label } = getFileKind(entry.file);
  const showProgress = entry.status === "uploading";
  const pct = showProgress ? entry.progress : 0;
  return (
    <li className={`upload-file-row upload-file-row--${entry.status}`}>
      <FileTypeIcon kind={kind} label={label} />
      <div className="upload-file-row-main">
        <div className="upload-file-row-title">
          <span className="upload-file-name" title={entry.file.name}>
            {entry.file.name}
          </span>
          <span className="upload-file-meta">
            {formatBytes(entry.file.size)}
          </span>
        </div>
        {showProgress && (
          <div className="upload-file-progress-wrap">
            <div
              className="upload-file-progress-track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Upload progress ${pct}%`}
            >
              <div
                className="upload-file-progress-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="upload-file-progress-pct">{pct}%</span>
          </div>
        )}
        {entry.status === "error" && (
          <p className="upload-file-error" role="alert">
            {entry.errorMessage ?? "Upload failed."}
          </p>
        )}
      </div>
      <div className="upload-file-row-status">
        {entry.status === "success" && (
          <span
            className="upload-file-success-icon"
            title="Uploaded"
            aria-label="Upload complete"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M20 6L9 17l-5-5"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        {entry.status === "error" && (
          <span
            className="upload-file-error-icon"
            title={entry.errorMessage ?? "Upload failed"}
            aria-label="Upload failed"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path
                d="M15 9l-6 6M9 9l6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
        )}
        {entry.status === "uploading" && (
          <span className="upload-file-status-placeholder" aria-hidden="true" />
        )}
        {entry.status === "pending" && (
          <span className="upload-file-status-placeholder" aria-hidden="true" />
        )}
        <button
          type="button"
          className="btn btn-ghost file-remove"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

type FilesBySection = Record<string, UploadEntry[]>;

export default function UploadDocument() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FilesBySection>({
    brief: [],
    context: [],
    method: [],
    other: [],
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const [engagementName, setEngagementName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleExtract() {
    try {
      setLoading(true);

      // --- Step 1: Create engagement ---
      const { engagement_id } = await createEngagement(
        engagementName || undefined,
      );

      // Save for next pages
      sessionStorage.setItem("ciassist_engagement_id", engagement_id);
      sessionStorage.setItem("ciassist_engagement_name", engagementName || "");

      // --- Step 2: Prepare all files ---
      const filesBySection = files as FilesBySection;
      const allEntries: UploadEntry[] = Object.values(filesBySection).flat();
      if (allEntries.length === 0) {
        throw new Error("No files to upload.");
      }

      const { countsBySection, totalCount, manifestBySection } =
        computeFileStats(filesBySection);
      sessionStorage.setItem(
        "ciassist_file_counts_by_section",
        JSON.stringify(countsBySection),
      );
      sessionStorage.setItem(
        "ciassist_file_manifest_by_section",
        JSON.stringify(manifestBySection),
      );
      sessionStorage.setItem("ciassist_total_files", String(totalCount));

      const inferCategory = (file: File): string | undefined => {
        for (const [section, list] of Object.entries(filesBySection)) {
          if (list.some((entry) => entry.file === file)) return section;
        }
        return undefined;
      };

      for (const entry of allEntries) {
        const sectionId = inferCategory(entry.file)!;
        setFiles((prev) => ({
          ...prev,
          [sectionId]: prev[sectionId].map((e) =>
            e.id === entry.id
              ? { ...e, status: "uploading" as UploadStatus, progress: 0 }
              : e,
          ),
        }));

        try {
          await uploadDocumentWithProgress(engagement_id, entry.file, {
            category: sectionId,
            name: entry.file.name,
            onProgress: (pct) => {
              setFiles((prev) => ({
                ...prev,
                [sectionId]: prev[sectionId].map((e) =>
                  e.id === entry.id
                    ? {
                        ...e,
                        progress: pct,
                        status: "uploading" as UploadStatus,
                      }
                    : e,
                ),
              }));
            },
          });
          setFiles((prev) => ({
            ...prev,
            [sectionId]: prev[sectionId].map((e) =>
              e.id === entry.id
                ? {
                    ...e,
                    progress: 100,
                    status: "success" as UploadStatus,
                  }
                : e,
            ),
          }));
        } catch (uploadErr: unknown) {
          const msg =
            uploadErr instanceof Error
              ? uploadErr.message
              : "Upload failed.";
          setFiles((prev) => ({
            ...prev,
            [sectionId]: prev[sectionId].map((e) =>
              e.id === entry.id
                ? {
                    ...e,
                    status: "error" as UploadStatus,
                    errorMessage: msg,
                  }
                : e,
            ),
          }));
          throw uploadErr;
        }
      }

      // --- Step 4: Optionally fetch summary (for preview) ---
      const summary = await getEngagementSummary(engagement_id);
      sessionStorage.setItem(
        "ciassist_engagement_summary",
        JSON.stringify(summary),
      );

      // --- Step 5: Navigate to preview ---
      navigate("/preview", { state: { engagementId: engagement_id } });
    } catch (e: any) {
      console.error(e);
      if (e?.name === "AbortError") {
        console.log("Upload cancelled.");
      } else {
        console.log(e?.message || "Upload failed");
      }
    } finally {
      setLoading(false);
    }
  }

  function computeFileStats(filesBySection: FilesBySection) {
    const countsBySection: Record<string, number> = {};
    const manifestBySection: Record<
      string,
      Array<{ name: string; size: number; type: string; lastModified?: number }>
    > = {};

    let totalCount = 0;

    for (const [section, sectionFiles] of Object.entries(filesBySection)) {
      const count = sectionFiles?.length ?? 0;
      countsBySection[section] = count;
      totalCount += count;

      manifestBySection[section] = (sectionFiles || []).map((e) => ({
        name: e.file.name,
        size: e.file.size,
        type: e.file.type,
        lastModified: e.file.lastModified,
      }));
    }

    return { countsBySection, totalCount, manifestBySection };
  }

  const addFiles = useCallback(
    (sectionId: string, newFiles: FileList | null) => {
      if (!newFiles?.length) return;

      const accepted = Array.from(newFiles);

      setFiles((prev) => ({
        ...prev,
        [sectionId]: [
          ...prev[sectionId],
          ...accepted.map((file) => ({
            id: crypto.randomUUID(),
            file,
            progress: 0,
            status: "pending" as const,
          })),
        ],
      }));
    },
    [],
  );

  const removeFile = useCallback((sectionId: string, entryId: string) => {
    setFiles((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].filter((e) => e.id !== entryId),
    }));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, sectionId: string) => {
      e.preventDefault();
      setDragging(null);
      addFiles(sectionId, e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const canProceed =
    files.brief.length > 0 ||
    files.context.length > 0 ||
    files.method.length > 0 ||
    files.other.length > 0;

  const fileList = (sectionId: string) => {
    const list = files[sectionId] || [];
    if (list.length === 0) return null;
    return (
      <ul className="upload-file-list">
        {list.map((entry) => (
          <UploadFileRow
            key={entry.id}
            entry={entry}
            onRemove={() => removeFile(sectionId, entry.id)}
          />
        ))}
      </ul>
    );
  };

  return (
    <div className="upload-doc-page">
      <h1>Upload Change-Related Documents</h1>
      <p className="upload-doc-desc">
        Upload change-related documents for this CIA. All uploads are used by
        the Data Extraction Agent to build context for CIMMIE and the CIA
        template.
      </p>

      <div className="upload-doc-engagement">
        <label htmlFor="engagement-name">Engagement Name</label>
        <input
          id="engagement-name"
          type="text"
          className="upload-doc-input"
          value={engagementName}
          onChange={(e) => setEngagementName(e.target.value)}
          placeholder="Enter engagement name"
        />
      </div>

      <div className="upload-doc-sections">
        {UPLOAD_SECTIONS.map(({ id, label, desc }) => {
          const inputPointerClass =
            (files[id] || []).length > 0 ? "upload-input--pass-through" : "";

          const fileInput = (
            <input
              key={`file-input-${id}`}
              id={`file-${id}`}
              type="file"
              multiple
              className={`upload-input upload-section-file-input ${inputPointerClass}`}
              onChange={(e) => {
                const input = e.target as HTMLInputElement;
                const list = input.files;
                if (list?.length) addFiles(id, list);
                setTimeout(() => {
                  input.value = "";
                }, 0);
              }}
            />
          );

          const hasFiles = (files[id] || []).length > 0;

          return (
            <div
              key={id}
              className={`card upload-doc-card${hasFiles ? " upload-doc-card--with-files" : ""}`}
            >
              <h3>{label}</h3>
              <div
                className={`upload-section-shell ${dragging === id ? "upload-section-shell--dragover" : ""}`}
                onDrop={(e) => handleDrop(e, id)}
                onDragOver={handleDragOver}
                onDragEnter={() => setDragging(id)}
                onDragLeave={() => setDragging(null)}
                role="group"
                aria-label={`${label}: drop files or use Upload attachments`}
              >
                {fileInput}
                <div className="upload-section-upload-header">
                  <p className="upload-doc-card-desc">{desc}</p>
                  <label
                    htmlFor={`file-${id}`}
                    className="upload-browse-btn upload-attachments-btn"
                  >
                    <span
                      className="upload-attachments-icon"
                      aria-hidden="true"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </span>
                    Upload attachments
                  </label>
                </div>
                {fileList(id)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="upload-doc-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canProceed}
          onClick={handleExtract}
        >
          {loading ? "Extracting…" : "Extract & Preview"}
        </button>
      </div>
    </div>
  );
}