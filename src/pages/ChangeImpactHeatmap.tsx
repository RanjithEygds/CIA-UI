import { useEffect, useState } from "react";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import type { ComputedCell, TooltipProps } from "@nivo/heatmap";
import {
  getEngagementInsights,
  type EngagementInsightsResponse,
} from "../api/engagements";

import "./ChangeImpactHeatmap.css";
import { useParams } from "react-router-dom";

type ImpactKey = "People" | "Process" | "Technology" | "Organization";

type HeatMapRow = {
  function: string;
} & Record<ImpactKey, number>;

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

/** Heatmap still uses demo data ⛔ Backend not ready */
export const HEATMAP_MATRIX_DATA: HeatMapRow[] = [
  {
    function: "Claims Department",
    People: 3,
    Process: 3,
    Technology: 2,
    Organization: 2,
  },
  {
    function: "Underwriting Team",
    People: 2,
    Process: 3,
    Technology: 3,
    Organization: 2,
  },
  {
    function: "Policy Servicing",
    People: 3,
    Process: 2,
    Technology: 2,
    Organization: 3,
  },
  {
    function: "Support Functions",
    People: 2,
    Process: 2,
    Technology: 1,
    Organization: 3,
  },
  {
    function: "Senior Leaders",
    People: 3,
    Process: 2,
    Technology: 1,
    Organization: 3,
  },
];

const HEATMAP_FUNCTION_AXIS_IDS = HEATMAP_MATRIX_DATA.map(
  (row) => row.function,
);

/** heatmap margin calculator — unchanged */
function heatmapLeftMarginPx(): number {
  const maxChars = HEATMAP_FUNCTION_AXIS_IDS.reduce(
    (m, id) => Math.max(m, id.length),
    0,
  );
  return Math.min(320, Math.max(180, Math.ceil(maxChars * 7.5) + 52));
}

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

  const transformedData = HEATMAP_MATRIX_DATA.map((row) => ({
    id: row.function,
    data: HEATMAP_IMPACT_KEYS.map((key) => ({
      x: key,
      y: row[key],
    })),
  }));

  return (
    <div className="cia-heatmap-page">
      {/* ✅ HEATMAP CARD — unchanged */}
      <section
        className="cia-heatmap-card card"
        aria-label="Impact heatmap chart"
      >
        <div className="cia-heatmap-card-head">
          <div>
            <h2 className="engagement-section-title cia-heatmap-card-title">
              Engagement Impact Heatmap
            </h2>
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

        <div className="cia-heatmap-chart-wrap">
          <ResponsiveHeatMap
            data={transformedData}
            margin={{
              top: 72,
              right: 28,
              bottom: 52,
              left: heatmapLeftMarginPx(),
            }}
            valueFormat=">-.0f"
            axisTop={{
              tickRotation: 0,
              tickSize: 0,
              tickPadding: 12,
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 14,
              tickValues: HEATMAP_FUNCTION_AXIS_IDS,
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
            borderColor={{ from: "color", modifiers: [["darker", 0.15]] }}
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
