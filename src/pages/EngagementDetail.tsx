import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MOCK_ENGAGEMENTS } from './AllCIAs';
import './EngagementDetail.css';

const LENSES = [
  { id: 'people', label: 'People', severity: 'High' as const, evidence: '12 interview responses; role redesign cited in 8.' },
  { id: 'process', label: 'Process', severity: 'High' as const, evidence: 'Workflow changes in 6 process areas; 4 SOPs affected.' },
  { id: 'technology', label: 'Technology', severity: 'Medium' as const, evidence: 'New ERP modules; 3 system integrations; training planned.' },
  { id: 'data', label: 'Data', severity: 'Medium' as const, evidence: 'Data migration and access model changes; 2 data owners identified.' },
];

const MOCK_IMPACT_RECORDS = [
  { id: '1', lens: 'People', area: 'HR Operations', impact: 'Role redesign and RACI changes', severity: 'High', source: 'Interview – HR Lead' },
  { id: '2', lens: 'People', area: 'Frontline', impact: 'Behaviour change and adoption support', severity: 'High', source: 'Interview – Ops Manager' },
  { id: '3', lens: 'Process', area: 'Finance', impact: 'Month-end and approval workflow changes', severity: 'High', source: 'Interview – Finance' },
  { id: '4', lens: 'Technology', area: 'IT', impact: 'ERP rollout and integration', severity: 'Medium', source: 'Document + Interview' },
  { id: '5', lens: 'Data', area: 'Data Governance', impact: 'Master data and access model', severity: 'Medium', source: 'Document' },
];

const MOCK_TEMPLATE_CONTENT = `Change Impact Assessment – Summary
Engagement: Finance ERP rollout
Version: 1.0 | Date: 2024

1. Executive summary
This CIA summarises the change impact of the global Finance ERP implementation across 12 countries. Impacts are assessed across People, Process, Technology, and Data lenses.

2. Scope and approach
- Scope: Finance function; Wave 1 (pilot) and Wave 2 (rollout).
- Method: Document review, stakeholder interviews (CIMMIE), and validation with Change Lead.
- Evidence: 12 interview transcripts, brief and scope, context pack.

3. Key findings (by lens)
- People: High impact. Role redesign and RACI changes in HR and frontline operations.
- Process: High impact. Six process areas and four SOPs affected; month-end and approvals.
- Technology: Medium impact. New ERP modules and three integrations; training planned.
- Data: Medium impact. Data migration and access model; two data owners identified.

4. Recommendations
- Prioritise change and training for People and Process impacts.
- Confirm data cutover and access model with Data Governance before go-live.`;

const MOCK_NARRATIVE = `CIA Summary Narrative

This Change Impact Assessment has been prepared in line with the agreed CIA structure and is based on document review and structured stakeholder interviews conducted via CIMMIE.

People: The change has high impact on people. Role redesign and updated RACI are planned for HR Operations and frontline service delivery. Twelve interview responses indicate concern about timing and readiness; adoption support and behaviour change are recurring themes. Eight respondents specifically cited role and responsibility changes.

Process: Process impact is high. Six process areas are affected, with four SOPs requiring update. Month-end close and approval workflows will change; Finance and Operations have highlighted dependency on training and access timing. Evidence is drawn from interviews and the change brief.

Technology: Technology impact is assessed as medium. New ERP modules and three system integrations are in scope. Training and access are planned; interviewees noted dependency on environment availability and data migration.

Data: Data impact is medium. Data migration and access model changes are in scope. Two data owners have been identified; evidence is from document review and one follow-up interview.

Overall, the assessment supports prioritising change and training for People and Process impacts, and confirming data cutover and access with Data Governance before go-live.`;

