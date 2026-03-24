import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import { MOCK_ENGAGEMENTS } from './AllCIAs';
import ChangeImpactHeatmap, { HEATMAP_IMPACT_KEYS, HEATMAP_MATRIX_DATA } from './ChangeImpactHeatmap';
import './EngagementDetail.css';

const LENSES = [
  { id: 'people', label: 'People', severity: 'High' as const, evidence: '12 interview responses; role redesign cited in 8.' },
  { id: 'process', label: 'Process', severity: 'High' as const, evidence: 'Workflow changes in 6 process areas; 4 SOPs affected.' },
  { id: 'technology', label: 'Technology', severity: 'Medium' as const, evidence: 'New ERP modules; 3 system integrations; training planned.' },
  { id: 'data', label: 'Organisation', severity: 'Medium' as const, evidence: 'Data migration and access model changes; 2 data owners identified.' },
];

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
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<Record<string, string>[]>([]);
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});

  const selectedStakeholder = selectedStakeholderId
    ? MOCK_STAKEHOLDERS.find((s) => s.id === selectedStakeholderId)
    : null;
  const interviewColumns = useMemo(
    () =>
      excelColumns.filter((column, index) => {
        const columnNumber = index + 1;
        const isRemovedRange = columnNumber >= 27 && columnNumber <= 49;
        const isRemovedColumn = columnNumber === 16 || columnNumber === 26;
        const isInterviewee = column.trim().toLowerCase() === 'interviewee';
        return !isRemovedRange && !isRemovedColumn && !isInterviewee;
      }),
    [excelColumns],
  );
  const allExpanded = useMemo(
    () => interviewColumns.length > 0 && interviewColumns.every((column) => expandedColumns[column]),
    [interviewColumns, expandedColumns],
  );
  const questionsByColumn = useMemo(() => {
    return interviewColumns.reduce<Record<string, string[]>>((acc, column) => {
      const isWrapUpColumn = column.trim().toLowerCase() === 'wrap up and validation';
      acc[column] = excelRows.flatMap((row) => {
        const rawQuestion = (row[column] ?? '').trim();
        if (!rawQuestion) return [];

        const lineParts = rawQuestion
          .split(/\r?\n+/)
          .map((part) => part.replace(/\s+/g, ' ').trim())
          .filter((part) => part.length > 0);

        if (!isWrapUpColumn) return lineParts;

        return lineParts.flatMap((part) => {
          const bulletSplit = part
            .split(/\s*•\s*/g)
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);

          return bulletSplit.flatMap((entry) => {
            const questionMatches = entry.match(/[^?]+\?/g)?.map((match) => match.trim()) ?? [];
            if (questionMatches.length > 1) {
              const remainder = entry.replace(questionMatches.join(' '), '').trim();
              return remainder ? [...questionMatches, remainder] : questionMatches;
            }

            return entry
              .split(/(?<=\?)\s+(?=(What|Who|Which|When|How|Where|Why|Do|Does|Is|Are|Can|Will|Would|Could|Should)\b)/g)
              .map((item) => item.trim())
              .filter((item) => item.length > 0 && !/^(What|Who|Which|When|How|Where|Why|Do|Does|Is|Are|Can|Will|Would|Could|Should)$/i.test(item));
          });
        });
      });
      return acc;
    }, {});
  }, [interviewColumns, excelRows]);

  useEffect(() => {
    let isMounted = true;

    const loadExcel = async () => {
      try {
        const response = await fetch('/CIA Stakeholder Interview Questions and Guide.xlsx');
        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) return;

        const worksheet = workbook.Sheets[firstSheetName];
        const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
          header: 1,
          defval: '',
        });

        if (!matrix.length) return;

        const headerRow = (matrix[0] || []).map((value, index) => {
          const header = String(value ?? '').trim();
          return header || `Column ${index + 1}`;
        });

        const rows = matrix.slice(1).map((row) => {
          const record: Record<string, string> = {};
          headerRow.forEach((header, columnIndex) => {
            const value = row[columnIndex];
            record[header] = value == null ? '' : String(value);
          });
          return record;
        });

        if (!isMounted) return;
        setExcelColumns(headerRow);
        setExcelRows(rows);
        setExpandedColumns(
          headerRow.reduce<Record<string, boolean>>((acc, column) => {
            acc[column] = false;
            return acc;
          }, {}),
        );
      } catch (error) {
        if (!isMounted) return;
        setExcelColumns([]);
        setExcelRows([]);
        setExpandedColumns({});
      }
    };

    loadExcel();

    return () => {
      isMounted = false;
    };
  }, []);

  const handlePublish = () => {
    setIsPublished(true);
  };

  const handleExport = () => {
    if (!interviewColumns.length) return;

    const sheetData = [
      interviewColumns,
      ...excelRows.map((row) => interviewColumns.map((column) => row[column] ?? '')),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Interview Questions');
    XLSX.writeFile(workbook, 'CIA Stakeholder Interview Questions and Guide Export.xlsx');
  };

  const toggleColumn = (column: string) => {
    setExpandedColumns((prev) => ({
      ...prev,
      [column]: !prev[column],
    }));
  };

  const toggleAllColumns = () => {
    setExpandedColumns((prev) =>
      interviewColumns.reduce<Record<string, boolean>>((acc, column) => {
        acc[column] = !allExpanded;
        return acc;
      }, { ...prev }),
    );
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

      {engagement.id === '1' && (
        <section className="engagement-section card interview-grid-card" aria-labelledby="section-interview-grid-heading">
          <div className="interview-grid-header-row">
            <h2 id="section-interview-grid-heading" className="engagement-section-title">
              Stakeholder Interview Questions Grid
            </h2>
            <button
              type="button"
              className="btn btn-outline"
              onClick={toggleAllColumns}
              disabled={!interviewColumns.length}
            >
              {allExpanded ? 'Collapse' : 'Expand Full'}
            </button>
          </div>

          <div className="interview-grid-columns-wrap">
            {interviewColumns.map((column) => {
              const isExpanded = !!expandedColumns[column];
              const questions = questionsByColumn[column] ?? [];
              return (
                <div key={column} className="interview-grid-column">
                  <button
                    type="button"
                    className="interview-grid-column-header"
                    onClick={() => toggleColumn(column)}
                    aria-expanded={isExpanded}
                  >
                    <span>{column}</span>
                    <span className="interview-grid-chevron" aria-hidden="true">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="interview-grid-column-body">
                      <ul className="interview-question-list">
                        {questions.map((question, index) => (
                          <li key={`${column}-q-${index}`} className="interview-question-item">
                            <p className="interview-question-text">{question}</p>
                            <label className="interview-answer-label">
                              Answer:
                              <textarea
                                className="interview-answer-input"
                                placeholder="Enter answer..."
                                rows={3}
                              />
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="interview-grid-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExport}
              disabled={!excelRows.length}
            >
              Export
            </button>
          </div>
        </section>
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
