export type CreateEngagementResp = {
  engagement_id: string;
  name?: string | null;
};

const BASE_URL = import.meta.env.VITE_CIMMIE_API_URL ?? "http://localhost:8000";

export interface EngagementListItem {
  id: string;
  name: string | null;
  summary: string | null;
  document_count: number;
  created_at: string | null;
}

export interface EngagementDetailsResponse {
  engagement_id: string;
  details: any; // you may type this later
  updated_at?: string;
}

export type EngagementDoc = {
  id: string; // UUID
  filename: string;
  size_bytes: number;
  category?: string | null;
};

export type EngagementSummaryResponse = {
  engagement_id: string; // UUID (string)
  name?: string | null;
  document_count: number;
  documents: EngagementDoc[];
  summary?: string | null; // Agent 1 preview summary
};

export type TypeOfChange = {
  current: string;
  future: string;
  description: string;
  confidence: "High" | "Medium" | "Low" | string;
};

export type ImpactGroup = {
  name: string;
  description?: string | null;
  confidence: "High" | "Medium" | "Low" | string;
};

export type Stakeholder = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  engagement_level?: string | null; // "Consulted" | "Engaged" | "Accountable" etc.
  source_document_id?: string | null;
};

export type EngagementContextOut = {
  change_brief: string;
  change_summary: string;
  impacted_groups: ImpactGroup[];
  type_of_change: TypeOfChange;
  stakeholders: Stakeholder[];
};

export type QuestionItem = {
  id: string;
  section_index: number;
  section: string;
  sequence_in_section: number;
  question_text: string;
  pillar: string | null;
  pillar_index?: number | null;
};

export type QuestionsPreviewResponse = {
  engagement_id: string;
  questions: QuestionItem[];
};

export type QuestionUpdatePayload = Partial<{
  section: string;
  section_index: number;
  pillar: string;
  pillar_index: number;
  question_text: string;
  sequence_in_section: number;
}>;

export type StakeholderWithInterview = {
  stakeholder_id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  engagement_level?: string | null;
  created_at?: string | null;

  interview_id?: string | null;
  interview_status?: string | null;
  interview_started_at?: string | null;
  interview_ended_at?: string | null;
};

export type StakeholderListResponse = {
  engagement_id: string;
  count: number;
  stakeholders: StakeholderWithInterview[];
};

export type CreateStakeholderResp = {
  status: string;
  stakeholder_id: string;
  interview_id: string;
  message: string;
};

export type DeleteStakeholderResponse = {
  status: string;
  stakeholder_id: string;
  engagement_id: string;
};

export type UpdateStakeholderPayload = Partial<{
  name: string;
  email: string;
  role: string;
  department: string;
  engagement_level: string;
}>;

export type UpdateStakeholderResponse = {
  status: string;
  stakeholder_id: string;
  engagement_id: string;
  updated: {
    name?: string;
    email?: string;
    role?: string;
    department?: string;
    engagement_level?: string;
  };
};

export type TranscriptRow = {
  question_id: string;
  section: string;
  question_text: string;
  answer_text: string;
};

export type InterviewTranscript = {
  interview_id: string;
  stakeholder_name: string;
  stakeholder_email: string | null;
  transcript: TranscriptRow[];
};

export type EngagementTranscriptsResponse = {
  engagement_id: string;
  engagement_name: string | null;
  completed_interviews: InterviewTranscript[];
};

export type EngagementInsightsResponse = {
  engagement_id: string;
  engagement_name: string | null;
  summary: string | null;
  key_findings: { text: string }[];
  cached: boolean;
  message?: string; // appears when no completed interviews
};

/** Throw on non-2xx with readable message */
async function okOrThrow(res: Response) {
  if (!res.ok) {
    let text = "";
    try {
      text = await res.text();
    } catch {}
    throw new Error(
      `${res.status} ${res.statusText}: ${text || "Request failed"}`,
    );
  }
  return res;
}

export async function getEngagements(): Promise<EngagementListItem[]> {
  const res = await fetch(`${BASE_URL}/engagements`);

  if (!res.ok) {
    throw new Error(`Failed to fetch engagements: ${res.status}`);
  }

  return res.json(); // backend returns raw array
}

/** Create a new engagement (optionally pass a name). */
export async function createEngagement(
  name?: string,
): Promise<CreateEngagementResp> {
  const body = name ? { name } : {};
  const res = await okOrThrow(
    await fetch(`${BASE_URL}/engagements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return res.json();
}

/**
 * Upload a single document with progress.
 * Uses XMLHttpRequest to access onprogress for uploads.
 */
export function uploadDocumentWithProgress(
  engagementId: string,
  file: File,
  opts?: {
    category?: string;
    name?: string;
    signal?: AbortSignal;
    onProgress?: (pct: number) => void; // 0..100
  },
): Promise<{
  id: string;
  filename: string;
  size_bytes: number;
  category?: string | null;
}> {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/documents`;
    const fd = new FormData();
    fd.append("file", file);
    if (opts?.category) fd.append("category", opts.category);
    if (opts?.name) fd.append("name", opts.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);

    if (opts?.signal) {
      const abortHandler = () => {
        try {
          xhr.abort();
        } catch {}
        reject(new DOMException("Upload aborted", "AbortError"));
      };
      opts.signal.addEventListener("abort", abortHandler, { once: true });
    }

    xhr.upload.onprogress = (e) => {
      if (!opts?.onProgress) return;
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        opts.onProgress(pct);
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json);
        } catch (err) {
          reject(new Error("Failed to parse upload response"));
        }
      } else {
        reject(
          new Error(
            `${xhr.status} ${xhr.statusText}: ${xhr.responseText || "Upload failed"}`,
          ),
        );
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}

/** Upload many files sequentially, reporting per-file and aggregate progress */
export async function uploadDocuments(
  engagementId: string,
  files: File[],
  opts?: {
    inferCategory?: (file: File) => string | undefined;
    onFileProgress?: (fileIndex: number, pct: number) => void;
    onOverallProgress?: (pct: number) => void;
    signal?: AbortSignal;
  },
) {
  const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0) || 1;
  let uploadedBytes = 0;

  const results: any[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let lastReported = 0;

    const category = opts?.inferCategory?.(f);
    // Track per-file progress and map to overall bytes
    await uploadDocumentWithProgress(engagementId, f, {
      category,
      name: f.name,
      signal: opts?.signal,
      onProgress: (pct) => {
        opts?.onFileProgress?.(i, pct);
        // Estimate bytes uploaded for this file
        const uploadedForFile = Math.round((pct / 100) * (f.size || 0));
        // Adjust global counter based on delta
        uploadedBytes += Math.max(0, uploadedForFile - lastReported);
        lastReported = uploadedForFile;
        const overallPct = Math.min(
          100,
          Math.round((uploadedBytes / totalBytes) * 100),
        );
        opts?.onOverallProgress?.(overallPct);
      },
    }).then((r) => results.push(r));
  }

  return results;
}

