import { ResponsiveHeatMap } from '@nivo/heatmap';
import type { ComputedCell, TooltipProps } from '@nivo/heatmap';
import './ChangeImpactHeatmap.css';

type ImpactKey = 'People' | 'Process' | 'Technology' | 'Organization';

type HeatMapRow = {
  function: string;
} & Record<ImpactKey, number>;

export const HEATMAP_IMPACT_KEYS: ImpactKey[] = ['People', 'Process', 'Technology', 'Organization'];

const IMPACT_LABELS: Record<number, string> = {
  0: 'No change',
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

/** Sidebar-aligned blues: same family as nav bar `--color-secondary` (#2d3561) */
const SEVERITY_BLUE: Record<number, string> = {
  0: '#e8eaf3',
  1: '#b4bdd8',
  2: '#6f7c9e',
  3: '#2d3561',
};

/** Demo data: 0 = none, 1 = low, 2 = medium, 3 = high */
export const HEATMAP_MATRIX_DATA: HeatMapRow[] = [
  { function: 'HR', People: 3, Process: 2, Technology: 1, Organization: 2 },
  { function: 'Finance', People: 2, Process: 3, Technology: 2, Organization: 1 },
  { function: 'IT', People: 1, Process: 2, Technology: 3, Organization: 2 },
  { function: 'Operations', People: 2, Process: 3, Technology: 2, Organization: 3 },
  { function: 'Sales', People: 2, Process: 1, Technology: 2, Organization: 1 },
];

function cellFill(cell: Omit<ComputedCell<{ x: string; y?: number | null }>, 'color' | 'opacity' | 'borderColor' | 'labelTextColor'>): string {
  const v = cell.value;
  if (v === 0 || v === 1 || v === 2 || v === 3) return SEVERITY_BLUE[v];
  return '#ffffff';
}

function HeatMapTooltip({ cell }: TooltipProps<{ x: string; y?: number | null }>) {
  const v = cell.value ?? 0;
  const label = IMPACT_LABELS[v] ?? '—';
  const xLabel = typeof cell.data.x === 'string' ? cell.data.x : String(cell.data.x);
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
        <div className="cia-heatmap-tooltip-value">Score {cell.formattedValue}</div>
      )}
    </div>
  );
}

const legendItems: { level: number; label: string }[] = [
  { level: 0, label: 'No change' },
  { level: 1, label: 'Low' },
  { level: 2, label: 'Medium' },
  { level: 3, label: 'High' },
];

export default function ChangeImpactHeatmap() {
  const transformedData = HEATMAP_MATRIX_DATA.map((row) => ({
    id: row.function,
    data: HEATMAP_IMPACT_KEYS.map((key) => ({
      x: key,
      y: row[key],
    })),
  }));

  const highCells = HEATMAP_MATRIX_DATA.reduce((acc, row) => {
    HEATMAP_IMPACT_KEYS.forEach((k) => {
      if (row[k] >= 3) acc += 1;
    });
    return acc;
  }, 0);

  return (
    <div className="cia-heatmap-page">
      <header className="cia-heatmap-hero">
        <p className="cia-heatmap-kicker">Executive view</p>
        <h1 className="cia-heatmap-title">Change Impact Heatmap</h1>
        <p className="cia-heatmap-lead">
          Cross-functional snapshot across People, Process, Technology, and Organization. Values are
          illustrative for demo purposes.
        </p>
        <div className="cia-heatmap-meta">
          <span className="cia-heatmap-pill">{HEATMAP_MATRIX_DATA.length} functions</span>
          <span className="cia-heatmap-pill">{HEATMAP_IMPACT_KEYS.length} dimensions</span>
          <span className="cia-heatmap-pill cia-heatmap-pill-accent">{highCells} high-impact cells</span>
        </div>
      </header>

      <section className="cia-heatmap-card card" aria-label="Impact heatmap chart">
        <div className="cia-heatmap-card-head">
          <div>
            <h2 className="cia-heatmap-card-title">Impact matrix</h2>
            <p className="cia-heatmap-card-sub">Hover a cell for function, dimension, and severity.</p>
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

        <div className="cia-heatmap-chart-wrap">
          <ResponsiveHeatMap
            data={transformedData}
            margin={{ top: 72, right: 24, bottom: 48, left: 100 }}
            valueFormat=">-.0f"
            axisTop={{
              tickRotation: 0,
              tickSize: 0,
              tickPadding: 12,
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 10,
            }}
            theme={{
              background: 'transparent',
              text: {
                fill: 'var(--color-text)',
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
              },
              axis: {
                ticks: {
                  text: {
                    fill: 'var(--color-text-muted)',
                    fontSize: 11,
                    fontWeight: 500,
                  },
                },
              },
            }}
            colors={cellFill}
            emptyColor="#ffffff"
            borderWidth={1}
            borderColor={{ from: 'color', modifiers: [['darker', 0.15]] }}
            borderRadius={0}
            labelTextColor={(cell) => (cell.value === 3 ? '#ffffff' : '#1a2332')}
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
    </div>
  );
}
