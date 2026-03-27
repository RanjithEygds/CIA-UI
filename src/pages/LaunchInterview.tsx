import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./LaunchInterview.css";

import {
  getStakeholders,
  type StakeholderWithInterview,
} from "../api/engagements";
import { extendInterviewSession } from "../api/interviews";

const COPY_FEEDBACK_MS = 2500;
const TOAST_DURATION_MS = 2500;
const EXTEND_MINUTES = 15;
const ACTIVE_STAKEHOLDER_KEY = "ciassist_active_stakeholder_id";
const INTERVIEW_EXTENSIONS_KEY = "ciassist_interview_extensions";

function statusClass(status?: string | null) {
  if (!status) return "status-queued";
  return `status-${status.toLowerCase().replace(/[\s_]+/g, "-")}`;
}

export default function LaunchInterview() {
  const navigate = useNavigate();
  const engagementId = sessionStorage.getItem("ciassist_engagement_id");

  const [stakeholders, setStakeholders] = useState<StakeholderWithInterview[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [initiatedStakeholderIds, setInitiatedStakeholderIds] = useState<
    Set<string>
  >(new Set());
  const [extendingInterviewIds, setExtendingInterviewIds] = useState<Set<string>>(
    new Set(),
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCopyToast, setShowCopyToast] = useState(false);

  useEffect(() => {
    if (!engagementId) return;

    async function load() {
      try {
        const data = await getStakeholders(engagementId ?? "");
        setStakeholders(data.stakeholders);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [engagementId]);

  function copyStakeholderLink(stakeholder: StakeholderWithInterview) {
    if (!stakeholder.interview_id) {
      alert("No interview ID assigned yet.");
      return;
    }

    const url = `${window.location.origin}/cimmie/${stakeholder.interview_id}`;
    navigator.clipboard.writeText(url);

    setCopiedId(stakeholder.stakeholder_id);
    setShowCopyToast(true);

    setTimeout(() => setCopiedId(null), COPY_FEEDBACK_MS);
    setTimeout(() => setShowCopyToast(false), TOAST_DURATION_MS);
  }

  function initiateSession(stakeholder: StakeholderWithInterview) {
    if (!stakeholder.interview_id) {
      alert("No interview session found for this stakeholder.");
      return;
    }
    setInitiatedStakeholderIds(
      (prev) => new Set([...prev, stakeholder.stakeholder_id]),
    );
    sessionStorage.setItem(ACTIVE_STAKEHOLDER_KEY, stakeholder.stakeholder_id);
    navigate(`/cimmie/${stakeholder.interview_id}`);
  }

  async function handleExtendSession(stakeholder: StakeholderWithInterview) {
    const interviewId = stakeholder.interview_id;
    if (!interviewId) return;

    const hasInitiated = initiatedStakeholderIds.has(stakeholder.stakeholder_id);
    if (!hasInitiated) return;

    setExtendingInterviewIds((prev) => new Set([...prev, interviewId]));
    try {
      const res = await extendInterviewSession({
        stakeholder_name: stakeholder.name,
        stakeholder_email: stakeholder.email ?? undefined,
        extend_minutes: EXTEND_MINUTES,
      });

      const raw = localStorage.getItem(INTERVIEW_EXTENSIONS_KEY);
      const parsed: Record<string, number> = raw ? JSON.parse(raw) : {};
      parsed[res.interview_id] = res.total_extended_minutes;
      localStorage.setItem(INTERVIEW_EXTENSIONS_KEY, JSON.stringify(parsed));
    } catch (err: any) {
      alert(err?.message || "Failed to extend session.");
    } finally {
      setExtendingInterviewIds((prev) => {
        const next = new Set(prev);
        next.delete(interviewId);
        return next;
      });
    }
  }

  return (
    <div className="launch-page">
      <header className="launch-header card">
        <div>
          <p className="launch-kicker">Interview Control Centre</p>
          <h1>Launch and Track Stakeholder Interviews</h1>
          <p>
            Manage interview access, track progress, and initiate sessions with
            stakeholders.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="stakeholder-header-row">
          <h2>Scheduled Stakeholder Interviews</h2>
          <span className="badge">{stakeholders.length} stakeholders</span>
        </div>

        {loading ? (
          <p>Loading stakeholders...</p>
        ) : (
          <table className="stakeholder-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Group</th>
                <th>Sub-Group</th>
                <th>Status</th>
                <th>Link</th>
                <th>Action</th>
                <th>Extend Session</th>
              </tr>
            </thead>

            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.stakeholder_id}>
                  <td>{s.name}</td>
                  <td>{s.email ?? "—"}</td>
                  <td>{s.role ?? "—"}</td>
                  <td>{s.department ?? "—"}</td>
                  <td>
                    <span
                      className={`status-chip ${statusClass(s.interview_status)}`}
                      aria-disabled="true"
                    >
                      {s.interview_status ?? "Unknown"}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-teal-blue compact ${
                        copiedId === s.stakeholder_id ? "copy-copied" : ""
                      }`}
                      type="button"
                      onClick={() => copyStakeholderLink(s)}
                      disabled={!s.interview_id}
                    >
                      {copiedId === s.stakeholder_id ? "Copied!" : "Copy Link"}
                    </button>
                  </td>

                  <td>
                    <button
                      className="btn btn-primary compact"
                      type="button"
                      disabled={!s.interview_id}
                      onClick={() => initiateSession(s)}
                    >
                      Initiate Session
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn btn-primary compact launch-extend-session-btn"
                      type="button"
                      disabled={
                        !s.interview_id ||
                        !initiatedStakeholderIds.has(s.stakeholder_id) ||
                        extendingInterviewIds.has(s.interview_id)
                      }
                      aria-disabled={
                        !s.interview_id ||
                        !initiatedStakeholderIds.has(s.stakeholder_id) ||
                        extendingInterviewIds.has(s.interview_id)
                      }
                      onClick={() => handleExtendSession(s)}
                    >
                      {extendingInterviewIds.has(s.interview_id ?? "")
                        ? "Extending..."
                        : "Extend Session"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="launch-actions">
        <div className="launch-actions-row">
          <Link className="btn btn-outline" to="/add-stakeholders">
            Back to Add Stakeholders
          </Link>
        </div>
      </footer>

      {showCopyToast && (
        <div className="copy-toast" role="status" aria-live="polite">
          Link copied!
        </div>
      )}
    </div>
  );
}
