// --- Add these types ---
export type ClarificationResponse = {
  status: "clarification";
  bot_reply: string;
  stay_on_question: true;
};

export type FollowupResponse = {
  status: "followup";
  bot_reply: string;
  stay_on_question: true;
};

export type RecordedResponse = {
  status: "recorded";
  stay_on_question: false;
  readback?: string | null;
  reason?: string | null; // e.g., "max_followups_reached"
};

export type AnswerRecorded = {
  reason?: string;
  status: "recorded";
  requires_followup: boolean;        // backend sends this flag
  readback?: string | null;          // may appear at end of section
  stay_on_question?: false;          // explicitly FALSE or omitted
};

export type AnswerClarified = {
  status: "clarification";
  bot_reply: string;                 // what bot says to clarify the question
  stay_on_question: true;            // important: UI must not advance
};

export type AnswerFollowup = {
  status: "followup";
  bot_reply: string;                 // follow-up probe
  stay_on_question: true;            // important: UI must not advance
};

export type SubmitAnswerResponse =
  | AnswerRecorded
  | AnswerClarified
  | AnswerFollowup;


export type StartInterviewRequest = {
  engagement_id: string;
  stakeholder_name: string;
  stakeholder_email: string;
};

export interface TranscriptResponse {
  interview_id: string;
  consent_captured: boolean;
  transcript: string;
}

export type StartInterviewResponse = {
  interview_id: string;
  engagement_id: string;
  status: "in_progress" | "created" | "completed" | "ended";
};

export type FirstIntroRequest = {
  brief?: string | null;
};

export type FirstIntroResponse = {
  context_brief: string;
};

export type NextQuestionResponse = {
  question_id: string;
  section: string;
  question_text: string;
};

export type SubmitAnswerRequest = {
  question_id: string;
  answer_text: string;
};

export type EndInterviewResponse = {
  status: "completed";
  final_summary?: string; // optional if backend returns it
};

const API_BASE = import.meta.env.VITE_CIMMIE_API_URL ?? "http://localhost:8000";

async function okJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `HTTP ${res.status} ${res.statusText}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Non-JSON response from API.");
  }
}

export async function startInterview(
  payload: StartInterviewRequest,
): Promise<StartInterviewResponse> {
  const res = await fetch(`${API_BASE}/interviews/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return okJson<StartInterviewResponse>(res);
}

export async function firstIntro(
  interviewId: string,
  brief?: string | null,
): Promise<FirstIntroResponse> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/first`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: brief ?? null } as FirstIntroRequest),
    },
  );
  return okJson<FirstIntroResponse>(res);
}

export async function getNextQuestion(
  interviewId: string,
): Promise<NextQuestionResponse> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/next`,
    {
      method: "POST",
    },
  );
  return okJson<NextQuestionResponse>(res);
}

// --- Ensure submitAnswer returns the typed response ---

export async function submitAnswer(
  interviewId: string,
  payload: { question_id: string; answer_text: string }
): Promise<SubmitAnswerResponse> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/answer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  return okJson<SubmitAnswerResponse>(res);
}

export async function endInterview(
  interviewId: string,
): Promise<EndInterviewResponse> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/end`,
    {
      method: "POST",
    },
  );
  return okJson<EndInterviewResponse>(res);
}

export async function getTranscript(
  interviewId: string,
): Promise<TranscriptResponse> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/transcript`,
  );

  return res.json();
}
