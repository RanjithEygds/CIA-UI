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
  requires_followup: boolean; // backend sends this flag
  readback?: string | null; // may appear at end of section
  stay_on_question?: false; // explicitly FALSE or omitted
};

export type AnswerClarified = {
  status: "clarification";
  bot_reply: string; // what bot says to clarify the question
  stay_on_question: true; // important: UI must not advance
};

export type AnswerFollowup = {
  status: "followup";
  bot_reply: string; // follow-up probe
  stay_on_question: true; // important: UI must not advance
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

export type TranscriptRow = {
  question_id: string;
  section: string;
  question_text: string;
  answer_text: string;
};

export interface InterviewTranscript {
  interview_id: string;
  engagement_id: string;
  engagement_name: string | null;
  stakeholder_name: string;
  stakeholder_email: string | null;
  status: string; // "completed", "ended", or "in_progress"
  transcript: TranscriptRow[];
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
  section_index?: number;
  sequence_in_section?: number;
};

export type SubmitAnswerRequest = {
  question_id: string;
  answer_text: string;
};

export type EndInterviewResponse = {
  status: "completed";
  final_summary?: string; // optional if backend returns it
};

export type ExtendInterviewSessionRequest = {
  stakeholder_name: string;
  stakeholder_email?: string;
  extend_minutes: number;
};

export type ExtendInterviewSessionResponse = {
  status: "extended";
  interview_id: string;
  total_extended_minutes: number;
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

export type SseFirstIntroHandlers = {
  onBeginPart?: (part: string) => void;
  onDelta: (text: string) => void;
  onDone: (contextBrief: string) => void;
  onError?: (message: string) => void;
};

export type SseAnswerStreamHandlers = {
  onBeginPart?: (part: string) => void;
  onDelta: (text: string) => void;
  onDone: (payload: AnswerStreamDonePayload) => void;
  onError?: (message: string) => void;
};

export type InterviewSectionRow = {
  section_index: number;
  section_title: string;
  total_questions: number;
  answered: number;
  remaining: number;
  completed: boolean;
};

export type InterviewSectionsResponse = {
  interview_id: string;
  engagement_id: string;
  sections: InterviewSectionRow[];
};

export type AnswerStreamDonePayload = {
  result: SubmitAnswerResponse;
  next_question: NextQuestionResponse | null;
  interview_completed: boolean;
};

function takeNextSseBlock(carry: string): {
  rest: string;
  block: string | null;
} {
  const lf = carry.indexOf("\n\n");
  const crlf = carry.indexOf("\r\n\r\n");
  let sep = -1;
  let skip = 2;
  if (lf >= 0 && (crlf < 0 || lf <= crlf)) {
    sep = lf;
    skip = 2;
  } else if (crlf >= 0) {
    sep = crlf;
    skip = 4;
  }
  if (sep < 0) return { rest: carry, block: null };
  const block = carry.slice(0, sep);
  const rest = carry.slice(sep + skip);
  return { rest, block };
}

async function consumeInterviewSse(
  path: string,
  body: unknown,
  handlers: {
    onBeginPart?: (part: string) => void;
    onDelta: (text: string) => void;
    onDone: (data: Record<string, unknown>) => void;
    onError?: (message: string) => void;
  },
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status} ${res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let carry = "";

  const processBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }
      const typ = data.type as string;
      if (typ === "begin_part" && typeof data.part === "string") {
        handlers.onBeginPart?.(data.part);
      }
      if (typ === "delta" && typeof data.text === "string") {
        handlers.onDelta(data.text);
      }
      if (typ === "done") {
        handlers.onDone(data);
      }
      if (typ === "error") {
        handlers.onError?.(String(data.message ?? "Stream error"));
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    let next: ReturnType<typeof takeNextSseBlock>;
    while ((next = takeNextSseBlock(carry)).block !== null) {
      carry = next.rest;
      processBlock(next.block);
    }
  }

  if (carry.trim()) {
    processBlock(carry);
  }
}

/**
 * SSE stream for contextual intro (token stream from LLM + fallbacks).
 */
export async function firstIntroStream(
  interviewId: string,
  brief: string | null | undefined,
  handlers: SseFirstIntroHandlers,
): Promise<void> {
  await consumeInterviewSse(
    `/interviews/${encodeURIComponent(interviewId)}/first/stream`,
    { brief: brief ?? null } as FirstIntroRequest,
    {
      onBeginPart: handlers.onBeginPart,
      onDelta: handlers.onDelta,
      onDone: (data) => {
        const briefOut =
          typeof data.context_brief === "string" ? data.context_brief : "";
        handlers.onDone(briefOut);
      },
      onError: handlers.onError,
    },
  );
}

export async function submitAnswerStream(
  interviewId: string,
  payload: SubmitAnswerRequest,
  handlers: SseAnswerStreamHandlers,
): Promise<void> {
  await consumeInterviewSse(
    `/interviews/${encodeURIComponent(interviewId)}/answer/stream`,
    payload,
    {
      onBeginPart: handlers.onBeginPart,
      onDelta: handlers.onDelta,
      onDone: (data) => {
        const result = data.result as SubmitAnswerResponse;
        const next_question = (data.next_question ??
          null) as NextQuestionResponse | null;
        const interview_completed = data.interview_completed === true;
        handlers.onDone({
          result,
          next_question,
          interview_completed,
        });
      },
      onError: handlers.onError,
    },
  );
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
  payload: { question_id: string; answer_text: string },
): Promise<SubmitAnswerResponse> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/answer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
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

export async function extendInterviewSession(
  payload: ExtendInterviewSessionRequest,
): Promise<ExtendInterviewSessionResponse> {
  const res = await fetch(`${API_BASE}/interviews/extend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return okJson<ExtendInterviewSessionResponse>(res);
}

export async function getTranscript(
  interviewId: string,
): Promise<InterviewTranscript> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/transcript`,
  );

  return res.json();
}

export type InterviewStakeholderSummaryRow = {
  interview_id: string;
  stakeholder_name: string;
  stakeholder_email?: string | null;
  status: string;
  status_label: string;
  sentiment: string;
  duration_seconds?: number | null;
  questions_answered: number;
  total_questions: number;
  summary_preview?: string | null;
};

export type EngagementInterviewGridResponse = {
  engagement_id: string;
  rows: InterviewStakeholderSummaryRow[];
};

export type InterviewResponseTurn = {
  question_text: string;
  answer_text: string;
  timestamp_utc?: string | null;
  section?: string | null;
};

export type InterviewResponsesDetailOut = {
  interview_id: string;
  stakeholder_name: string;
  stakeholder_email?: string | null;
  status: string;
  sentiment: string;
  duration_seconds?: number | null;
  interview_date?: string | null;
  final_summary?: string | null;
  questions: InterviewResponseTurn[];
};

export async function fetchStakeholderInterviewSummary(
  engagementId: string,
): Promise<EngagementInterviewGridResponse> {
  const res = await fetch(
    `${API_BASE}/interviews/by-engagement/${encodeURIComponent(engagementId)}/stakeholder-summary`,
  );
  return okJson<EngagementInterviewGridResponse>(res);
}

export async function fetchInterviewResponsesDetail(
  interviewId: string,
): Promise<InterviewResponsesDetailOut> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/responses-detail`,
  );
  return okJson<InterviewResponsesDetailOut>(res);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelyEngagementUuid(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export function formatInterviewDuration(
  seconds: number | null | undefined,
): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m ${rem}s`;
  }
  if (m === 0) return `${rem}s`;
  return `${m}m ${rem}s`;
}

export async function getInterviewSections(
  interviewId: string,
): Promise<InterviewSectionsResponse> {
  const res = await fetch(
    `${API_BASE}/interviews/${encodeURIComponent(interviewId)}/sections`,
    { method: "GET" },
  );

  return okJson<InterviewSectionsResponse>(res);
}
