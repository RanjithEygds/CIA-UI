import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";
import {
  getEngagementHeatmap,
  getEngagementContext,
  getEngagementTranscripts,
  type EngagementDoc,
  type HeatmapRow,
} from "../api/engagements";
import ChangeImpactHeatmap, {
  HEATMAP_IMPACT_KEYS,
} from "./ChangeImpactHeatmap";
import StakeholderInterviewGrid from "../components/StakeholderInterviewGrid";

import { getEngagementSummary } from "../api/engagements";

import { isLikelyEngagementUuid } from "../api/interviews";
import "./EngagementDetail.css";

type TranscriptExportRow = {
  InterviewID: string;
  StakeholderName: string;
  StakeholderEmail: string;
  Section: string;
  Question: string;
  Answer: string;
};

export default function EngagementDetail() {
  const { engagementId } = useParams<{ engagementId: string }>();

  const [loading, setLoading] = useState(true);
  const [heatmap, setHeatmap] = useState<HeatmapRow[] | null>(null);

  // Engagement details
  const [engagement, setEngagement] = useState<{
    id: string;
    title: string;
    summary: string;
  } | null>(null);
  const [documents, setDocuments] = useState<EngagementDoc[]>([]);
  const [contextBrief, setContextBrief] = useState("");
  const [contextSummary, setContextSummary] = useState<string[]>([]);

  const normalizeSummaryPoints = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value
        .map((point) => String(point ?? "").trim())
        .filter(Boolean);
    }
    if (typeof value === "string") {
      const clean = value.trim();
      return clean ? [clean] : [];
    }
    return [];
  };

  // PPT Colors for heatmap (unchanged)
  const getPptFill = (value: number) => {
    switch (value) {
      case 0:
        return "DBEAFE";
      case 1:
        return "93C5FD";
      case 2:
        return "3B82F6";
      case 3:
        return "1E40AF";
      default:
        return "FFFFFF";
    }
  };

  // Export Heatmap to PPT (unchanged)
  const exportHeatmapPPT = (
    matrixData: HeatmapRow[],
    impactKeys: typeof HEATMAP_IMPACT_KEYS,
  ) => {
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();

    slide.addText("Change Impact Heatmap", {
      x: 0.5,
      y: 0.3,
      fontSize: 20,
      bold: true,
    });

    const tableRows = [
      [
        { text: "Function", options: { bold: true, align: "center" as const } },
        ...impactKeys.map((key) => ({
          text: key,
          options: { bold: true, align: "center" as const },
        })),
      ],
      ...matrixData.map((row) => [
        { text: row.function, options: { bold: true } },
        ...impactKeys.map((key) => ({
          text: row[key].toString(),
          options: {
            fill: { color: getPptFill(row[key]) },
            bold: true,
            align: "center" as const,
            color: "000000",
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
      border: { type: "solid", color: "D1D5DB" },
    });

    void pptx.writeFile({ fileName: "CIA_Heatmap_Export.pptx" });
  };

  // ✅ Load real engagement + transcripts + insights
  useEffect(() => {
    if (!engagementId) return;

    async function load() {
      try {
        setLoading(true);

        // 1. Engagement details
        const eng = await getEngagementSummary(engagementId!);
        const context = await getEngagementContext(engagementId!);

        setEngagement({
          id: eng.engagement_id,
          title: eng.name ?? "Untitled Engagement",
          summary: eng.summary ?? "No summary available.",
        });
        setDocuments(Array.isArray(eng.documents) ? eng.documents : []);
        setContextBrief((context?.change_brief ?? "").trim());
        setContextSummary(normalizeSummaryPoints(context?.change_summary));
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    async function loadHeatmap() {
      try {
        const resp = await getEngagementHeatmap(engagementId!);
        setHeatmap(resp.heatmap);
      } catch (err: any) {
        console.error("Heatmap error", err);
        console.log("Failed to load heatmap.");
      }
    }

    loadHeatmap();
    load();
  }, [engagementId]);

  if (loading) {
    return (
      <div className="engagement-detail-page">
        <p>Loading engagement...</p>
      </div>
    );
  }

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

  const handleExportTranscripts = async () => {
    if (!engagementId) return;

    try {
      const data = await getEngagementTranscripts(engagementId);

      const rows: TranscriptExportRow[] = [];

      data.completed_interviews.forEach((iv) => {
        iv.transcript.forEach((t) => {
          rows.push({
            InterviewID: iv.interview_id,
            StakeholderName: iv.stakeholder_name,
            StakeholderEmail: iv.stakeholder_email ?? "",
            Section: t.section,
            Question: t.question_text,
            Answer: t.answer_text,
          });
        });
      });

      if (rows.length === 0) {
        alert("No completed interviews. Nothing to export.");
        return;
      }

      // Create worksheet + workbook
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Transcripts");

      const filename = `CIA_Transcripts_${engagement?.title || "Engagement"}.xlsx`;

      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error(err);
      alert("Failed to export transcripts.");
    }
  };

  return (
    <div className="engagement-detail-page">
      <Link to="/all-cias" className="engagement-detail-back">
        ← Back to All CIAs
      </Link>

      <div className="engagement-detail card">
        <h1 className="engagement-detail-title">{engagement.title}</h1>
        <div className="engagement-detail-content-stack">
          <section className="engagement-detail-section">
            <h2 className="engagement-detail-subheading">Uploaded Documents</h2>
            {documents.length > 0 ? (
              <ul className="engagement-detail-doc-list">
                {documents.map((doc) => (
                  <li
                    key={doc.id || doc.filename}
                    className="engagement-detail-doc-item"
                  >
                    {doc.filename}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="engagement-detail-empty-text">
                No uploaded documents available.
              </p>
            )}
          </section>

          <section className="engagement-detail-section">
            <h2 className="engagement-detail-subheading">Context Brief</h2>
            <p className="engagement-detail-summary">
              {contextBrief || "No context brief available."}
            </p>
          </section>

          <section className="engagement-detail-section">
            <h2 className="engagement-detail-subheading">Summary</h2>
            {contextSummary.length > 0 ? (
              <ul className="engagement-detail-summary-list">
                {contextSummary.map((point) => (
                  <li key={point} className="engagement-detail-summary-item">
                    {point}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="engagement-detail-summary">
                {engagement.summary || "No summary available."}
              </p>
            )}
          </section>
        </div>
      </div>
      {/* ✅ Real stakeholder interviews grid */}
      {engagement.id && isLikelyEngagementUuid(engagement.id) && (
        <StakeholderInterviewGrid
          engagementId={engagement.id}
          useDemoData={false}
          returnPath={`/all-cias/${engagement.id}`}
          headerAction={
            <button
              type="button"
              className="btn btn-primary engagement-export-transcript-btn"
              onClick={handleExportTranscripts}
            >
              Export Transcript
            </button>
          }
        />
      )}

      {/* ✅ Keep heatmap dummy data unchanged */}
      <ChangeImpactHeatmap
        onExportPpt={() => exportHeatmapPPT(heatmap!, HEATMAP_IMPACT_KEYS)}
      />
    </div>
  );
}
