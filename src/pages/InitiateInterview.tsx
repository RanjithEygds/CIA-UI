import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './InitiateInterview.css';

import {
  createEngagement,
  getEngagementSummary,
  uploadDocuments,
} from "../api/engagements";

const UPLOAD_SECTIONS = [
  { id: 'brief', label: 'Brief & Scope', desc: 'Programme objectives, case for change, timeline/waves, known constraints' },
  { id: 'context', label: 'Context Pack', desc: 'Org charts, role lists, process maps, programme materials, project uploads' },
  { id: 'method', label: 'Method & Templates', desc: 'CIA structure/sections and CIA template workbook' },
  { id: 'stakeholder', label: 'Stakeholder List & Interview Plan', desc: 'Who, when, and intended depth (high-level vs detailed)' },
];

type FilesBySection = Record<string, File[]>;

export default function InitiateInterview() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<Record<string, File[]>>({
    brief: [],
    context: [],
    method: [],
    stakeholder: [],
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const [engagementName, setEngagementName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({
    brief: null,
    context: null,
    method: null,
    stakeholder: null,
  });

  const addFiles = useCallback((sectionId: string, newFiles: FileList | null) => {
    if (!newFiles?.length) return;

    const accepted = Array.from(newFiles);

    // Optional: Add some lightweight validation (size, type)
    const MAX_MB = 50; // adjust for your env
    const tooBig = accepted.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) {
      alert(`"${tooBig.name}" exceeds ${MAX_MB}MB limit.`);
      return;
    }

    setFiles((prev) => ({
      ...prev,
      [sectionId]: [...prev[sectionId], ...accepted],
    }));
  }, []);

  // Remove single file
  const removeFile = useCallback((sectionId: string, index: number) => {
    setFiles((prev) => ({
      ...prev,
      [sectionId]: prev[sectionId].filter((_, i) => i !== index),
    }));
  }, []);

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

      manifestBySection[section] = (sectionFiles || []).map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: (f as any).lastModified,
      }));
    }

    return { countsBySection, totalCount, manifestBySection };
  }

  async function handleExtract() {
    try {
      setLoading(true);
      setError(null);

      // --- Step 1: Create engagement ---
      const { engagement_id } = await createEngagement(engagementName || undefined);

      // Save for next pages
      sessionStorage.setItem("ciassist_engagement_id", engagement_id);
      sessionStorage.setItem("ciassist_engagement_name", engagementName || "");

      // --- Step 2: Prepare all files ---
      const filesBySection = files as FilesBySection;
      const allFiles: File[] = Object.values(filesBySection).flat();

      if (allFiles.length === 0) {
        throw new Error("No files to upload.");
      }

      const { countsBySection, totalCount, manifestBySection } = computeFileStats(filesBySection);
      sessionStorage.setItem("ciassist_file_counts_by_section", JSON.stringify(countsBySection));
      sessionStorage.setItem("ciassist_file_manifest_by_section", JSON.stringify(manifestBySection));
      sessionStorage.setItem("ciassist_total_files", String(totalCount));

      // --- Step 3: Upload all files (one request per file) ---
      const indexOfFile = (file: File) => {
        // Create stable index across sections for the progress map
        let idx = 0;
        for (const sec of Object.keys(filesBySection)) {
          for (const f of filesBySection[sec]) {
            if (f === file) return idx;
            idx++;
          }
        }
        return idx;
      };

      const inferCategory = (file: File): string | undefined => {
        for (const [section, list] of Object.entries(filesBySection)) {
          if (list.includes(file)) return section;
        }
        return undefined;
      };

      await uploadDocuments(engagement_id, allFiles, {
        inferCategory
      });

      // --- Step 4: Optionally fetch summary (for preview) ---
      const summary = await getEngagementSummary(engagement_id);
      sessionStorage.setItem("ciassist_engagement_summary", JSON.stringify(summary));

      // --- Step 5: Navigate to preview ---
      navigate("/preview", { state: { engagementId: engagement_id } });
    } catch (e: any) {
      console.error(e);
      if (e?.name === "AbortError") {
        setError("Upload cancelled.");
      } else {
        setError(e?.message || "Upload failed");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    setDragging(null);
    addFiles(sectionId, e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const canProceed = files.brief.length > 0 || files.context.length > 0 || files.method.length > 0 || files.stakeholder.length > 0;


  return (
    <div className="initiate-page">
      <h1>Upload Change-Related Documents</h1>
      <p className="page-desc">
        Upload change-related documents for this CIA. All uploads are used by the Data Extraction Agent to build context for CIMMIE and the CIA template.
      </p>

      <div className="initiate-engagement">
        <label htmlFor="engagement-name">Engagement Name</label>
        <input
          id="engagement-name"
          type="text"
          className="initiate-input"
          value={engagementName}
          onChange={(e) => setEngagementName(e.target.value)}
          placeholder="Enter engagement name"
          disabled={loading}
        />
      </div>

      <div className="upload-sections">
        {UPLOAD_SECTIONS.map(({ id, label, desc }) => (
          <div key={id} className="card upload-section">
            <h3>{label}</h3>
            <p className="upload-section-desc">{desc}</p>
            <div
              className={`upload-zone ${dragging === id ? 'dragover' : ''}`}
              onDrop={(e) => handleDrop(e, id)}
              onDragOver={handleDragOver}
              onDragEnter={() => setDragging(id)}
              onDragLeave={() => setDragging(null)}
              onClick={() => document.getElementById(`file-${id}`)?.click()}
            >
              <input
                key={`file-input-${id}`}
                ref={(el) => {
                  inputRefs.current[id] = el;
                }}
                id={`file-${id}`}
                type="file"
                multiple
                className="upload-input"
                onChange={(e) => {
                  addFiles(id, e.target.files);
                  if (inputRefs.current[id]) inputRefs.current[id]!.value = "";
                }}
                disabled={loading}
              />
              <p>Drop files here or click to browse</p>
            </div>
            {files[id]?.length > 0 && (
              <ul className="file-list">
                {files[id].map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <span>{f.name}</span>
                    <button type="button" className="btn btn-ghost file-remove" onClick={(e) => { e.stopPropagation(); removeFile(id, i); }}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="initiate-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canProceed}
          onClick={handleExtract}
        >
          {loading ? "Uploading…": "Extract & preview"} 
        </button>
      </div>
    </div>
  );
}
