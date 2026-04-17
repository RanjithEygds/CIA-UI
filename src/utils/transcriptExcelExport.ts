import * as XLSX from "xlsx-js-style";

/** Full row shape for global (engagement-wide) transcript export. */
export type TranscriptExportSheetRow = {
  "Interview ID": string;
  "Stakeholder Name": string;
  "Stakeholder Email": string;
  "Group": string;
  "Sub-Group": string;
  "Question Number": string;
  Section: string;
  Question: string;
  Response: string;
};

/** Individual stakeholder export omits group / sub-group columns. */
export type TranscriptExportSheetRowWithoutGroupColumns = Omit<
  TranscriptExportSheetRow,
  "Group" | "Sub-Group"
>;

export type TranscriptExportRowForStyles =
  | TranscriptExportSheetRow
  | TranscriptExportSheetRowWithoutGroupColumns;

/**
 * Individual transcript export drops "Group" and "Sub-Group"; global export does not.
 * True when API marks the interview as INDIVIDUAL, on nested
 * `/all-cias/:engagementId/individual` (or `/all-cia/...`), or on the per-interview
 * transcript route `/stakeholder/:interviewId` used by this app today.
 */
export function shouldOmitGroupSubGroupColumnsForTranscriptExport(
  pathname: string,
  stakeholderType?: string | null,
): boolean {
  if ((stakeholderType ?? "").trim().toUpperCase() === "INDIVIDUAL") {
    return true;
  }
  const p = pathname.trim();
  if (/^\/all-cias?\/[^/]+\/individual\/?$/i.test(p)) {
    return true;
  }
  if (/^\/stakeholder\/[^/]+\/?$/i.test(p)) {
    return true;
  }
  return false;
}


export function transcriptQuestionNumberFromId(questionId: string): string {
  const clean = (questionId || "").trim();
  if (!clean) return "";
  const trailingDigits = clean.match(/(\d+)$/);
  if (trailingDigits?.[1]) return trailingDigits[1];
  const anyDigits = clean.match(/\d+/);
  if (anyDigits?.[0]) return anyDigits[0];
  return clean;
}

/**
 * Excel column width (wch) for cells with wrapText: favor longest single line so
 * wrapped paragraphs stay readable without clipping.
 */
export function wchForLongTextCell(
  text: string,
  minWch = 44,
  maxWch = 100,
): number {
  const raw = String(text ?? "");
  const lines = raw.split(/\r?\n/);
  let longest = 0;
  for (const line of lines) {
    if (line.length > longest) longest = line.length;
  }
  if (longest === 0) return minWch;
  return Math.min(maxWch, Math.max(minWch, longest + 4));
}

const HEADER_STYLE: XLSX.CellStyle = {
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

const BASE_BODY_STYLE: XLSX.CellStyle = {
  font: { name: "Calibri", sz: 11, color: { rgb: "111827" } },
  alignment: { horizontal: "left", vertical: "top", wrapText: false },
  border: {
    top: { style: "thin", color: { rgb: "E5E7EB" } },
    bottom: { style: "thin", color: { rgb: "E5E7EB" } },
    left: { style: "thin", color: { rgb: "E5E7EB" } },
    right: { style: "thin", color: { rgb: "E5E7EB" } },
  },
};

const STAKEHOLDER_NAME_HIGHLIGHT_STYLE: XLSX.CellStyle = {
  ...BASE_BODY_STYLE,
  font: { ...(BASE_BODY_STYLE.font ?? {}), bold: true },
  fill: { patternType: "solid", fgColor: { rgb: "F9FAFB" } },
};

const WRAPPED_LONG_TEXT_STYLE: XLSX.CellStyle = {
  ...BASE_BODY_STYLE,
  alignment: {
    horizontal: "left",
    vertical: "top",
    wrapText: true,
  },
};

const LONG_TEXT_HEADERS = new Set(["Question", "Response"]);

/**
 * Apply shared transcript table formatting: headers, borders, stakeholder
 * emphasis, Question + Response wrap + column widths.
 */
export function applyTranscriptSheetStyles(
  worksheet: XLSX.WorkSheet,
  rows: TranscriptExportRowForStyles[],
): void {
  if (rows.length === 0) return;

  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  const headerRowIndex = range.s.r;
  const headerNames = Object.keys(rows[0]!) as string[];

  const colWidths = headerNames.map((name) => ({
    wch: Math.max(String(name).length + 2, 14),
  }));

  const stakeholderColIdx = headerNames.indexOf("Stakeholder Name");
  const questionColIdx = headerNames.indexOf("Question");
  const answerColIdx = headerNames.indexOf("Response");

  let maxQuestionWch =
    questionColIdx >= 0
      ? wchForLongTextCell(String(headerNames[questionColIdx]))
      : 44;
  let maxAnswerWch =
    answerColIdx >= 0
      ? wchForLongTextCell(String(headerNames[answerColIdx]))
      : 44;

  rows.forEach((row, idx) => {
    const prevName =
      idx > 0 ? rows[idx - 1]?.["Stakeholder Name"] ?? null : null;
    const isNewStakeholder = row["Stakeholder Name"] !== prevName;

    if (questionColIdx >= 0) {
      maxQuestionWch = Math.max(
        maxQuestionWch,
        wchForLongTextCell(row.Question),
      );
    }
    if (answerColIdx >= 0) {
      maxAnswerWch = Math.max(
        maxAnswerWch,
        wchForLongTextCell(row.Response),
      );
    }

    headerNames.forEach((header, colIdx) => {
      const cellAddress = XLSX.utils.encode_cell({ r: idx + 1, c: colIdx });
      const cell = worksheet[cellAddress];
      if (!cell) return;

      if (colIdx === stakeholderColIdx && isNewStakeholder) {
        cell.s = STAKEHOLDER_NAME_HIGHLIGHT_STYLE;
      } else if (LONG_TEXT_HEADERS.has(header as string)) {
        cell.s = WRAPPED_LONG_TEXT_STYLE;
      } else {
        cell.s = BASE_BODY_STYLE;
      }

      const value = String(
        (row as Record<string, string | undefined>)[header] ?? "",
      );
      if (colIdx !== questionColIdx && colIdx !== answerColIdx) {
        colWidths[colIdx] = {
          wch: Math.min(
            50,
            Math.max(colWidths[colIdx]?.wch ?? 14, value.length + 2),
          ),
        };
      }
    });
  });

  if (questionColIdx >= 0) {
    colWidths[questionColIdx] = { wch: maxQuestionWch };
  }
  if (answerColIdx >= 0) {
    colWidths[answerColIdx] = { wch: maxAnswerWch };
  }

  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const headerAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c });
    const headerCell = worksheet[headerAddress];
    if (!headerCell) continue;
    headerCell.s = HEADER_STYLE;
  }

  worksheet["!cols"] = colWidths;
}
