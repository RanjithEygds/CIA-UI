import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './InitiateInterview.css';

const UPLOAD_SECTIONS = [
  { id: 'brief', label: 'Brief & Scope', desc: 'Programme objectives, case for change, timeline/waves, known constraints' },
  { id: 'context', label: 'Context Pack', desc: 'Org charts, role lists, process maps, programme materials, project uploads' },
  { id: 'method', label: 'Method & Templates', desc: 'CIA structure/sections, CIA Questionnaire and CIA template workbook' },
  { id: 'stakeholder', label: 'Stakeholder List & Interview Plan', desc: 'Who, when, and intended depth (high-level vs detailed)' },
];

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

  const addFiles = useCallback((sectionId: string, newFiles: FileList | null) => {
    if (!newFiles?.length) return;
    setFiles((prev) => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] || []), ...Array.from(newFiles)],
    }));
  }, []);

  const removeFile = useCallback((sectionId: string, index: number) => {
    setFiles((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).filter((_, i) => i !== index),
    }));
  }, []);

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

  function handleExtract() {
    sessionStorage.setItem('ciassist_upload_sections', JSON.stringify(
      Object.fromEntries(
        Object.entries(files).map(([k, v]) => [k, v.map(f => ({ name: f.name, size: f.size }))])
      )
    ));
    navigate('/preview');
  }

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
            >
              <input
                key={`file-input-${id}`}
                id={`file-${id}`}
                type="file"
                multiple
                className="upload-input"
                onChange={(e) => {
                  const input = e.target as HTMLInputElement;
                  const list = input.files;
                  if (list?.length) addFiles(id, list);
                  setTimeout(() => { input.value = ''; }, 0);
                }}
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
          Extract & preview
        </button>
      </div>
    </div>
  );
}
