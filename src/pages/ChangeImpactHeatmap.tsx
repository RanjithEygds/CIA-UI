import { ResponsiveHeatMap } from "@nivo/heatmap";
import type { ComputedCell, TooltipProps } from "@nivo/heatmap";
import "./ChangeImpactHeatmap.css";

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

const IMPACT_LABELS: Record<number, string> = {
  0: "No change",
  1: "Low",
  2: "Medium",
  3: "High",
};

/** Sidebar-aligned blues: same family as nav bar `--color-secondary` (#2d3561) */
const SEVERITY_BLUE: Record<number, string> = {
  0: "#e8eaf3",
  1: "#b4bdd8",
  2: "#6f7c9e",
  3: "#2d3561",
};

/** Demo data: 0 = none, 1 = low, 2 = medium, 3 = high */
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

/** Row labels on the heatmap Y-axis (matches each row's `function`). */
const HEATMAP_FUNCTION_AXIS_IDS = HEATMAP_MATRIX_DATA.map(
  (row) => row.function,
);

function heatmapLeftMarginPx(): number {
  const maxChars = HEATMAP_FUNCTION_AXIS_IDS.reduce(
    (m, id) => Math.max(m, id.length),
    0,
  );
  /* Room for end-anchored tick text (~7.5px/char at 12px) + padding inside SVG margin */
  return Math.min(320, Math.max(180, Math.ceil(maxChars * 7.5) + 52));
}

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

/** Point-wise summary aligned with heatmap narrative (demo copy). */
const HEATMAP_KEY_FINDINGS: string[] = [
  "The heatmap analysis indicates a moderate to high change impact, primarily driven by People and Organizational dimensions across all functions. Stakeholders broadly recognize the need for change and perceive it as necessary and beneficial, resulting in a cautiously optimistic overall sentiment.",
  "People impact is consistently high, signaling strong awareness of role changes and a clear expectation for enablement through communication, training, and support. This reflects a sentiment of engagement rather than resistance.",
  "Process impacts are moderate, suggesting that while workflows will evolve, the change is viewed as manageable and structured. Stakeholders expect improvement without significant disruption.",
  "Technology impact remains low to moderate, indicating minimal anxiety around system changes. Technology is largely perceived as an enabler rather than a source of disruption.",
  "Organizational impact is notable, particularly among Senior Leaders and core operational teams, highlighting the importance of leadership alignment, governance, and clear communication throughout the transition.",
];

/** Closing executive summary — shown in a separate callout below the bullet list. */
const HEATMAP_FINDINGS_CLOSING_SUMMARY =
  "The perceived sentiment across all fields is cautiously positive, with confidence in the change direction, a strong people focus, manageable process evolution, and limited technology-related concern. Successful adoption will depend on sustained leadership engagement and targeted people-centric change interventions.";

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
  const transformedData = HEATMAP_MATRIX_DATA.map((row) => ({
    id: row.function,
    data: HEATMAP_IMPACT_KEYS.map((key) => ({
      x: key,
      y: row[key],
    })),
  }));

  return (
    <div className="cia-heatmap-page">
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
        {onExportPpt && (
          <div className="cia-heatmap-card-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onExportPpt}
            >
              Export Heatmap to PPT
            </button>
          </div>
        )}

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

      <section
        className="cia-heatmap-findings card"
        aria-labelledby="heatmap-key-findings-heading"
      >
        <h2
          id="heatmap-key-findings-heading"
          className="cia-heatmap-findings-title"
        >
          Summary of key findings
        </h2>
        <ul className="cia-heatmap-findings-list">
          {HEATMAP_KEY_FINDINGS.map((text, index) => (
            <li key={index} className="cia-heatmap-findings-item">
              <KeyFindingCheckIcon />
              <p className="cia-heatmap-findings-text">{text}</p>
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
            {HEATMAP_FINDINGS_CLOSING_SUMMARY}
          </p>
        </div>
      </section>
    </div>
  );
}
