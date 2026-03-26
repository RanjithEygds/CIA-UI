import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PptxGenJS from "pptxgenjs";
import ChangeImpactHeatmap, {
  HEATMAP_IMPACT_KEYS,
  HEATMAP_MATRIX_DATA,
} from "./ChangeImpactHeatmap";
import StakeholderInterviewGrid from "../components/StakeholderInterviewGrid";

import { getEngagementSummary } from "../api/engagements";

import { isLikelyEngagementUuid } from "../api/interviews";
import "./EngagementDetail.css";

export default function EngagementDetail() {
  const { engagementId } = useParams<{ engagementId: string }>();

  const [loading, setLoading] = useState(true);

  // Engagement details
  const [engagement, setEngagement] = useState<{
    id: string;
    title: string;
    summary: string;
  } | null>(null);

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
    matrixData: typeof HEATMAP_MATRIX_DATA,
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

        setEngagement({
          id: eng.engagement_id,
          title: eng.name ?? "Untitled Engagement",
          summary: eng.summary ?? "No summary available.",
        });
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

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

  return (
    <div className="engagement-detail-page">
      <Link to="/all-cias" className="engagement-detail-back">
        ← Back to All CIAs
      </Link>

      <div className="engagement-detail card">
        <h1 className="engagement-detail-title">{engagement.title}</h1>
        <p className="engagement-detail-summary">{engagement.summary}</p>
        <div className="engagement-detail-meta">
          <span className="engagement-detail-id">
            Engagement ID: {engagement.id}
          </span>
        </div>
      </div>

      {/* ✅ Real stakeholder interviews grid */}
      {engagement.id && isLikelyEngagementUuid(engagement.id) && (
        <StakeholderInterviewGrid
          engagementId={engagement.id}
          useDemoData={false}
          returnPath={`/all-cias/${engagement.id}`}
        />
      )}

      {/* ✅ Keep heatmap dummy data unchanged */}
      <div className="engagement-heatmap-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            exportHeatmapPPT(HEATMAP_MATRIX_DATA, HEATMAP_IMPACT_KEYS)
          }
        >
          Export Heatmap to PPT
        </button>
      </div>
      <ChangeImpactHeatmap />
    </div>
  );
}
