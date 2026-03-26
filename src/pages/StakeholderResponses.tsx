import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { type InterviewResponsesDetailOut } from "../api/interviews";
import { getTranscript, type InterviewTranscript } from "../api/interviews";
import "./StakeholderResponses.css";
import * as XLSX from "xlsx";

function safeFilenamePart(s: string): string {
  return (
    s
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60) || "transcript"
  );
}

export default function StakeholderResponses() {
  const { stakeholderId } = useParams<{ stakeholderId: string }>();
  const location = useLocation();
  const returnTo =
    (location.state as { returnTo?: string } | null)?.returnTo ?? "/all-cias";

  const [detail, setDetail] = useState<InterviewResponsesDetailOut | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});

  /**
   * ✅ Replace backend load logic to use getTranscript()
   */
  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      // ✅ Fetch from new backend endpoint
      const transcript: InterviewTranscript = await getTranscript(id);

      // ✅ Map transcript → UI response shape
      const mapped: InterviewResponsesDetailOut = {
        interview_id: transcript.interview_id,
        stakeholder_name: transcript.stakeholder_name,
        stakeholder_email: transcript.stakeholder_email,
        status: "completed",

        sentiment: "N/A", // backend does not provide sentiment yet
        duration_seconds: null, // backend lacks duration
        interview_date: null, // backend does not provide timestamp
        final_summary: null, // backend does not provide readback/summary

        questions: transcript.transcript.map((row) => ({
          question_text: row.question_text,
          answer_text: row.answer_text,
          timestamp_utc: null, // backend doesn't provide
          section: row.section,
        })),
      };

      setDetail(mapped);
    } catch (e: any) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "Could not load transcript.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!stakeholderId) {
      setError("Missing interview id.");
      setLoading(false);
      return;
    }
    void load(stakeholderId);
  }, [stakeholderId, load]);

  useEffect(() => {
    if (!detail?.questions.length) {
      setOpenMap({});
      return;
    }
    const init: Record<number, boolean> = {};
    detail.questions.forEach((_, i) => {
      init[i] = true;
    });
    setOpenMap(init);
  }, [detail?.interview_id]);

  const filteredQuestions = useMemo(() => {
    if (!detail) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return detail.questions.map((item, index) => ({ item, index }));
    return detail.questions
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          item.question_text.toLowerCase().includes(q) ||
          (item.answer_text || "").toLowerCase().includes(q),
      );
  }, [detail, filter]);

  const handleExport = () => {
    if (!detail) return;

    // 1. Build rows for Excel
    const rows = detail.questions.map((q, index) => ({
      InterviewID: detail.interview_id,
      StakeholderName: detail.stakeholder_name,
      StakeholderEmail: detail.stakeholder_email ?? "",
      QuestionNumber: index + 1,
      Section: q.section ?? "",
      Question: q.question_text,
      Answer: q.answer_text ?? "",
    }));

    // 2. Create workbook + worksheet
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transcript");

    // 3. Export filename
    const datePart = (detail.interview_date || new Date().toISOString()).slice(
      0,
      10,
    );
    const name = safeFilenamePart(detail.stakeholder_name);

    const filename = `CIA_Transcript_${name}_${datePart}.xlsx`;

    // 4. Write file
    XLSX.writeFile(workbook, filename);
  };

  if (!stakeholderId) {
    return (
      <div className="stakeholder-responses-page">
        <p className="stakeholder-responses-not-found">Invalid link.</p>
        <Link to={returnTo} className="stakeholder-responses-back">
          ← Back
        </Link>
      </div>
    );
  }

  return (
    <div className="stakeholder-responses-page">
      <Link to={returnTo} className="stakeholder-responses-back">
        ← Back
      </Link>

      {loading && (
        <p className="stakeholder-responses-empty">Loading transcript…</p>
      )}
      {!loading && error && (
        <p className="stakeholder-responses-not-found">{error}</p>
      )}

      {!loading && detail && (
        <>
          <div className="card stakeholder-responses-header-card">
            <h1 className="stakeholder-responses-title">
              {detail.stakeholder_name}
            </h1>

            <div className="stakeholder-responses-toolbar">
              <input
                type="search"
                className="stakeholder-responses-search"
                placeholder="Search questions or answers…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter questions"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExport}
              >
                Export transcript
              </button>
            </div>

            {detail.final_summary && (
              <div style={{ marginTop: "0.85rem" }}>
                <h2 className="stakeholder-responses-subheading">
                  Interview summary
                </h2>
                <p className="stakeholder-responses-summary">
                  {detail.final_summary}
                </p>
              </div>
            )}
          </div>

          <div className="stakeholder-responses-scroll">
            {filteredQuestions.length === 0 && (
              <p className="stakeholder-responses-empty">
                {detail.questions.length === 0
                  ? "No responses recorded yet for this interview."
                  : "No questions match your search."}
              </p>
            )}

            {filteredQuestions.map(({ item, index }) => {
              const open = openMap[index] !== false;
              return (
                <div key={index} className="stakeholder-question-card">
                  <button
                    type="button"
                    className="stakeholder-question-toggle"
                    onClick={() =>
                      setOpenMap((m) => ({
                        ...m,
                        [index]: !open,
                      }))
                    }
                    aria-expanded={open}
                  >
                    <span
                      className="stakeholder-question-chevron"
                      aria-hidden="true"
                    >
                      {open ? "▲" : "▼"}
                    </span>
                    <span className="stakeholder-question-heading">
                      <div className="stakeholder-question-index">
                        Question {index + 1}
                      </div>
                      <p className="stakeholder-question-text">
                        {item.question_text}
                      </p>
                    </span>
                  </button>
                  {open && (
                    <div className="stakeholder-question-body">
                      {item.timestamp_utc && (
                        <div className="stakeholder-question-timestamp">
                          {new Date(item.timestamp_utc).toLocaleString()}
                        </div>
                      )}
                      <p className="stakeholder-question-answer">
                        {item.answer_text || "—"}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
