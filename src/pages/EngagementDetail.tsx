import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx-js-style";
import {
  getEngagementHeatmap,
  getEngagementContext,
  getEngagementTranscripts,
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
import "./EngagementDetail.css";

type TranscriptExportRow = {
  "Interview ID": string;
  "Stakeholder Name": string;
  "Stakeholder Email": string;
  "Question Number": string;
  Section: string;
  Question: string;
  "Response": string;
};

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

function getQuestionNumber(questionId: string): string {
  const clean = (questionId || "").trim();
  if (!clean) return "";
  const trailingDigits = clean.match(/(\d+)$/);
  if (trailingDigits?.[1]) return trailingDigits[1];
  const anyDigits = clean.match(/\d+/);
  if (anyDigits?.[0]) return anyDigits[0];
  return clean;
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

      const findingsFromDom = Array.from(
        document.querySelectorAll(".cia-heatmap-findings-item .cia-heatmap-findings-text"),
      )
        .map((el) => el.textContent?.trim() ?? "")
        .filter(Boolean);
      const findings =
        findingsFromDom.length > 0
          ? findingsFromDom
          : contextSummary.length > 0
            ? contextSummary
            : [engagement?.change_brief?.trim() || engagement?.summary?.trim() || ""].filter(
                Boolean,
              );

      const splitLongFinding = (point: string, maxChars = 240): string[] => {
        const trimmed = point.trim();
        if (trimmed.length <= maxChars) return [trimmed];
        const words = trimmed.split(/\s+/);
        const pieces: string[] = [];
        let current = "";
        words.forEach((word) => {
          const candidate = current ? `${current} ${word}` : word;
          if (candidate.length <= maxChars) {
            current = candidate;
            return;
          }
          if (current) {
            pieces.push(current);
            current = word;
            return;
          }
          // Fallback for exceptionally long single words.
          pieces.push(word.slice(0, maxChars));
          current = word.slice(maxChars);
        });
        if (current) {
          pieces.push(current);
        }
        return pieces.map((piece, idx) =>
          idx === 0 ? piece : `(cont.) ${piece}`.trim(),
        );
      };

      const normalizedFindings = findings.flatMap((point) => splitLongFinding(point));
      const chunks: string[][] = [];
      let currentChunk: string[] = [];
      let currentChars = 0;
      const maxCharsPerSlide = 760;
      const maxBulletsPerSlide = 8;

      normalizedFindings.forEach((point) => {
        const pointChars = point.length + 20;
        if (
          currentChunk.length > 0 &&
          (currentChars + pointChars > maxCharsPerSlide ||
            currentChunk.length >= maxBulletsPerSlide)
        ) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChars = 0;
        }
        currentChunk.push(point);
        currentChars += pointChars;
      });
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      if (chunks.length === 0) {
        chunks.push(["No key findings available."]);
      }

      chunks.forEach((chunk, index) => {
        const findingsSlide = pptx.addSlide();
        findingsSlide.background = { color: "FFFFFF" };
        findingsSlide.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 0.35,
          w: 12.3,
          h: 0.08,
          fill: { color: "0D7377" },
          line: { color: "0D7377" },
        });
        findingsSlide.addText(
          index === 0
            ? "Summary of Key Findings"
            : `Summary of Key Findings (cont. ${index + 1})`,
          {
            x: 0.75,
            y: 0.55,
            w: 11.8,
            h: 0.45,
            fontSize: 22,
            bold: true,
            color: "0F172A",
          },
        );

        const bullets = chunk.map((point) => ({
          text: point,
          options: { bullet: { indent: 14 } },
        }));

        findingsSlide.addText(bullets, {
          x: 0.9,
          y: 1.25,
          w: 11.6,
          h: 5.8,
          align: "left",
          valign: "top",
          breakLine: true,
          paraSpaceAfter: 13,
          fontSize: 15,
          color: "1E293B",
        });
      });

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

      const rows: TranscriptExportRow[] = [];

      data.completed_interviews.forEach((iv) => {
        iv.transcript.forEach((t) => {
          rows.push({
            "Interview ID": iv.interview_id,
            "Stakeholder Name": iv.stakeholder_name,
            "Stakeholder Email": iv.stakeholder_email ?? "",
            "Question Number": getQuestionNumber(t.question_id),
            Section: t.section,
            Question: t.question_text,
            "Response": t.answer_text,
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
      const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
      const headerRowIndex = range.s.r;

      const headerStyle: XLSX.CellStyle = {
        font: { bold: true, name: "Calibri", sz: 11, color: { rgb: "1F2937" } },
        fill: { patternType: "solid", fgColor: { rgb: "F2F2F2" } },
        alignment: { horizontal: "left", vertical: "top", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "D9D9D9" } },
          bottom: { style: "thin", color: { rgb: "D9D9D9" } },
          left: { style: "thin", color: { rgb: "D9D9D9" } },
          right: { style: "thin", color: { rgb: "D9D9D9" } },
        },
      };

      const baseBodyStyle: XLSX.CellStyle = {
        font: { name: "Calibri", sz: 11, color: { rgb: "111827" } },
        alignment: { horizontal: "left", vertical: "top", wrapText: false },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };

      const stakeholderHighlightStyle: XLSX.CellStyle = {
        ...baseBodyStyle,
        font: { ...(baseBodyStyle.font ?? {}), bold: true },
        fill: { patternType: "solid", fgColor: { rgb: "F9FAFB" } },
      };

      const responseBodyStyle: XLSX.CellStyle = {
        ...baseBodyStyle,
        alignment: {
          horizontal: "left",
          vertical: "top",
          wrapText: true,
        },
      };

      const headerNames = rows.length > 0 ? Object.keys(rows[0]!) : [];
      const colWidths = headerNames.map((name) => ({ wch: Math.max(name.length + 2, 14) }));
      const stakeholderColIdx = headerNames.indexOf("Stakeholder Name");
      const answerColIdx = headerNames.indexOf("Response / Answer");
      if (answerColIdx >= 0) {
        colWidths[answerColIdx] = { wch: 80 };
      }

      rows.forEach((row, idx) => {
        const prevName = idx > 0 ? rows[idx - 1]?.["Stakeholder Name"] ?? null : null;
        headerNames.forEach((header, colIdx) => {
          const cellAddress = XLSX.utils.encode_cell({ r: idx + 1, c: colIdx });
          const cell = worksheet[cellAddress];
          if (!cell) return;
          const isAnswerCell = colIdx === answerColIdx;
          cell.s = isAnswerCell ? responseBodyStyle : baseBodyStyle;
          if (
            colIdx === stakeholderColIdx &&
            row["Stakeholder Name"] !== prevName
          ) {
            cell.s = stakeholderHighlightStyle;
          }
          const value = String(row[header as keyof TranscriptExportRow] ?? "");
          if (colIdx !== answerColIdx) {
            colWidths[colIdx] = {
              wch: Math.min(50, Math.max(colWidths[colIdx]?.wch ?? 14, value.length + 2)),
            };
          }
        });
      });

      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const headerAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c });
        const headerCell = worksheet[headerAddress];
        if (!headerCell) continue;
        headerCell.s = headerStyle;
      }

      worksheet["!cols"] = colWidths;

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
