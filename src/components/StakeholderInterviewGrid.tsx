import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { type InterviewStakeholderSummaryRow } from "../api/interviews";

import {
  getEngagementTranscripts,
  type EngagementTranscriptsResponse,
} from "../api/engagements";

import "./StakeholderInterviewGrid.css";

type Props = {
  engagementId: string;
  useDemoData: boolean;
  returnPath: string;
  headerAction?: ReactNode;
};

function statusPillClass(label: string): string {
  if (label === "Completed")
    return "stakeholder-pill stakeholder-pill--completed";
  if (label === "In Progress")
    return "stakeholder-pill stakeholder-pill--progress";
  return "stakeholder-pill stakeholder-pill--not-started";
}

function sentimentPillClass(sentiment: string): string {
  if (sentiment === "Positive")
    return "stakeholder-pill stakeholder-pill--positive";
  if (sentiment === "Negative")
    return "stakeholder-pill stakeholder-pill--negative";
  if (sentiment === "Neutral")
    return "stakeholder-pill stakeholder-pill--neutral";
  return "stakeholder-pill stakeholder-pill--na";
}

export default function StakeholderInterviewGrid({
  engagementId,
  useDemoData,
  returnPath,
  headerAction,
}: Props) {
  const [rows, setRows] = useState<InterviewStakeholderSummaryRow[]>([]);
  const [loading, setLoading] = useState(!useDemoData);
  const [error, setError] = useState<string | null>(null);

  /**
   * ✅ NEW: Load real transcripts from backend
   * We convert transcript rows → summary rows expected by existing UI.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data: EngagementTranscriptsResponse =
        await getEngagementTranscripts(engagementId);

      const interviews = data.completed_interviews;
      console.log("Loaded interviews:", interviews);
      
      // ✅ Handle: no completed interviews
      if (!interviews || interviews.length === 0) {
        setRows([]);
        setError("No stakeholder interviews for this engagement yet.");
        setLoading(false);
        return;
      }

      // ✅ Map transcript interviews into UI summary structure
      const mapped: InterviewStakeholderSummaryRow[] = interviews.map((iv) => {
        const answered = iv.transcript?.length ?? 0;

        const summary_preview =
          answered > 0
            ? iv.transcript
                .slice(0, 2)
                .map((t) => t.answer_text.trim())
                .join(" ")
            : null;

        return {
          interview_id: iv.interview_id,
          stakeholder_name: iv.stakeholder_name,

          // ✅ REQUIRED BY TS INTERFACE
          status: "completed",

          // ✅ Existing field used by the UI for the pill
          status_label: "Completed",

          // ✅ Backend provides no sentiment → fallback
          sentiment: "N/A",

          duration_seconds: null,

          questions_answered: answered,
          total_questions: answered,

          summary_preview,
        };
      });

      setRows(mapped);
    } catch (e) {
      console.error(e);
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not load interviews.");
    } finally {
      setLoading(false);
    }
  }, [engagementId, useDemoData]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="engagement-section card interview-grid-card stakeholder-interview-section"
      aria-labelledby="stakeholder-interview-grid-heading"
    >
      <div className="interview-grid-header-row">
        <h2
          id="stakeholder-interview-grid-heading"
          className="engagement-section-title"
        >
          Stakeholder Interview Summary
        </h2>
        {headerAction}
      </div>
      <p className="stakeholder-interview-desc">
        Track interview progress, sentiment, and responses. Expand a row for a
        quick summary or open the full transcript.
      </p>

      {loading && (
        <p className="stakeholder-interview-loading">Loading stakeholders…</p>
      )}

      {!loading && error && (
        <p className="stakeholder-interview-empty">{error}</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="stakeholder-interview-empty">
          No stakeholder interviews for this engagement yet.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="stakeholder-interview-table-wrap">
          <div
            className="stakeholder-interview-row"
            style={{ boxShadow: "none", transform: "none" }}
          >
            <div
              className="stakeholder-interview-row-main"
              style={{ cursor: "default", pointerEvents: "none" }}
            >
              <span className="stakeholder-interview-cell--name stakeholder-interview-preview-label">
                Stakeholder name
              </span>
              <span className="stakeholder-interview-preview-label">
                Status
              </span>
              <span className="stakeholder-interview-preview-label">
                Sentiment
              </span>
              <span
                className="stakeholder-interview-preview-label"
                style={{ textAlign: "right" }}
              >
                Actions
              </span>
            </div>
          </div>

          {rows.map((row) => {
            return (
              <div key={row.interview_id} className="stakeholder-interview-row">
                <button
                  type="button"
                  className="stakeholder-interview-row-main"
                >
                  <span className="stakeholder-interview-cell--name">
                    {row.stakeholder_name}
                  </span>

                  <span className="stakeholder-interview-cell--meta">
                    <span className={statusPillClass(row.status_label)}>
                      {row.status_label}
                    </span>
                  </span>

                  <span className="stakeholder-interview-cell--meta">
                    <span className={sentimentPillClass(row.sentiment)}>
                      {row.sentiment}
                    </span>
                  </span>

                  <span
                    className="stakeholder-interview-cell--meta stakeholder-interview-cell--actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="stakeholder-interview-actions-inner">
                      <Link
                        className="btn-stakeholder-view"
                        to={`/stakeholder/${encodeURIComponent(
                          row.interview_id,
                        )}`}
                        state={{ returnTo: returnPath }}
                      >
                        View Response
                      </Link>
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
