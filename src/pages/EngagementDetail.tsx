import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx-js-style";
import {
  getEngagementHeatmap,
  getEngagementContext,
  getEngagementTranscripts,
  getEngagementInsights,
  type EngagementDoc,
  type HeatmapRow,
  type ImpactGroup,
} from "../api/engagements";
import ChangeImpactHeatmap, {
  HEATMAP_IMPACT_KEYS,
} from "./ChangeImpactHeatmap";
import StakeholderInterviewGrid from "../components/StakeholderInterviewGrid";

import { getEngagementSummary } from "../api/engagements";

import { isLikelyEngagementUuid } from "../api/interviews";
import {
  applyTranscriptSheetStyles,
  transcriptQuestionNumberFromId,
  type TranscriptExportSheetRow,
} from "../utils/transcriptExcelExport";
import "./EngagementDetail.css";

function sanitizeFilenamePart(value: string): string {
  const withoutControlChars = Array.from(value)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");

  return withoutControlChars
    .trim()
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

/** Preview Change Rationale / impacted_groups: show name only; split if a single field contains "Name - Description". */
function groupNameBeforeDash(g: ImpactGroup): string {
  const desc = String(g.description ?? "").trim();
  let raw = String(g.name ?? "").trim();
  if (!raw) return "";
  if (desc) return raw;
  const m = raw.match(/^(.+?)\s*[—–\-]\s*.+$/);
  return m ? m[1]!.trim() : raw;
}

export default function EngagementDetail() {
  const { engagementId } = useParams<{ engagementId: string }>();

  const [loading, setLoading] = useState(true);
  const [heatmap, setHeatmap] = useState<HeatmapRow[] | null>(null);

  // Engagement details
  const [engagement, setEngagement] = useState<{
    id: string;
    title: string;
    summary: string;
    change_brief?: string;
  } | null>(null);
  const [documents, setDocuments] = useState<EngagementDoc[]>([]);
  const [contextBrief, setContextBrief] = useState("");
  const [contextSummary, setContextSummary] = useState<string[]>([]);
  const [impactedGroups, setImpactedGroups] = useState<ImpactGroup[]>([]);

  const impactedGroupLabels = impactedGroups
    .map((g) => groupNameBeforeDash(g))
    .filter((label): label is string => Boolean(label));

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

  // Export heatmap to PPT with tabular heatmap + key findings.
  const exportHeatmapPPT = (
    engagementKey: string | undefined,
    matrixData: HeatmapRow[],
    impactKeys: typeof HEATMAP_IMPACT_KEYS,
  ) => {
    const runExport = async () => {
      if (!matrixData.length) {
        alert("Heatmap data is unavailable for export.");
        return;
      }

      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.author = "CIA UI";
      pptx.subject = "Engagement Impact Heatmap";
      pptx.title = `${engagement?.title ?? "Engagement"} Heatmap Export`;

      const presentationTitle = engagement?.title?.trim() || "Untitled Engagement";
      const today = new Date().toLocaleDateString();

      const heatmapSlide = pptx.addSlide();
      heatmapSlide.background = { color: "FFFFFF" };
      heatmapSlide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.44,
        fill: { color: "0D7377" },
        line: { color: "0D7377" },
      });
      heatmapSlide.addText(`${presentationTitle} Heatmap`, {
        x: 0.6,
        y: 0.58,
        w: 8.9,
        h: 0.46,
        fontSize: 23,
        bold: true,
        color: "0F172A",
      });
      heatmapSlide.addText(`Engagement Title: ${presentationTitle}`, {
        x: 0.6,
        y: 1.02,
        w: 8.3,
        h: 0.28,
        fontSize: 12,
        color: "334155",
      });
      heatmapSlide.addText(`Date: ${today}`, {
        x: 9.35,
        y: 0.74,
        w: 3.2,
        h: 0.28,
        fontSize: 11,
        align: "right",
        color: "475569",
      });
      heatmapSlide.addText("People, Process, Technology, Organization", {
        x: 0.6,
        y: 1.28,
        w: 12.0,
        h: 0.3,
        fontSize: 12,
        color: "475569",
      });

      const tableRows = [
        [
          {
            text: "Function",
            options: {
              bold: true,
              align: "center" as const,
              color: "FFFFFF",
              fill: { color: "0F172A" },
            },
          },
          ...impactKeys.map((key) => ({
            text: key,
            options: {
              bold: true,
              align: "center" as const,
              color: "FFFFFF",
              fill: { color: "0F172A" },
            },
          })),
        ],
        ...matrixData.map((row) => [
          { text: row.function, options: { bold: true, color: "0F172A" } },
          ...impactKeys.map((key) => ({
            text: row[key].toString(),
            options: {
              fill: { color: getPptFill(row[key]) },
              bold: true,
              align: "center" as const,
              color: row[key] === 3 ? "FFFFFF" : "111827",
            },
          })),
        ]),
      ];

      const rowCount = tableRows.length;
      const dynamicRowHeight = Math.min(0.44, Math.max(0.26, 4.6 / rowCount));
      heatmapSlide.addTable(tableRows, {
        x: 0.65,
        y: 1.62,
        w: 12.0,
        rowH: dynamicRowHeight,
        fontSize: 10.5,
        border: { type: "solid", color: "CBD5E1", pt: 1 },
      });

      const legendItems = [
        { label: "No change", color: getPptFill(0) },
        { label: "Low", color: getPptFill(1) },
        { label: "Medium", color: getPptFill(2) },
        { label: "High", color: getPptFill(3) },
      ];
      heatmapSlide.addText("Heatmap Legend", {
        x: 0.65,
        y: 6.52,
        w: 2.4,
        h: 0.26,
        fontSize: 11,
        bold: true,
        color: "334155",
      });
      legendItems.forEach((item, index) => {
        const swatchX = 2.1 + index * 2.55;
        heatmapSlide.addShape(pptx.ShapeType.roundRect, {
          x: swatchX,
          y: 6.5,
          w: 0.28,
          h: 0.24,
          rectRadius: 0.03,
          fill: { color: item.color },
          line: { color: "94A3B8", pt: 0.5 },
        });
        heatmapSlide.addText(item.label, {
          x: swatchX + 0.36,
          y: 6.49,
          w: 1.95,
          h: 0.25,
          fontSize: 10,
          color: "1E293B",
        });
      });

      let findings: string[] = [];
      let inSummaryText = "";

      try {
        if (engagementKey) {
          const insights = await getEngagementInsights(engagementKey);
          if (!insights.message) {
            findings = (insights.key_findings ?? [])
              .map((k) => k.text.trim())
              .filter(Boolean);
            inSummaryText = (insights.summary ?? "").trim();
          }
        }
      } catch {
        /* use DOM / context fallbacks below */
      }

      if (findings.length === 0) {
        findings = Array.from(
          document.querySelectorAll(
            ".cia-heatmap-findings-item .cia-heatmap-findings-text",
          ),
        )
          .map((el) => el.textContent?.trim() ?? "")
          .filter(Boolean);
      }

      if (findings.length === 0) {
        const listErr = document.querySelector(
          ".cia-heatmap-findings-list > .cia-heatmap-findings-summary-text",
        );
        const errText = listErr?.textContent?.trim();
        if (errText) findings = [errText];
      }

      if (findings.length === 0) {
        findings =
          contextSummary.length > 0
            ? [...contextSummary]
            : [
                engagement?.change_brief?.trim() ||
                  engagement?.summary?.trim() ||
                  "",
              ].filter(Boolean);
      }

      if (!inSummaryText) {
        const summaryEl = document.querySelector(
          ".cia-heatmap-findings-summary .cia-heatmap-findings-summary-text",
        );
        inSummaryText = summaryEl?.textContent?.trim() ?? "";
      }

      const hasPlaceholderOnly =
        findings.length === 0 && !inSummaryText;
      if (hasPlaceholderOnly) {
        findings = ["No key findings available."];
      }

      const maxBulletsPerSlide = 7;
      const packBullets = (bullets: string[]): string[][] => {
        if (bullets.length === 0) return [];
        const out: string[][] = [];
        for (let i = 0; i < bullets.length; i += maxBulletsPerSlide) {
          out.push(bullets.slice(i, i + maxBulletsPerSlide));
        }
        return out;
      };

      const bulletChunks = packBullets(findings);

      const addFindingsSlideHeader = (
        slide: ReturnType<typeof pptx.addSlide>,
        title: string,
      ) => {
        slide.background = { color: "FFFFFF" };
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 0.35,
          w: 12.3,
          h: 0.08,
          fill: { color: "0D7377" },
          line: { color: "0D7377" },
        });
        slide.addText(title, {
          x: 0.75,
          y: 0.52,
          w: 11.8,
          h: 0.5,
          fontSize: 22,
          bold: true,
          color: "0F172A",
        });
      };

      let slideOrdinal = 0;
      bulletChunks.forEach((chunk) => {
        slideOrdinal += 1;
        const findingsSlide = pptx.addSlide();
        const slideTitle =
          slideOrdinal === 1
            ? "Summary of Key Findings"
            : `Summary of Key Findings (cont. ${slideOrdinal})`;
        addFindingsSlideHeader(findingsSlide, slideTitle);

        const bullets = chunk.map((point) => ({
          text: point,
          options: { bullet: { indent: 18 } },
        }));

        findingsSlide.addText(bullets, {
          x: 0.85,
          y: 1.22,
          w: 11.65,
          h: 6.15,
          align: "left",
          valign: "top",
          breakLine: true,
          paraSpaceAfter: 11,
          lineSpacingMultiple: 1.12,
          fontSize: 15,
          color: "1E293B",
        });
      });

      if (inSummaryText) {
        slideOrdinal += 1;
        const summarySlide = pptx.addSlide();
        const summarySlideTitle =
          slideOrdinal === 1
            ? "Summary of Key Findings"
            : `Summary of Key Findings (cont. ${slideOrdinal})`;
        addFindingsSlideHeader(summarySlide, summarySlideTitle);

        summarySlide.addText(
          [
            {
              text: "IN SUMMARY",
              options: {
                bold: true,
                fontSize: 20,
                breakLine: true,
                paraSpaceAfter: 10,
              },
            },
            {
              text: inSummaryText,
              options: {
                fontSize: 15,
                breakLine: true,
              },
            },
          ],
          {
            x: 0.85,
            y: 1.22,
            w: 11.65,
            h: 6.15,
            align: "left",
            valign: "top",
            lineSpacingMultiple: 1.15,
            color: "1E293B",
          },
        );
      }

      const safeEngagementName = sanitizeFilenamePart(
        presentationTitle || "Engagement",
      );
      await pptx.writeFile({
        fileName: `${safeEngagementName}_Heatmap_Export.pptx`,
      });
    };

    void runExport().catch((err) => {
      console.error(err);
      alert("Failed to export heatmap PPT. Please try again.");
    });
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
          change_brief: eng?.change_brief ?? "",
        });
        setDocuments(Array.isArray(eng.documents) ? eng.documents : []);
        setContextBrief((context?.change_brief ?? "").trim());
        setContextSummary(normalizeSummaryPoints(context?.change_summary));
        setImpactedGroups(
          Array.isArray(context?.impacted_groups) ? context.impacted_groups : [],
        );
      } catch (err: unknown) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    async function loadHeatmap() {
      try {
        const resp = await getEngagementHeatmap(engagementId!);
        setHeatmap(resp.heatmap);
      } catch (err: unknown) {
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

      const rows: TranscriptExportSheetRow[] = [];

      data.completed_interviews.forEach((iv) => {
        iv.transcript.forEach((t) => {
          rows.push({
            "Interview ID": iv.interview_id,
            "Stakeholder Name": iv.stakeholder_name,
            "Stakeholder Email": iv.stakeholder_email ?? "",
            "Question Number": transcriptQuestionNumberFromId(t.question_id),
            Section: t.section,
            Question: t.question_text,
            Response: t.answer_text,
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
      applyTranscriptSheetStyles(worksheet, rows);

      const safeEngagementName = sanitizeFilenamePart(
        data.engagement_name?.trim() || engagement?.title || "Engagement",
      );
      const filename = `${safeEngagementName}_Interview_Transcript_Export.xlsx`;

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
                {engagement.change_brief || "No summary available."}
              </p>
            )}
          </section>

          <section className="engagement-detail-section">
            <h2 className="engagement-detail-subheading">
              Groups Impacted by The Change
            </h2>
            {impactedGroupLabels.length > 0 ? (
              <ul className="engagement-detail-summary-list">
                {impactedGroupLabels.map((label, idx) => (
                  <li
                    key={`${label}-${idx}`}
                    className="engagement-detail-summary-item"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="engagement-detail-empty-text">None identified.</p>
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
              Download Full Transcript Report
            </button>
          }
        />
      )}

      {/* ✅ Keep heatmap dummy data unchanged */}
      <ChangeImpactHeatmap
        onExportPpt={() =>
          exportHeatmapPPT(engagement.id, heatmap!, HEATMAP_IMPACT_KEYS)
        }
      />
    </div>
  );
}