const MOCK_STAKEHOLDERS = [
  {
    id: 'sh1',
    name: 'Jane Smith (HR Lead)',
    transcript: `[CIMMIE] How would you describe your role in relation to this change?
[Jane Smith] I'm the HR Lead for the region. My team owns role design, RACI updates, and the people side of the ERP rollout. We're working with Finance on the new approval workflows.

[CIMMIE] What are the main process or system changes you expect in your area?
[Jane Smith] Month-end will change—new approval chains and system steps. We have four SOPs that need updating. Training is planned but we're concerned about timing with the pilot.

[CIMMIE] Who do you see as most affected by this change?
[Jane Smith] Frontline operations and service supervisors. Wave 2 is where the real role and workflow transition hits. We need adoption support and clear comms.`,
    readback: `Role: HR Lead; owns role design, RACI, and people side of ERP rollout. Process: Month-end and approval workflows changing; four SOPs to update; training planned with timing concerns. Most affected: Frontline operations and service supervisors, especially in Wave 2; adoption support and clear comms needed.`,
  },
  {
    id: 'sh2',
    name: 'David Chen (Finance)',
    transcript: `[CIMMIE] How would you describe your role in relation to this change?
[David Chen] I'm in Finance, responsible for the month-end close process and the new ERP integration in our stream.

[CIMMIE] What are the main process or system changes you expect?
[David Chen] The new ERP modules replace our legacy reporting. We have three integrations going live. Access and data migration are the big unknowns—we're dependent on IT and Data Governance.

[CIMMIE] Any concerns about timing or readiness?
[David Chen] Yes—environment availability and cutover dates. We need the read-only environment earlier for training.`,
    readback: `Role: Finance; month-end close and ERP integration. Process/Technology: New ERP modules replacing legacy reporting; three integrations; dependency on IT and Data Governance for access and data migration. Concerns: Environment availability and cutover; need read-only environment earlier for training.`,
  },
  {
    id: 'sh3',
    name: 'Maria Garcia (Ops Manager)',
    transcript: `[CIMMIE] How would you describe your role in relation to this change?
[Maria Garcia] I'm an Ops Manager. My team will use the new system for daily transactions and approvals.

[CIMMIE] What level of disruption do you anticipate?
[Maria Garcia] High for the first few months. Behaviour change and adoption are the main challenges. We need hands-on training and quick reference guides.

[CIMMIE] Which teams are most affected?
[Maria Garcia] Frontline and service supervisors. Role and workflow redesign in Wave 2 is the biggest impact.`,
    readback: `Role: Ops Manager; team will use new system for transactions and approvals. Disruption: High for first few months; behaviour change and adoption are main challenges; need hands-on training and quick reference guides. Most affected: Frontline and service supervisors; Wave 2 role and workflow redesign.`,
  },
];

