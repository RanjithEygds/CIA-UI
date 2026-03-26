import * as XLSX from 'xlsx';
import {
  fetchInterviewResponsesDetail,
  type InterviewResponsesDetailOut,
  type InterviewStakeholderSummaryRow,
} from '../api/interviews';
import { getDemoResponsesDetail } from '../data/demoStakeholderInterviews';

export type ExportRow = {
  Question: string;
  Response: string;
  Status: string;
  Sentiment: string;
  Stakeholder: string;
  Timestamp: string;
  Section: string;
  'Final summary': string;
  'Summary preview': string;
  'Stakeholder Email': string;
  'Interview Date': string;
  'Duration (seconds)': string | number;
  'Interview ID': string;
};

const HEADER: (keyof ExportRow)[] = [
  'Question',
  'Response',
  'Status',
  'Sentiment',
  'Stakeholder',
  'Timestamp',
  'Section',
  'Final summary',
  'Summary preview',
  'Stakeholder Email',
  'Interview Date',
  'Duration (seconds)',
  'Interview ID',
];

async function loadDetail(
  row: InterviewStakeholderSummaryRow,
  useDemoData: boolean,
): Promise<InterviewResponsesDetailOut | null> {
  if (useDemoData) {
    return getDemoResponsesDetail(row.interview_id);
  }
  try {
    return await fetchInterviewResponsesDetail(row.interview_id);
  } catch {
    return null;
  }
}

export async function buildStakeholderInterviewExportRows(
  rows: InterviewStakeholderSummaryRow[],
  useDemoData: boolean,
): Promise<ExportRow[]> {
  const out: ExportRow[] = [];

  for (const row of rows) {
    const detail = await loadDetail(row, useDemoData);
    const email =
      detail?.stakeholder_email ?? row.stakeholder_email ?? '';
    const interviewDate = detail?.interview_date ?? '';
    const duration =
      detail?.duration_seconds ?? row.duration_seconds ?? '';
    const sentiment = detail?.sentiment ?? row.sentiment;
    const stakeholder = detail?.stakeholder_name ?? row.stakeholder_name;

    const finalSummary =
      detail?.final_summary == null ? '' : String(detail.final_summary);

    const preview =
      row.summary_preview == null ? '' : String(row.summary_preview);

    const base = (): Omit<ExportRow, 'Question' | 'Response' | 'Timestamp' | 'Section'> => ({
      Status: row.status_label,
      Sentiment: sentiment,
      Stakeholder: stakeholder,
      'Final summary': detail ? finalSummary : '',
      'Summary preview': preview,
      'Stakeholder Email': email == null ? '' : String(email),
      'Interview Date': interviewDate == null ? '' : String(interviewDate),
      'Duration (seconds)': duration == null || duration === '' ? '' : duration,
      'Interview ID': row.interview_id,
    });

    if (!detail) {
      out.push({
        ...base(),
        Question: '',
        Response: 'Unable to load interview detail for export.',
        Timestamp: '',
        Section: '',
      });
      continue;
    }

    const questions = detail.questions ?? [];
    if (questions.length === 0) {
      out.push({
        ...base(),
        Question: '',
        Response: '',
        Timestamp: '',
        Section: '',
      });
      continue;
    }

    for (const q of questions) {
      out.push({
        ...base(),
        Question: q.question_text,
        Response: q.answer_text,
        Timestamp: q.timestamp_utc ?? '',
        Section: q.section ?? '',
      });
    }
  }

  return out;
}

export function downloadStakeholderInterviewSummaryExcel(
  engagementId: string,
  rows: ExportRow[],
): void {
  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADER });
  ws['!cols'] = [
    { wch: 48 },
    { wch: 56 },
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 44 },
    { wch: 40 },
    { wch: 28 },
    { wch: 22 },
    { wch: 18 },
    { wch: 36 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Interview summary');
  const safeId = engagementId.replace(/[^\w.-]+/g, '_');
  XLSX.writeFile(wb, `Stakeholder_Interview_Summary_${safeId}.xlsx`);
}