/** Get engagement summary (doc list + preview summary) */
export async function getEngagementSummary(engagementId: string) {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/summary`,
    ),
  );
  return res.json();
}

export async function getEngagementContext(engagementId: string) {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/context`,
    ),
  );
  return res.json();
}

export async function updateEngagementContext(
  engagementId: string,
  payload: Partial<{
    change_brief: string;
    change_summary: string[];
    impacted_groups: ImpactGroup[];
    type_of_change: TypeOfChange;
    stakeholders: { name: string; email: string }[];
  }>,
) {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/context`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  );

  return res.json();
}

export async function getEngagementDetails(
  engagementId: string,
): Promise<EngagementDetailsResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/details`,
    ),
  );
  return res.json();
}

export async function getQuestionsPreview(
  engagementId: string,
): Promise<QuestionsPreviewResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(
        engagementId,
      )}/questions/preview`,
    ),
  );
  const data = (await res.json()) as QuestionsPreviewResponse;
  return {
    ...data,
    questions: data.questions.map((q) => ({
      ...q,
      pillar: q.pillar ?? null,
    })),
  };
}

export type CreateQuestionPayload = {
  question_text: string;
};

export type CreateQuestionResponse = {
  status: string;
  engagement_id: string;
  question: {
    id: string;
    section: string;
    section_index: number;
    question_text: string;
    sequence_in_section: number;
  };
  questions: QuestionItem[];
};

export async function createQuestion(
  engagementId: string,
  payload: CreateQuestionPayload,
): Promise<CreateQuestionResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/questions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  );
  const data = (await res.json()) as CreateQuestionResponse;
  return {
    ...data,
    questions: data.questions.map((q) => ({
      ...q,
      pillar: q.pillar ?? null,
    })),
  };
}

export async function updateQuestion(
  engagementId: string,
  questionId: string,
  payload: QuestionUpdatePayload,
): Promise<any> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(
        engagementId,
      )}/questions/${encodeURIComponent(questionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  );

  return res.json();
}

export async function getStakeholders(
  engagementId: string,
): Promise<StakeholderListResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(
        engagementId,
      )}/stakeholders`,
    ),
  );
  return res.json();
}

export async function createStakeholderAndInterview(
  engagementId: string,
  payload: {
    name: string;
    email?: string;
    role?: string;
    department?: string;
    engagement_level?: string;
  },
): Promise<CreateStakeholderResp> {
  const fd = new FormData();
  fd.append("name", payload.name);
  if (payload.email) fd.append("email", payload.email);
  if (payload.role) fd.append("role", payload.role);
  if (payload.department) fd.append("department", payload.department);
  if (payload.engagement_level)
    fd.append("engagement_level", payload.engagement_level);

  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(
        engagementId,
      )}/stakeholders/manual`,
      {
        method: "POST",
        body: fd,
      },
    ),
  );

  return res.json();
}

export type DeleteQuestionResponse = {
  status: string;
  engagement_id: string;
  removed_id: string;
  questions: QuestionItem[];
};

export async function deleteQuestion(
  engagementId: string,
  questionId: string,
): Promise<DeleteQuestionResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(
        engagementId,
      )}/questions/${encodeURIComponent(questionId)}`,
      {
        method: "DELETE",
      },
    ),
  );
  const data = (await res.json()) as DeleteQuestionResponse;
  return {
    ...data,
    questions: data.questions.map((q) => ({
      ...q,
      pillar: q.pillar ?? null,
    })),
  };
}

export async function deleteStakeholder(
  engagementId: string,
  stakeholderId: string,
): Promise<DeleteStakeholderResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(
        engagementId,
      )}/stakeholders/${encodeURIComponent(stakeholderId)}`,
      {
        method: "DELETE",
      },
    ),
  );

  return res.json();
}

export async function updateStakeholder(
  engagementId: string,
  stakeholderId: string,
  payload: UpdateStakeholderPayload,
): Promise<UpdateStakeholderResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(
        engagementId,
      )}/stakeholders/${encodeURIComponent(stakeholderId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  );

  return res.json();
}

export async function getEngagementTranscripts(
  engagementId: string,
): Promise<EngagementTranscriptsResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/transcripts`,
    ),
  );

  return res.json();
}

export async function getEngagementInsights(
  engagementId: string,
): Promise<EngagementInsightsResponse> {
  const res = await okOrThrow(
    await fetch(
      `${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/insights`,
    ),
  );

  return res.json();
}