export default function EngagementDetail() {
  const { engagementId } = useParams<{ engagementId: string }>();
  const engagement = engagementId
    ? MOCK_ENGAGEMENTS.find((e) => e.id === engagementId)
    : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [narrative, setNarrative] = useState(MOCK_NARRATIVE);
  const [selectedStakeholderId, setSelectedStakeholderId] = useState<string>('');

  const selectedStakeholder = selectedStakeholderId
    ? MOCK_STAKEHOLDERS.find((s) => s.id === selectedStakeholderId)
    : null;

  const handleDownloadTemplate = () => {
    const blob = new Blob([MOCK_TEMPLATE_CONTENT], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CIA-Template-${engagement?.title?.replace(/\s+/g, '-') || 'engagement'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePublish = () => {
    setIsPublished(true);
    setIsEditing(false);
  };

  if (!engagement) {
    return (
      <div className="engagement-detail-page">
        <p className="engagement-detail-not-found">Engagement not found.</p>
        <Link to="/all-cias" className="btn btn-outline">
          Back to All CIAs
        </Link>
      </div>
    );
  }

  return (
    <div className="engagement-detail-page">
      <Link to="/all-cias" className="engagement-detail-back">
        ← Back to All CIAs
      </Link>

      <div className="engagement-detail card">
        <h1 className="engagement-detail-title">{engagement.title}</h1>
        <p className="engagement-detail-summary">{engagement.summary}</p>
        <div className="engagement-detail-meta">
          <span className="engagement-detail-id">Engagement ID: {engagement.id}</span>
        </div>

        <div className="engagement-detail-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setIsEditing((e) => !e)}
            disabled={isPublished}
          >
            {isEditing ? 'Lock' : 'Edit'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePublish}
            disabled={isPublished}
          >
            {isPublished ? 'Published' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Section A – Lens-Based Impact Summary */}
      <section className="engagement-section card" aria-labelledby="section-lens-heading">
        <h2 id="section-lens-heading" className="engagement-section-title">
          Lens-Based Impact Summary
        </h2>
        <div className="lens-grid">
          {LENSES.map((lens) => (
            <div key={lens.id} className="lens-card card">
              <h3 className="lens-label">{lens.label}</h3>
              <span className={`badge severity-${lens.severity.toLowerCase()}`}>
                {lens.severity}
              </span>
              {lens.evidence && (
                <p className="lens-evidence">{lens.evidence}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Section B – Populated CIA Template */}
      <section className="engagement-section card" aria-labelledby="section-template-heading">
        <h2 id="section-template-heading" className="engagement-section-title">
          Populated CIA Template
        </h2>
        <pre className="engagement-template-content">{MOCK_TEMPLATE_CONTENT}</pre>
        <div className="engagement-section-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownloadTemplate}
          >
            Download Template
          </button>
        </div>
      </section>

      {/* Section C – Structured Impact Records */}
      <section className="engagement-section card" aria-labelledby="section-records-heading">
        <h2 id="section-records-heading" className="engagement-section-title">
          Structured Impact Records
        </h2>
        <div className="engagement-table-wrap">
          <table className="engagement-table">
            <thead>
              <tr>
                <th>Lens</th>
                <th>Area</th>
                <th>Impact</th>
                <th>Severity</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_IMPACT_RECORDS.map((row) => (
                <tr key={row.id}>
                  <td>{row.lens}</td>
                  <td>{row.area}</td>
                  <td>{row.impact}</td>
                  <td>
                    <span className={`badge severity-${row.severity.toLowerCase()}`}>
                      {row.severity}
                    </span>
                  </td>
                  <td>{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section D – CIA Summary Narrative */}
      <section className="engagement-section card" aria-labelledby="section-narrative-heading">
        <h2 id="section-narrative-heading" className="engagement-section-title">
          CIA Summary Narrative
        </h2>
        {isEditing ? (
          <textarea
            className="engagement-narrative engagement-narrative-input"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={14}
          />
        ) : (
          <div className="engagement-narrative engagement-narrative-readonly">
            {narrative}
          </div>
        )}
      </section>

      {/* Post-Publish – Interview Records */}
      {isPublished && (
        <section className="engagement-section card" aria-labelledby="section-interviews-heading">
          <h2 id="section-interviews-heading" className="engagement-section-title">
            Interview Records
          </h2>
          <label htmlFor="interview-stakeholder-select" className="interview-records-label">
            Stakeholder
          </label>
          <select
            id="interview-stakeholder-select"
            className="interview-records-select"
            value={selectedStakeholderId}
            onChange={(e) => setSelectedStakeholderId(e.target.value)}
          >
            <option value="">Select a stakeholder</option>
            {MOCK_STAKEHOLDERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {selectedStakeholder && (
            <div className="interview-records-panels">
              <div className="interview-records-block">
                <h3 className="interview-records-subtitle">Full interview transcript</h3>
                <div className="interview-records-scroll">
                  {selectedStakeholder.transcript}
                </div>
              </div>
              <div className="interview-records-block">
                <h3 className="interview-records-subtitle">Read-back summary</h3>
                <div className="interview-records-scroll">
                  {selectedStakeholder.readback}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
