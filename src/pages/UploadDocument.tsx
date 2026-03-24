import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './UploadDocument.css';

const UPLOAD_SECTIONS = [
  { id: 'brief', label: 'Brief & Scope', desc: 'Programme objectives, case for change, timeline/waves, known constraints' },
  { id: 'context', label: 'Context Pack', desc: 'Org charts, role lists, process maps, programme materials, project uploads' },
  { id: 'method', label: 'Method & Templates', desc: 'CIA structure/sections, CIA Questionnaire and CIA template workbook' },
  { id: 'other', label: 'Other Documents', desc: 'Any additional change-related documents not covered above' },
] as const;

type UploadStatus = 'uploading' | 'success' | 'error';

type UploadEntry = {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  errorMessage?: string;
};

function newEntryId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(i > 0 ? 1 : 0))} ${sizes[i]}`;
}

type FileKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'text' | 'image' | 'zip' | 'generic';

function getFileKind(file: File): { kind: FileKind; label: string } {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';

  if (ext === 'pdf') return { kind: 'pdf', label: 'PDF' };
  if (ext === 'docx' || ext === 'doc') return { kind: 'docx', label: ext === 'doc' ? 'DOC' : 'DOCX' };
  if (ext === 'xlsx' || ext === 'xls') return { kind: 'xlsx', label: ext === 'xls' ? 'XLS' : 'XLSX' };
  if (ext === 'pptx' || ext === 'ppt') return { kind: 'pptx', label: ext === 'ppt' ? 'PPT' : 'PPTX' };
  if (ext === 'txt' || ext === 'csv') return { kind: 'text', label: ext === 'csv' ? 'CSV' : 'TXT' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return { kind: 'image', label: 'IMG' };
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return { kind: 'zip', label: 'ZIP' };
  return { kind: 'generic', label: 'FILE' };
}

/** Simulate failure for demos: include `__fail__` in the filename. */
function shouldSimulateFailure(file: File): boolean {
  return file.name.includes('__fail__');
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
      <span className={`upload-file-type-badge upload-file-type-badge--${kind}`}>{label}</span>
      <div className="upload-file-row-main">
        <div className="upload-file-row-title">
          <span className="upload-file-name" title={entry.file.name}>
            {entry.file.name}
          </span>
          <span className="upload-file-meta">{formatBytes(entry.file.size)}</span>
        </div>
        {entry.status === 'uploading' && (
          <div className="upload-file-progress-wrap">
            <div className="upload-file-progress-track" role="progressbar" aria-valuenow={entry.progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="upload-file-progress-fill" style={{ width: `${entry.progress}%` }} />
            </div>
            <span className="upload-file-progress-pct">{entry.progress}%</span>
          </div>
        )}
        {entry.status === 'error' && (
          <p className="upload-file-error" role="alert">
            {entry.errorMessage ?? 'Upload failed.'}
          </p>
        )}
      </div>
      <div className="upload-file-row-status">
        {entry.status === 'success' && (
          <span className="upload-file-success-icon" title="Uploaded" aria-label="Upload complete">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        {entry.status === 'uploading' && <span className="upload-file-status-placeholder" aria-hidden="true" />}
        <button type="button" className="btn btn-ghost file-remove" onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

export default function UploadDocument() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<Record<string, UploadEntry[]>>({
    brief: [],
    context: [],
    method: [],
    other: [],
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const [engagementName, setEngagementName] = useState('');
  const uploadTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const clearUploadTimer = useCallback((entryId: string) => {
    const t = uploadTimersRef.current.get(entryId);
    if (t !== undefined) {
      clearInterval(t);
      uploadTimersRef.current.delete(entryId);
    }
  }, []);

  useEffect(
    () => () => {
      uploadTimersRef.current.forEach((t) => clearInterval(t));
      uploadTimersRef.current.clear();
    },
    []
  );

  const startSimulatedUpload = useCallback(
    (sectionId: string, entryId: string, fail: boolean) => {
      clearUploadTimer(entryId);
      const tickMs = 90;
      const interval = setInterval(() => {
        setFiles((prev) => {
          const list = prev[sectionId];
          const idx = list.findIndex((e) => e.id === entryId);
          if (idx < 0) {
            clearInterval(interval);
            uploadTimersRef.current.delete(entryId);
            return prev;
          }
          const e = list[idx];
          if (e.status !== 'uploading') {
            clearInterval(interval);
            uploadTimersRef.current.delete(entryId);
            return prev;
          }
          const bump = 4 + Math.floor(Math.random() * 9);
          const nextProgress = Math.min(100, e.progress + bump);
          const nextList = [...list];
          if (nextProgress >= 100) {
            clearInterval(interval);
            uploadTimersRef.current.delete(entryId);
            if (fail) {
              nextList[idx] = {
                ...e,
                progress: 0,
                status: 'error',
                errorMessage: 'Upload failed. Try again or use a different file.',
              };
            } else {
              nextList[idx] = { ...e, progress: 100, status: 'success' };
            }
          } else {
            nextList[idx] = { ...e, progress: nextProgress };
          }
          return { ...prev, [sectionId]: nextList };
        });
      }, tickMs);
      uploadTimersRef.current.set(entryId, interval);
    },
    [clearUploadTimer]
  );

  const addFiles = useCallback(
    (sectionId: string, newFiles: FileList | null) => {
      if (!newFiles?.length) return;
      const added: UploadEntry[] = Array.from(newFiles).map((file) => ({
        id: newEntryId(),
        file,
        progress: 0,
        status: 'uploading' as const,
      }));
      setFiles((prev) => ({
        ...prev,
        [sectionId]: [...(prev[sectionId] || []), ...added],
      }));
      added.forEach((entry) => {
        startSimulatedUpload(sectionId, entry.id, shouldSimulateFailure(entry.file));
      });
    },
    [startSimulatedUpload]
  );

  const removeFile = useCallback(
    (sectionId: string, entryId: string) => {
      clearUploadTimer(entryId);
      setFiles((prev) => ({
        ...prev,
        [sectionId]: (prev[sectionId] || []).filter((e) => e.id !== entryId),
      }));
    },
    [clearUploadTimer]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, sectionId: string) => {
      e.preventDefault();
      setDragging(null);
      addFiles(sectionId, e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const canProceed =
    files.brief.length > 0 ||
    files.context.length > 0 ||
    files.method.length > 0 ||
    files.other.length > 0;

  function handleExtract() {
    sessionStorage.setItem(
      'ciassist_upload_sections',
      JSON.stringify(
        Object.fromEntries(
          Object.entries(files).map(([k, v]) => [k, v.map((e) => ({ name: e.file.name, size: e.file.size }))])
        )
      )
    );
    navigate('/preview');
  }

  const fileList = (sectionId: string) => {
    const list = files[sectionId] || [];
    if (list.length === 0) return null;
    return (
      <ul className="upload-file-list">
        {list.map((entry) => (
          <UploadFileRow key={entry.id} entry={entry} onRemove={() => removeFile(sectionId, entry.id)} />
        ))}
      </ul>
    );
  };

  return (
    <div className="upload-doc-page">
      <h1>Upload Change-Related Documents</h1>
      <p className="upload-doc-desc">
        Upload change-related documents for this CIA. All uploads are used by the Data Extraction Agent to build context for CIMMIE and the CIA template.
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
          const inputPointerClass = (files[id] || []).length > 0 ? 'upload-input--pass-through' : '';

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
                  input.value = '';
                }, 0);
              }}
            />
          );

          return (
            <div key={id} className="card upload-doc-card">
              <h3>{label}</h3>
              <div
                className={`upload-section-shell ${dragging === id ? 'upload-section-shell--dragover' : ''}`}
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
                  <label htmlFor={`file-${id}`} className="upload-browse-btn upload-attachments-btn">
                    <span className="upload-attachments-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <button type="button" className="btn btn-primary" disabled={!canProceed} onClick={handleExtract}>
          Extract & preview
        </button>
      </div>
    </div>
  );
}
