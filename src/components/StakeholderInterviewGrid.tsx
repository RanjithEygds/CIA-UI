import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchStakeholderInterviewSummary,
  formatInterviewDuration,
  type InterviewStakeholderSummaryRow,
} from '../api/interviews';
import { DEMO_STAKEHOLDER_SUMMARY_ROWS } from '../data/demoStakeholderInterviews';
import './StakeholderInterviewGrid.css';

type Props = {
  engagementId: string;
  /** When true, use bundled demo rows (mock All CIAs id `1`). */
  useDemoData: boolean;
  returnPath: string;
};

function statusPillClass(label: string): string {
  if (label === 'Completed') return 'stakeholder-pill stakeholder-pill--completed';
  if (label === 'In Progress') return 'stakeholder-pill stakeholder-pill--progress';
  return 'stakeholder-pill stakeholder-pill--not-started';
}

function sentimentPillClass(sentiment: string): string {
  if (sentiment === 'Positive') return 'stakeholder-pill stakeholder-pill--positive';
  if (sentiment === 'Negative') return 'stakeholder-pill stakeholder-pill--negative';
  if (sentiment === 'Neutral') return 'stakeholder-pill stakeholder-pill--neutral';
  return 'stakeholder-pill stakeholder-pill--na';
}

export default function StakeholderInterviewGrid({
  engagementId,
  useDemoData,
  returnPath,
}: Props) {
  const [rows, setRows] = useState<InterviewStakeholderSummaryRow[]>([]);
  const [loading, setLoading] = useState(!useDemoData);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (useDemoData) {
      setRows(DEMO_STAKEHOLDER_SUMMARY_ROWS);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStakeholderInterviewSummary(engagementId);
      setRows(data.rows);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Could not load interviews.');
    } finally {
      setLoading(false);
    }
  }, [engagementId, useDemoData]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      className="engagement-section card interview-grid-card stakeholder-interview-section"
      aria-labelledby="stakeholder-interview-grid-heading"
    >
      <h2 id="stakeholder-interview-grid-heading" className="engagement-section-title">
        Stakeholder Interview Summary
      </h2>
      <p className="stakeholder-interview-desc">
        Track interview progress, sentiment, and responses. Expand a row for a quick summary or open the full
        transcript.
      </p>

      {loading && <p className="stakeholder-interview-loading">Loading stakeholders…</p>}
      {!loading && error && <p className="stakeholder-interview-empty">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="stakeholder-interview-empty">No stakeholder interviews for this engagement yet.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="stakeholder-interview-table-wrap">
          <div className="stakeholder-interview-row" style={{ boxShadow: 'none', transform: 'none' }}>
            <div
              className="stakeholder-interview-row-main"
              style={{ cursor: 'default', pointerEvents: 'none' }}
            >
              <span className="stakeholder-interview-cell--name stakeholder-interview-preview-label">
                Stakeholder name
              </span>
              <span className="stakeholder-interview-preview-label">Status</span>
              <span className="stakeholder-interview-preview-label">Sentiment</span>
              <span className="stakeholder-interview-preview-label" style={{ textAlign: 'right' }}>
                Actions
              </span>
            </div>
          </div>

          {rows.map((row) => {
            const expanded = expandedId === row.interview_id;
            return (
              <div key={row.interview_id} className="stakeholder-interview-row">
                <button
                  type="button"
                  className="stakeholder-interview-row-main"
                  onClick={() => toggleExpand(row.interview_id)}
                  aria-expanded={expanded}
                >
                  <span className="stakeholder-interview-cell--name">{row.stakeholder_name}</span>
                  <span className="stakeholder-interview-cell--meta">
                    <span className={statusPillClass(row.status_label)}>{row.status_label}</span>
                  </span>
                  <span className="stakeholder-interview-cell--meta">
                    <span className={sentimentPillClass(row.sentiment)}>{row.sentiment}</span>
                  </span>
                  <span
                    className="stakeholder-interview-cell--meta stakeholder-interview-cell--actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="stakeholder-interview-actions-inner">
                      <Link
                        className="btn-stakeholder-view"
                        to={`/stakeholder/${encodeURIComponent(row.interview_id)}/responses`}
                        state={{ returnTo: returnPath }}
                      >
                        View Response
                      </Link>
                      <span className="stakeholder-interview-expand-icon" aria-hidden="true">
                        {expanded ? '▲' : '▼'}
                      </span>
                    </span>
                  </span>
                </button>

                {expanded && (
                  <div className="stakeholder-interview-expand-panel">
                    <div className="stakeholder-interview-preview-grid">
                      <div>
                        <div className="stakeholder-interview-preview-label">Sentiment</div>
                        <div>{row.sentiment}</div>
                      </div>
                      <div>
                        <div className="stakeholder-interview-preview-label">Duration</div>
                        <div>{formatInterviewDuration(row.duration_seconds ?? null)}</div>
                      </div>
                      <div>
                        <div className="stakeholder-interview-preview-label">Questions answered</div>
                        <div>
                          {row.questions_answered}
                          {row.total_questions > 0 ? ` / ${row.total_questions}` : ''}
                        </div>
                      </div>
                    </div>
                    {row.summary_preview ? (
                      <div style={{ marginTop: '0.65rem' }}>
                        <div className="stakeholder-interview-preview-label">Quick summary</div>
                        <p className="stakeholder-interview-preview-summary">{row.summary_preview}</p>
                      </div>
                    ) : (
                      <p className="stakeholder-interview-preview-summary" style={{ marginTop: '0.65rem' }}>
                        No summary yet for this interview.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
