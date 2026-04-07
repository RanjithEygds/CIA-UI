import {
  useCallback,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import type { ComputedCell, TooltipProps } from "@nivo/heatmap";
import type { AxisTickProps } from "@nivo/axes";
import { animated } from "@react-spring/web";
import {
  getEngagementInsights,
  getEngagementHeatmap,
  type EngagementInsightsResponse,
  type HeatmapRow,
} from "../api/engagements";

import "./ChangeImpactHeatmap.css";
import { useParams } from "react-router-dom";

type ImpactKey = "People" | "Process" | "Technology" | "Organization";

export const HEATMAP_IMPACT_KEYS: ImpactKey[] = [
  "People",
  "Process",
  "Technology",
  "Organization",
];

/** unchanged demo labels */
const IMPACT_LABELS: Record<number, string> = {
  0: "No change",
  1: "Low",
  2: "Medium",
  3: "High",
};

/** unchanged demo colors */
const SEVERITY_BLUE: Record<number, string> = {
  0: "#e8eaf3",
  1: "#b4bdd8",
  2: "#6f7c9e",
  3: "#2d3561",
};

/** unchanged tooltip */
function cellFill(
  cell: Omit<
    ComputedCell<{ x: string; y?: number | null }>,
    "color" | "opacity" | "borderColor" | "labelTextColor"
  >,
): string {
  const v = cell.value;
  if (v === 0 || v === 1 || v === 2 || v === 3) return SEVERITY_BLUE[v];
  return "#ffffff";
}

function HeatMapTooltip({
  cell,
}: TooltipProps<{ x: string; y?: number | null }>) {
  const v = cell.value ?? 0;
  const label = IMPACT_LABELS[v] ?? "—";
  const xLabel =
    typeof cell.data.x === "string" ? cell.data.x : String(cell.data.x);

  return (
    <div className="cia-heatmap-tooltip">
      <div className="cia-heatmap-tooltip-title">{cell.serieId}</div>
      <div className="cia-heatmap-tooltip-row">
        <span className="cia-heatmap-tooltip-dim">{xLabel}</span>
        <span className="cia-heatmap-tooltip-sep">·</span>
        <span
          className="cia-heatmap-tooltip-level"
          data-level={Math.min(3, Math.max(0, v))}
        >
          {label}
        </span>
      </div>
      {cell.formattedValue != null && (
        <div className="cia-heatmap-tooltip-value">
          Score {cell.formattedValue}
        </div>
      )}
    </div>
  );
}

const legendItems: { level: number; label: string }[] = [
  { level: 0, label: "No change" },
  { level: 1, label: "Low" },
  { level: 2, label: "Medium" },
  { level: 3, label: "High" },
];

type SeverityRow = {
  degree: string;
  dimensionA: string;
  ratingA: string;
  dimensionB: string;
  ratingB: string;
};

type SeveritySection = {
  title: string;
  columnA: string;
  columnB: string;
  rows: SeverityRow[];
  /** One rating column between the two dimension columns (People scale). */
  singleRatingColumn?: boolean;
};

const CHANGE_SEVERITY_SECTIONS: SeveritySection[] = [
  {
    title: "People - Change Severity Rating Scale",
    columnA: "Org Structure and Roles",
    columnB: "Skills, Capabilities & New Ways of Working",
    singleRatingColumn: true,
    rows: [
      {
        degree: "No Change = 0",
        dimensionA: "No changes to roles or team structure.",
        ratingA: "0",
        dimensionB: "No changes to skills or ways of working.",
        ratingB: "0",
      },
      {
        degree: "Low = 1",
        dimensionA: "Less than 30% change to roles or team structure.",
        ratingA: "1",
        dimensionB: "Less than 30% change to skills or ways of working.",
        ratingB: "1",
      },
      {
        degree: "Medium = 2",
        dimensionA:
          "30–50% change to roles or team structure; impacts a noticeable group.",
        ratingA: "2",
        dimensionB:
          "30–50% change to skills or ways of working; impacts a noticeable group.",
        ratingB: "2",
      },
      {
        degree: "High = 3",
        dimensionA:
          "More than 50% change to roles or team structure; impacts a large population.",
        ratingA: "3",
        dimensionB:
          "More than 50% change to skills or ways of working; impacts a large population.",
        ratingB: "3",
      },
    ],
  },
  {
    title: "Process - Change Severity Rating Scale",
    columnA: "New or Interim Processes",
    columnB: "Policies and Procedures",
    rows: [
      {
        degree: "No Change = 0",
        dimensionA: "No process changes; no interim working required.",
        ratingA: "0",
        dimensionB: "No changes to policies or procedures.",
        ratingB: "0",
      },
      {
        degree: "Low = 1",
        dimensionA:
          "Less than 30% change to processes; minimal interim working.",
        ratingA: "1",
        dimensionB:
          "Less than 30% change to policies or procedures.",
        ratingB: "1",
      },
      {
        degree: "Medium = 2",
        dimensionA:
          "30–50% process changes; impacts a noticeable population.",
        ratingA: "2",
        dimensionB:
          "30–50% change to policies or procedural steps; impacts a noticeable population.",
        ratingB: "2",
      },
      {
        degree: "High = 3",
        dimensionA:
          "More than 50% change; new or interim processes introduced; impacts a large population.",
        ratingA: "3",
        dimensionB:
          "More than 50% change to policies or procedural steps; impacts a large population.",
        ratingB: "3",
      },
    ],
  },
  {
    title: "Technology - Change Severity Rating Scale",
    columnA: "Technology",
    columnB: "Data & Reporting",
    rows: [
      {
        degree: "No Change = 0",
        dimensionA: "No changes to the systems or tools that users work with.",
        ratingA: "0",
        dimensionB: "No changes to data or reporting.",
        ratingB: "0",
      },
      {
        degree: "Low = 1",
        dimensionA:
          "Less than 30% change in technology or system features (e.g., small field/option additions).",
        ratingA: "1",
        dimensionB:
          "Less than 30% change in reporting (e.g., a few new columns or small modifications).",
        ratingB: "1",
      },
      {
        degree: "Medium = 2",
        dimensionA:
          "30–50% change to technology or systems (e.g., new applications, major updates).",
        ratingA: "2",
        dimensionB:
          "30–50% change to reporting (e.g., new reports, major updates, stakeholder changes).",
        ratingB: "2",
      },
      {
        degree: "High = 3",
        dimensionA:
          "More than 50% change to technology or systems (e.g., new systems, replacing manual steps).",
        ratingA: "3",
        dimensionB:
          "More than 50% change to reporting (e.g., major redesigns, new reporting needs, stakeholder changes).",
        ratingB: "3",
      },
    ],
  },
];

/** Line height (px) for wrapped row labels — matches ~12px semibold axis text. */
const HEATMAP_ROW_LABEL_LINE_HEIGHT_PX = 16;
const HEATMAP_ROW_LABEL_VERTICAL_ROW_PAD_PX = 12;
const HEATMAP_MARGIN_TOP = 72;
const HEATMAP_MARGIN_BOTTOM = 52;
const HEATMAP_MARGIN_RIGHT = 28;
const HEATMAP_AXIS_LEFT_TICK_PADDING = 14;
const HEATMAP_AXIS_LEFT_TICK_SIZE = 0;
/** Space between measured text block and chart inner edge (tick side). */
const HEATMAP_LABEL_INNER_GUTTER_PX = 10;
/** Inset so wrapped lines stay inside the label column (canvas vs SVG / subpixel). */
const HEATMAP_LABEL_WRAP_SAFETY_PX = 10;
/** Minimum width reserved for the four heatmap columns (scales down on narrow viewports). */
const HEATMAP_MIN_CELL_STRIP_PX_WIDE = 168;
const HEATMAP_MIN_CELL_STRIP_PX_NARROW = 104;
const HEATMAP_NARROW_CONTAINER_BREAKPOINT_PX = 520;

function heatmapRowLabelFontCss(): string {
  if (typeof document === "undefined") return "600 12px system-ui, sans-serif";
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-sans")
    .trim();
  const stack =
    family.length > 0 ? family.replace(/^["']|["']$/g, "") : "system-ui, sans-serif";
  return `600 12px ${stack}`;
}

/**
 * Normalizes commas into explicit break-friendly tokens (e.g. list-style labels).
 */
function tokenizeHeatmapRowLabelWords(text: string): string[] {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return [];
  const withCommaBreaks = trimmed.replace(/,([^\s,])/g, ", $1");
  return withCommaBreaks.split(/\s+/).filter(Boolean);
}

/**
 * Line 1: "…, and" — Line 2: "Communications teams" (e.g. long function names).
 */
function splitBeforeCommunicationsTeamsIfApplicable(
  text: string,
): { head: string; tail: string } | null {
  const t = text.trim();
  const m = t.match(/^(.*\band)\s+(Communications\s+teams)\s*$/i);
  if (!m) return null;
  const head = m[1]!.trim();
  const tail = m[2]!.trim();
  if (!head || !tail) return null;
  return { head, tail };
}

function wrapHeatmapRowLabelLines(
  text: string,
  maxWidthPx: number,
  fontCss: string,
): string[] {
  if (typeof document === "undefined") return [text];
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return [text];

  ctx.font = fontCss;
  const trimmed = text.trim();
  if (!trimmed) return [""];

  const commsSplit = splitBeforeCommunicationsTeamsIfApplicable(trimmed);
  if (commsSplit) {
    const headLines = wrapHeatmapRowLabelLines(
      commsSplit.head,
      maxWidthPx,
      fontCss,
    );
    return [...headLines, commsSplit.tail];
  }

  const cap = Math.max(16, maxWidthPx - HEATMAP_LABEL_WRAP_SAFETY_PX);
  const words = tokenizeHeatmapRowLabelWords(trimmed);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = words[0] ?? "";
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    const test = `${line} ${w}`;
    if (ctx.measureText(test).width <= cap) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  lines.push(line);

  const out: string[] = [];
  for (const ln of lines) {
    if (ctx.measureText(ln).width <= cap) {
      out.push(ln);
      continue;
    }
    let chunk = "";
    for (const ch of ln) {
      const test = chunk + ch;
      if (chunk === "" || ctx.measureText(test).width <= cap) chunk = test;
      else {
        out.push(chunk);
        chunk = ch;
      }
    }
    if (chunk) out.push(chunk);
  }
  return out;
}

function measureMaxWrappedLineWidth(
  lines: string[],
  ctx: CanvasRenderingContext2D,
): number {
  let m = 0;
  for (const line of lines) m = Math.max(m, ctx.measureText(line).width);
  return m;
}

/**
 * Re-wraps all row labels to the drawable width implied by `marginLeft` so lines
 * never extend past the inner edge of the label column (fixes right-side clip).
 */
function finalizeHeatmapLabelsForMargin(
  functionIds: string[],
  marginLeft: number,
  overhead: number,
  fontCss: string,
  lineHeightPx: number,
): {
  linesById: Map<string, string[]>;
  maxRowLabelLines: number;
  minRowBandHeightPx: number;
} {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx || functionIds.length === 0) {
    return {
      linesById: new Map(),
      maxRowLabelLines: 1,
      minRowBandHeightPx: lineHeightPx + HEATMAP_ROW_LABEL_VERTICAL_ROW_PAD_PX,
    };
  }
  ctx.font = fontCss;

  let drawable = Math.max(20, marginLeft - overhead);
  let linesById = new Map<string, string[]>();
  let maxRowLabelLines = 1;
  let maxLinePx = 0;

  const rebuild = (d: number) => {
    linesById = new Map();
    maxRowLabelLines = 1;
    maxLinePx = 0;
    for (const id of functionIds) {
      const lines = wrapHeatmapRowLabelLines(id, d, fontCss);
      linesById.set(id, lines);
      maxRowLabelLines = Math.max(maxRowLabelLines, lines.length);
      maxLinePx = Math.max(maxLinePx, measureMaxWrappedLineWidth(lines, ctx));
    }
  };

  rebuild(drawable);
  let guard = 0;
  while (maxLinePx > drawable - HEATMAP_LABEL_WRAP_SAFETY_PX && drawable > 24 && guard++ < 48) {
    drawable -= 3;
    rebuild(drawable);
  }

  return {
    linesById,
    maxRowLabelLines,
    minRowBandHeightPx:
      maxRowLabelLines * lineHeightPx + HEATMAP_ROW_LABEL_VERTICAL_ROW_PAD_PX,
  };
}

type HeatmapLabelLayout = {
  linesById: Map<string, string[]>;
  marginLeft: number;
  maxRowLabelLines: number;
  lineHeightPx: number;
  minRowBandHeightPx: number;
};

/**
 * Computes wrap + left margin from measured canvas text so the label column is
 * always at least as wide as the longest wrapped line, while preserving a
 * minimum strip for the four heatmap columns.
 */
function computeHeatmapLabelLayout(
  containerCssWidthPx: number,
  functionIds: string[],
  fontCss: string,
): HeatmapLabelLayout {
  const lineHeightPx = HEATMAP_ROW_LABEL_LINE_HEIGHT_PX;
  const overhead =
    HEATMAP_AXIS_LEFT_TICK_PADDING +
    HEATMAP_AXIS_LEFT_TICK_SIZE +
    HEATMAP_LABEL_INNER_GUTTER_PX;

  if (
    typeof document === "undefined" ||
    functionIds.length === 0 ||
    !Number.isFinite(containerCssWidthPx) ||
    containerCssWidthPx < 80
  ) {
    return {
      linesById: new Map(),
      marginLeft: Math.max(overhead + 48, 120),
      maxRowLabelLines: 1,
      lineHeightPx,
      minRowBandHeightPx: lineHeightPx + HEATMAP_ROW_LABEL_VERTICAL_ROW_PAD_PX,
    };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      linesById: new Map(),
      marginLeft: overhead + 120,
      maxRowLabelLines: 1,
      lineHeightPx,
      minRowBandHeightPx: lineHeightPx + HEATMAP_ROW_LABEL_VERTICAL_ROW_PAD_PX,
    };
  }
  ctx.font = fontCss;

  let minCellStrip =
    containerCssWidthPx < HEATMAP_NARROW_CONTAINER_BREAKPOINT_PX
      ? HEATMAP_MIN_CELL_STRIP_PX_NARROW
      : HEATMAP_MIN_CELL_STRIP_PX_WIDE;

  let linesById = new Map<string, string[]>();
  let maxLinePx = 0;
  let maxRowLabelLines = 1;

  const rebuildAtWrapWidth = (wrapW: number) => {
    linesById = new Map();
    maxLinePx = 0;
    maxRowLabelLines = 1;
    const w = Math.max(32, wrapW);
    for (const id of functionIds) {
      const lines = wrapHeatmapRowLabelLines(id, w, fontCss);
      linesById.set(id, lines);
      maxRowLabelLines = Math.max(maxRowLabelLines, lines.length);
      maxLinePx = Math.max(maxLinePx, measureMaxWrappedLineWidth(lines, ctx));
    }
  };

  for (let pass = 0; pass < 6; pass++) {
    const budget = Math.floor(
      containerCssWidthPx - HEATMAP_MARGIN_RIGHT - minCellStrip,
    );
    const safeBudget = Math.max(budget, overhead + 40);

    let wrapW = Math.max(40, safeBudget - overhead);
    rebuildAtWrapWidth(wrapW);

    let marginLeft = Math.ceil(maxLinePx) + overhead;

    let guard = 0;
    while (marginLeft > safeBudget && wrapW > 32 && guard++ < 96) {
      wrapW = Math.max(32, wrapW - 5);
      rebuildAtWrapWidth(wrapW);
      marginLeft = Math.ceil(maxLinePx) + overhead;
    }

    if (marginLeft <= safeBudget) {
      const marginLeftFinal = Math.max(marginLeft, overhead + 1);
      const finalized = finalizeHeatmapLabelsForMargin(
        functionIds,
        marginLeftFinal,
        overhead,
        fontCss,
        lineHeightPx,
      );
      return {
        linesById: finalized.linesById,
        marginLeft: marginLeftFinal,
        maxRowLabelLines: finalized.maxRowLabelLines,
        lineHeightPx,
        minRowBandHeightPx: finalized.minRowBandHeightPx,
      };
    }

    minCellStrip = Math.max(72, minCellStrip - 20);
  }

  rebuildAtWrapWidth(40);
  const emergencyBudget = Math.max(
    overhead + 40,
    Math.floor(containerCssWidthPx - HEATMAP_MARGIN_RIGHT - 72),
  );
  let marginLeft = Math.min(
    Math.ceil(maxLinePx) + overhead,
    emergencyBudget,
  );
  marginLeft = Math.max(marginLeft, overhead + 1);

  const finalized = finalizeHeatmapLabelsForMargin(
    functionIds,
    marginLeft,
    overhead,
    fontCss,
    lineHeightPx,
  );

  return {
    linesById: finalized.linesById,
    marginLeft,
    maxRowLabelLines: finalized.maxRowLabelLines,
    lineHeightPx,
    minRowBandHeightPx: finalized.minRowBandHeightPx,
  };
}

const WrappedHeatMapRowTick = memo(function WrappedHeatMapRowTick({
  lines,
  lineHeightPx,
  ...tick
}: AxisTickProps<string> & { lines: string[]; lineHeightPx: number }) {
  const value = tick.format?.(tick.value) ?? tick.value;

  const gProps = useMemo(() => {
    const style = { opacity: tick.animatedProps.opacity };
    if (!tick.onClick) return { style };

    return {
      style: { ...style, cursor: "pointer" as const },
      onClick: (event: MouseEvent<SVGGElement>) =>
        tick.onClick!(event, value),
    };
  }, [tick.animatedProps.opacity, tick.onClick, value]);

  const n = lines.length;
  const lh = lineHeightPx;
  const blockHalf = n <= 1 ? 0 : ((n - 1) * lh) / 2;
  const startDy = -blockHalf;

  return (
    <animated.g transform={tick.animatedProps.transform} {...gProps}>
      <line
        x1={0}
        x2={tick.lineX}
        y1={0}
        y2={tick.lineY}
        style={tick.theme.line}
      />
      <animated.text
        className="cia-heatmap-row-label-text"
        dominantBaseline="middle"
        textAnchor={
          tick.textAnchor as "start" | "middle" | "end" | "inherit"
        }
        transform={tick.animatedProps.textTransform}
        style={{
          ...tick.theme.text,
          fontFeatureSettings: '"liga" 0',
        }}
      >
        {lines.map((rowLine, i) => (
          <tspan
            key={i}
            x={0}
            dy={i === 0 ? startDy : lh}
            alignmentBaseline="middle"
          >
            {rowLine}
          </tspan>
        ))}
      </animated.text>
    </animated.g>
  );
});

/** check icon — unchanged */
function KeyFindingCheckIcon() {
  return (
    <span className="cia-heatmap-findings-bullet" aria-hidden>
      <svg
        className="cia-heatmap-findings-bullet-svg"
        viewBox="0 0 22 22"
        width={22}
        height={22}
      >
        <circle
          className="cia-heatmap-findings-bullet-disc"
          cx="11"
          cy="11"
          r="11"
        />
        <path
          className="cia-heatmap-findings-bullet-mark"
          d="M6.5 11.2 9.3 14 15.5 7.8"
          fill="none"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden>
      <circle
        cx="10"
        cy="10"
        r="8.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="6.1" r="1.1" fill="currentColor" />
      <path
        d="M10 8.8v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SeverityScaleTable({ section }: { section: SeveritySection }) {
  const fourCol = section.singleRatingColumn === true;
  const tableMod = fourCol
    ? " cia-heatmap-info-table--four-col"
    : " cia-heatmap-info-table--five-col";
  return (
    <section className="cia-heatmap-info-section" aria-label={section.title}>
      <h4 className="cia-heatmap-info-section-title">{section.title}</h4>
      <div className="cia-heatmap-info-table-wrap">
        <table className={`cia-heatmap-info-table${tableMod}`}>
          <thead>
            <tr>
              <th>Degree of Impact</th>
              <th>{section.columnA}</th>
              <th>Rating</th>
              <th>{section.columnB}</th>
              {!fourCol && <th>Rating</th>}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={`${section.title}-${row.degree}`}>
                <th scope="row">{row.degree}</th>
                <td>{row.dimensionA}</td>
                <td className="cia-heatmap-info-rating">{row.ratingA}</td>
                <td>{row.dimensionB}</td>
                {!fourCol && (
                  <td className="cia-heatmap-info-rating">{row.ratingB}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SeverityInfoModal({
  isOpen,
  onClose,
  currentIndex,
  onPrev,
  onNext,
  popoverRef,
  popoverPosition,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  popoverRef: { current: HTMLDivElement | null };
  popoverPosition: { top: number; left: number };
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, onPrev, onNext]);

  if (!isOpen) return null;

  const stopBubbling = (event: MouseEvent<HTMLDivElement>) => event.stopPropagation();
  const section = CHANGE_SEVERITY_SECTIONS[currentIndex];
  const isAtStart = currentIndex === 0;
  const isAtEnd = currentIndex === CHANGE_SEVERITY_SECTIONS.length - 1;

  return (
    <div
      ref={popoverRef}
      className="cia-heatmap-info-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby="heatmap-info-title"
      style={{ top: popoverPosition.top, left: popoverPosition.left }}
      onClick={stopBubbling}
    >
      <div className="cia-heatmap-info-modal-head">
        <h3 id="heatmap-info-title" className="cia-heatmap-info-modal-title">
          Change Severity Rating Definitions
        </h3>
        <button
          type="button"
          className="cia-heatmap-info-close-btn"
          onClick={onClose}
          aria-label="Close change severity information"
        >
          <span aria-hidden>&times;</span>
        </button>
      </div>
      <div className="cia-heatmap-info-carousel-shell">
        {/* Keep arrows vertically centered to mimic carousel controls. */}
        <button
          type="button"
          className="cia-heatmap-info-nav cia-heatmap-info-nav-left"
          onClick={onPrev}
          disabled={isAtStart}
          aria-label="Show previous severity table"
        >
          <span aria-hidden>◀</span>
        </button>
        <div className="cia-heatmap-info-modal-content">
          <div
            className="cia-heatmap-info-carousel-track"
            key={section.title}
            aria-live="polite"
          >
            <SeverityScaleTable section={section} />
          </div>
          <p className="cia-heatmap-info-step-indicator">
            {currentIndex + 1} / {CHANGE_SEVERITY_SECTIONS.length}
          </p>
        </div>
        <button
          type="button"
          className="cia-heatmap-info-nav cia-heatmap-info-nav-right"
          onClick={onNext}
          disabled={isAtEnd}
          aria-label="Show next severity table"
        >
          <span aria-hidden>▶</span>
        </button>
      </div>
    </div>
  );
}

type ChangeImpactHeatmapProps = {
  onExportPpt?: () => void;
};

export default function ChangeImpactHeatmap({
  onExportPpt,
}: ChangeImpactHeatmapProps) {
  const { engagementId } = useParams<{ engagementId: string }>();
  const [insights, setInsights] = useState<EngagementInsightsResponse | null>(
    null,
  );
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const [heatmap, setHeatmap] = useState<HeatmapRow[] | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoSectionIndex, setInfoSectionIndex] = useState(0);
  const [infoPopoverPosition, setInfoPopoverPosition] = useState({
    top: 0,
    left: 0,
  });
  const infoTriggerRef = useRef<HTMLButtonElement>(null);
  const infoPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engagementId) return;

    async function loadHeatmap() {
      try {
        const resp = await getEngagementHeatmap(engagementId!);
        setHeatmap(resp.heatmap);
      } catch (err: any) {
        console.log(err.message ?? "Failed to load heatmap.");
      }
    }

    loadHeatmap();
  }, [engagementId]);

  /** ✅ Fetch insights from backend */
  useEffect(() => {
    if (!engagementId) return;

    async function load() {
      try {
        const data = await getEngagementInsights(engagementId!);

        if (data.message) {
          // no completed interviews
          setInsightsError(data.message);
          setInsights(null);
        } else {
          setInsights(data);
        }
      } catch (err: any) {
        setInsightsError(err.message || "Could not load insights.");
      }
    }

    load();
  }, [engagementId]);

  const transformedData =
    heatmap?.map((row) => ({
      id: row.function,
      data: HEATMAP_IMPACT_KEYS.map((key) => ({
        x: key,
        y: row[key],
      })),
    })) ?? [];

  const functionAxisIds = useMemo(
    () => heatmap?.map((row) => row.function) ?? [],
    [heatmap],
  );

  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [chartContainerWidth, setChartContainerWidth] = useState(() =>
    typeof window !== "undefined" ? Math.round(window.innerWidth) : 1024,
  );

  useLayoutEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;

    const applyWidth = (w: number) => {
      if (w > 0 && Number.isFinite(w)) setChartContainerWidth(Math.round(w));
    };

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect.width;
      if (cr != null) applyWidth(cr);
    });
    ro.observe(el);
    applyWidth(el.getBoundingClientRect().width);

    return () => ro.disconnect();
  }, []);

  const labelLayout = useMemo(
    () =>
      computeHeatmapLabelLayout(
        chartContainerWidth,
        functionAxisIds,
        heatmapRowLabelFontCss(),
      ),
    [chartContainerWidth, functionAxisIds],
  );

  const heatmapChartMinHeightPx =
    functionAxisIds.length === 0
      ? undefined
      : Math.max(
          380,
          HEATMAP_MARGIN_TOP +
            HEATMAP_MARGIN_BOTTOM +
            functionAxisIds.length *
              Math.max(36, labelLayout.minRowBandHeightPx),
        );

  const renderHeatmapLeftTick = useCallback(
    (tickProps: AxisTickProps<string>) => (
      <WrappedHeatMapRowTick
        {...tickProps}
        lineHeightPx={labelLayout.lineHeightPx}
        lines={
          labelLayout.linesById.get(String(tickProps.value)) ?? [
            String(tickProps.format?.(tickProps.value) ?? tickProps.value),
          ]
        }
      />
    ),
    [labelLayout],
  );

  useEffect(() => {
    if (!isInfoModalOpen) return;

    const onPointerDown = (event: globalThis.MouseEvent) => {
      const targetNode = event.target as Node;
      const clickedTrigger = infoTriggerRef.current?.contains(targetNode);
      const clickedPopover = infoPopoverRef.current?.contains(targetNode);
      if (!clickedTrigger && !clickedPopover) setIsInfoModalOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isInfoModalOpen]);

  useEffect(() => {
    if (!isInfoModalOpen) return;

    const updatePosition = () => {
      const triggerRect = infoTriggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const popoverWidth = 980;
      const viewportPadding = 16;
      const left = Math.max(
        viewportPadding,
        Math.min(
          triggerRect.left - popoverWidth / 2 + triggerRect.width / 2,
          window.innerWidth - popoverWidth - viewportPadding,
        ),
      );
      setInfoPopoverPosition({
        top: Math.round(triggerRect.bottom + 8),
        left: Math.round(left),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isInfoModalOpen]);

  const openInfoPopover = () => {
    // Always start at People when the info popup opens.
    setInfoSectionIndex(0);
    setIsInfoModalOpen(true);
  };

  const showPrevInfoSection = useCallback(() => {
    setInfoSectionIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const showNextInfoSection = useCallback(() => {
    setInfoSectionIndex((prev) =>
      Math.min(CHANGE_SEVERITY_SECTIONS.length - 1, prev + 1),
    );
  }, []);

  return (
    <div className="cia-heatmap-page">
      {/* ✅ HEATMAP CARD — unchanged */}
      <section
        className="cia-heatmap-card card"
        aria-label="Impact heatmap chart"
      >
        <div className="cia-heatmap-card-head">
          <div>
            <div className="cia-heatmap-card-title-row">
              <h2 className="engagement-section-title cia-heatmap-card-title">
                Engagement Impact Heatmap
              </h2>
              <button
                ref={infoTriggerRef}
                type="button"
                className="cia-heatmap-info-trigger"
                onClick={openInfoPopover}
                aria-label="Open change severity rating definitions"
                title="Change severity rating definitions"
              >
                <InfoIcon />
              </button>
            </div>
            <p className="cia-heatmap-card-sub">
              Cross-functional snapshot across People, Process, Technology, and
              Organization. Hover a cell for function, dimension, and severity.
            </p>
          </div>
          <div className="cia-heatmap-card-head-right">
            {onExportPpt && (
              <button
                type="button"
                className="btn btn-primary cia-heatmap-export-btn"
                onClick={onExportPpt}
              >
                Export Heatmap to PPT
              </button>
            )}
            <ul className="cia-heatmap-legend" aria-label="Severity legend">
              {legendItems.map(({ level, label }) => (
                <li key={level} className="cia-heatmap-legend-item">
                  <span
                    className="cia-heatmap-swatch"
                    style={{ background: SEVERITY_BLUE[level] }}
                    aria-hidden
                  />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          ref={chartWrapRef}
          className="cia-heatmap-chart-wrap"
          style={
            heatmapChartMinHeightPx != null
              ? { minHeight: heatmapChartMinHeightPx }
              : undefined
          }
        >
          <ResponsiveHeatMap
            data={transformedData}
            margin={{
              top: HEATMAP_MARGIN_TOP,
              right: HEATMAP_MARGIN_RIGHT,
              bottom: HEATMAP_MARGIN_BOTTOM,
              left: labelLayout.marginLeft,
            }}
            valueFormat=">-.0f"
            axisTop={{
              tickRotation: 0,
              tickSize: 0,
              tickPadding: 12,
            }}
            axisLeft={{
              tickSize: HEATMAP_AXIS_LEFT_TICK_SIZE,
              tickPadding: HEATMAP_AXIS_LEFT_TICK_PADDING,
              tickValues: functionAxisIds,
              renderTick: renderHeatmapLeftTick,
            }}
            theme={{
              background: "transparent",
              text: {
                fill: "var(--color-text)",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
              },
              axis: {
                ticks: {
                  text: {
                    fill: "var(--color-text)",
                    fontSize: 12,
                    fontWeight: 600,
                  },
                },
              },
            }}
            colors={cellFill}
            emptyColor="#ffffff"
            borderWidth={1}
            borderColor="#ffffff"
            borderRadius={0}
            labelTextColor={(cell) =>
              cell.value === 3 ? "#ffffff" : "#1a2332"
            }
            enableLabels
            animate
            motionConfig="gentle"
            hoverTarget="cell"
            tooltip={HeatMapTooltip}
            forceSquare={false}
            xInnerPadding={0}
            xOuterPadding={0}
            yInnerPadding={0}
            yOuterPadding={0}
          />
        </div>
      </section>
      <SeverityInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        currentIndex={infoSectionIndex}
        onPrev={showPrevInfoSection}
        onNext={showNextInfoSection}
        popoverRef={infoPopoverRef}
        popoverPosition={infoPopoverPosition}
      />

      {/* ✅ KEY FINDINGS SECTION — NOW USING BACKEND INSIGHTS */}
      <section
        className="cia-heatmap-findings card"
        aria-labelledby="heatmap-key-findings-heading"
      >
        <h2
          id="heatmap-key-findings-heading"
          className="cia-heatmap-findings-title"
        >
          Summary of Key Findings
        </h2>

        <ul className="cia-heatmap-findings-list">
          {insightsError && (
            <p className="cia-heatmap-findings-summary-text">{insightsError}</p>
          )}

          {!insightsError &&
            insights?.key_findings?.map((item, index) => (
              <li key={index} className="cia-heatmap-findings-item">
                <KeyFindingCheckIcon />
                <p className="cia-heatmap-findings-text">{item.text}</p>
              </li>
            ))}
        </ul>

        <div
          className="cia-heatmap-findings-summary"
          role="region"
          aria-label="Closing summary"
        >
          <p className="cia-heatmap-findings-summary-kicker">In summary</p>

          <p className="cia-heatmap-findings-summary-text">
            {insightsError
              ? "No insights available."
              : (insights?.summary ?? "")}
          </p>
        </div>
      </section>
    </div>
  );
}
