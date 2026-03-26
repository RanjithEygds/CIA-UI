import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import PptxGenJS from 'pptxgenjs';
import { MOCK_ENGAGEMENTS } from './AllCIAs';
import ChangeImpactHeatmap, { HEATMAP_IMPACT_KEYS, HEATMAP_MATRIX_DATA } from './ChangeImpactHeatmap';
import StakeholderInterviewGrid from '../components/StakeholderInterviewGrid';
import { isLikelyEngagementUuid } from '../api/interviews';
import './EngagementDetail.css';

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

  const [isPublished, setIsPublished] = useState(false);
  const [selectedStakeholderId, setSelectedStakeholderId] = useState<string>('');

  const selectedStakeholder = selectedStakeholderId
    ? MOCK_STAKEHOLDERS.find((s) => s.id === selectedStakeholderId)
    : null;

  const handlePublish = () => {
    setIsPublished(true);
  };

  // PPT colors mapped to values 0-3 (kept aligned to provided export logic)
  const getPptFill = (value: number) => {
    switch (value) {
      case 0:
        return 'DBEAFE'; // Lightest Blue - No Change
      case 1:
        return '93C5FD'; // Light Blue - Low
      case 2:
        return '3B82F6'; // Medium Blue - Medium
      case 3:
        return '1E40AF'; // Dark Blue (Nav Blue) - High
      default: return 'FFFFFF';
    }
  };

  // Export function
  const exportHeatmapPPT = (
    matrixData: typeof HEATMAP_MATRIX_DATA,
    impactKeys: typeof HEATMAP_IMPACT_KEYS,
  ) => {
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();

    slide.addText('Change Impact Heatmap', {
      x: 0.5,
      y: 0.3,
      fontSize: 20,
      bold: true,
    });

    const tableRows = [
      [
        { text: 'Function', options: { bold: true, align: 'center' as const } },
        ...impactKeys.map((key) => ({
          text: key,
          options: { bold: true, align: 'center' as const },
        })),
      ],
      ...matrixData.map((row) => [
        { text: row.function, options: { bold: true } },
        ...impactKeys.map((key) => ({
          text: row[key].toString(),
          options: {
            fill: { color: getPptFill(row[key]) },
            bold: true,
            align: 'center' as const,
            color: '000000',
          },
        })),
      ]),
    ];

    slide.addTable(tableRows, {
      x: 0.5,
      y: 1.0,
      w: 9,
      rowH: 0.5,
      fontSize: 12,
      border: { type: 'solid', color: 'D1D5DB' },
    });

    void pptx.writeFile({ fileName: 'CIA_Heatmap_Export.pptx' });
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
            className="btn btn-primary"
            onClick={handlePublish}
            disabled={isPublished}
          >
            {isPublished ? 'Published' : 'Publish'}
          </button>
        </div>
      </div>

      {(engagement.id === '1' || isLikelyEngagementUuid(engagement.id)) && (
        <StakeholderInterviewGrid
          engagementId={engagement.id}
          useDemoData={engagement.id === '1'}
          returnPath={`/all-cias/${engagement.id}`}
        />
      )}

      {engagement.id === '1' && (
        <>
          <div className="engagement-heatmap-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => exportHeatmapPPT(HEATMAP_MATRIX_DATA, HEATMAP_IMPACT_KEYS)}
            >
              Export Heatmap to PPT
            </button>
          </div>
          <ChangeImpactHeatmap />
        </>
      )}

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