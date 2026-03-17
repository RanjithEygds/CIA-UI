export type CreateEngagementResp = { engagement_id: string; name?: string | null };

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
  details: any;           // you may type this later
  updated_at?: string;
}

export type EngagementDoc = {
  id: string;             // UUID
  filename: string;
  size_bytes: number;
  category?: string | null;
};


export type EngagementSummaryResponse = {
  engagement_id: string;  // UUID (string)
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

/** Throw on non-2xx with readable message */
async function okOrThrow(res: Response) {
  if (!res.ok) {
    let text = "";
    try { text = await res.text(); } catch {}
    throw new Error(`${res.status} ${res.statusText}: ${text || "Request failed"}`);
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
export async function createEngagement(name?: string): Promise<CreateEngagementResp> {
  const body = name ? { name } : {};
  const res = await okOrThrow(
    await fetch(`${BASE_URL}/engagements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
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
  }
): Promise<{ id: string; filename: string; size_bytes: number; category?: string | null }> {
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
        try { xhr.abort(); } catch {}
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
        reject(new Error(`${xhr.status} ${xhr.statusText}: ${xhr.responseText || "Upload failed"}`));
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
  }
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
        const overallPct = Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
        opts?.onOverallProgress?.(overallPct);
      },
    }).then((r) => results.push(r));
  }

  return results;
}

/** Get engagement summary (doc list + preview summary) */
export async function getEngagementSummary(engagementId: string) {
  const res = await okOrThrow(
    await fetch(`${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/summary`)
  );
  return res.json();
}

export async function getEngagementContext(engagementId: string) {
  const res = await okOrThrow(
    await fetch(`${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/context`)
  );
  return res.json();
}


export async function getEngagementDetails(
  engagementId: string
): Promise<EngagementDetailsResponse> {
  const res = await okOrThrow(
    await fetch(`${BASE_URL}/engagements/${encodeURIComponent(engagementId)}/details`)
  );
  return res.json();
}
