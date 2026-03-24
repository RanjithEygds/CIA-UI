import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./UploadDocument.css";
import {
  createEngagement,
  getEngagementSummary,
  uploadDocuments,
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
  {
    id: "method",
    label: "Method & Templates",
    desc: "CIA structure/sections, CIA Questionnaire and CIA template workbook",
  },
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
  | "text"
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
  if (ext === "txt" || ext === "csv")
    return { kind: "text", label: ext === "csv" ? "CSV" : "TXT" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return { kind: "image", label: "IMG" };
  if (["zip", "rar", "7z", "gz", "tar"].includes(ext))
    return { kind: "zip", label: "ZIP" };
  return { kind: "generic", label: "FILE" };
}

function UploadFileRow({
  entry,
  onRemove,
}: {
  entry: UploadEntry;
  onRemove: () => void;
}) {
  const { kind, label } = getFileKind(entry.file);
  return (
    <li className={`upload-file-row upload-file-row--${entry.status}`}>
      <span
        className={`upload-file-type-badge upload-file-type-badge--${kind}`}
      >
        {label}
      </span>
      <div className="upload-file-row-main">
        <div className="upload-file-row-title">
          <span className="upload-file-name" title={entry.file.name}>
            {entry.file.name}
          </span>
          <span className="upload-file-meta">
            {formatBytes(entry.file.size)}
          </span>
        </div>
        {entry.status === "uploading" && (
          <div className="upload-file-progress-wrap">
            <div
              className="upload-file-progress-track"
              role="progressbar"
              aria-valuenow={entry.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="upload-file-progress-fill"
                style={{ width: `${entry.progress}%` }}
              />
            </div>
            <span className="upload-file-progress-pct">{entry.progress}%</span>
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
        {entry.status === "uploading" && (
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
  const uploadTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );

  useEffect(
    () => () => {
      uploadTimersRef.current.forEach((t) => clearInterval(t));
      uploadTimersRef.current.clear();
    },
    [],
  );

  function simulateUpload(entryId: string, sectionId: string): Promise<void> {
    return new Promise((resolve) => {
      let progress = 0;

      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 15) + 5; // bump 5–20%

        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);

          // ✅ Mark file as complete
          setFiles((prev: FilesBySection) => {
            const updatedSection = prev[sectionId].map((e) =>
              e.id === entryId
                ? {
                    ...e,
                    progress: 100,
                    status: "success" as UploadStatus, // ✅ fixing type
                  }
                : e,
            );

            return { ...prev, [sectionId]: updatedSection };
          });

          resolve();
        } else {
          // ✅ Update progress
          setFiles((prev: FilesBySection) => {
            const updatedSection = prev[sectionId].map((e) =>
              e.id === entryId
                ? {
                    ...e,
                    progress,
                    status: "uploading" as UploadStatus, // ✅ ensure correct type
                  }
                : e,
            );

            return { ...prev, [sectionId]: updatedSection };
          });
        }
      }, 120);
    });
  }

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
      const allFiles: File[] = allEntries.map((e) => e.file);

      if (allFiles.length === 0) {
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

      // ✅ Simulate progress for each selected file
      for (const entry of allEntries) {
        const sectionId = inferCategory(entry.file)!;
        setFiles((prev) => {
          const updated = { ...prev };
          updated[sectionId] = updated[sectionId].map((e) =>
            e.id === entry.id
              ? { ...e, status: "uploading" as UploadStatus }
              : e,
          );
          return updated;
        });
        await simulateUpload(entry.id, sectionId);
      }

      // ✅ Upload files for real (but without per-file progress)
      await uploadDocuments(engagement_id, allFiles, {
        inferCategory,
      });

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

          return (
            <div key={id} className="card upload-doc-card">
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
          {loading ? "Extracting…" : "Extract & preview"}
        </button>
      </div>
    </div>
  );
}
