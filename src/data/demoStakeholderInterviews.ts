import type {
  InterviewResponsesDetailOut,
  InterviewStakeholderSummaryRow,
} from '../api/interviews';

export const DEMO_INTERVIEW_IDS = {
  jane: 'demo-iv-jane',
  david: 'demo-iv-david',
  maria: 'demo-iv-maria',
} as const;

/** Demo grid rows when engagement is mock id (e.g. `1`), not a backend UUID. */
export const DEMO_STAKEHOLDER_SUMMARY_ROWS: InterviewStakeholderSummaryRow[] = [
  {
    interview_id: DEMO_INTERVIEW_IDS.jane,
    stakeholder_name: 'Jane Smith (HR Lead)',
    stakeholder_email: 'jane.smith@example.com',
    status: 'completed',
    status_label: 'Completed',
    sentiment: 'Positive',
    duration_seconds: 41 * 60 + 20,
    questions_answered: 3,
    total_questions: 12,
    summary_preview:
      'HR Lead owns role design and people side of ERP rollout; month-end and approvals changing; frontline and supervisors most affected in Wave 2.',
  },
  {
    interview_id: DEMO_INTERVIEW_IDS.david,
    stakeholder_name: 'David Chen (Finance)',
    stakeholder_email: 'david.chen@example.com',
    status: 'in_progress',
    status_label: 'In Progress',
    sentiment: 'N/A',
    duration_seconds: 18 * 60 + 45,
    questions_answered: 2,
    total_questions: 12,
    summary_preview:
      'Covers Finance role in month-end and ERP integration; legacy reporting replaced by new modules; concerns on environment availability for training.',
  },
  {
    interview_id: DEMO_INTERVIEW_IDS.maria,
    stakeholder_name: 'Maria Garcia (Ops Manager)',
    stakeholder_email: 'maria.garcia@example.com',
    status: 'created',
    status_label: 'Not Started',
    sentiment: 'N/A',
    duration_seconds: null,
    questions_answered: 0,
    total_questions: 12,
    summary_preview: null,
  },
];

const iso = (y: number, m: number, d: number, hh: number, mm: number) =>
  new Date(Date.UTC(y, m - 1, d, hh, mm, 0)).toISOString();

export const DEMO_RESPONSES_DETAIL: Record<string, InterviewResponsesDetailOut> = {
  [DEMO_INTERVIEW_IDS.jane]: {
    interview_id: DEMO_INTERVIEW_IDS.jane,
    engagement_id: 'demo-eng-1',
    stakeholder_name: 'Jane Smith (HR Lead)',
    stakeholder_email: 'jane.smith@example.com',
    status: 'completed',
    sentiment: 'Positive',
    duration_seconds: 41 * 60 + 20,
    interview_date: iso(2025, 11, 4, 14, 30),
    final_summary:
      'Stakeholder leads HR for the region with accountability for role design, RACI, and people impacts of the ERP rollout. Key process changes include month-end, approval chains, and four SOP updates; training timing relative to pilot is a concern. Frontline operations and service supervisors are seen as most affected, especially in Wave 2, with a need for adoption support and clear communications.',
    questions: [
      {
        question_text: 'How would you describe your role in relation to this change?',
        answer_text:
          "I'm the HR Lead for the region. My team owns role design, RACI updates, and the people side of the ERP rollout. We're working with Finance on the new approval workflows.",
        timestamp_utc: iso(2025, 11, 4, 14, 31),
        section: 'Opening',
      },
      {
        question_text: 'What are the main process or system changes you expect in your area?',
        answer_text:
          "Month-end will change—new approval chains and system steps. We have four SOPs that need updating. Training is planned but we're concerned about timing with the pilot.",
        timestamp_utc: iso(2025, 11, 4, 14, 38),
        section: 'Process',
      },
      {
        question_text: 'Who do you see as most affected by this change?',
        answer_text:
          'Frontline operations and service supervisors. Wave 2 is where the real role and workflow transition hits. We need adoption support and clear comms.',
        timestamp_utc: iso(2025, 11, 4, 14, 55),
        section: 'Impact',
      },
    ],
  },
  [DEMO_INTERVIEW_IDS.david]: {
    interview_id: DEMO_INTERVIEW_IDS.david,
    engagement_id: 'demo-eng-1',
    stakeholder_name: 'David Chen (Finance)',
    stakeholder_email: 'david.chen@example.com',
    status: 'in_progress',
    sentiment: 'N/A',
    duration_seconds: 18 * 60 + 45,
    interview_date: iso(2025, 11, 5, 9, 15),
    final_summary: null,
    questions: [
      {
        question_text: 'How would you describe your role in relation to this change?',
        answer_text:
          "I'm in Finance, responsible for the month-end close process and the new ERP integration in our stream.",
        timestamp_utc: iso(2025, 11, 5, 9, 16),
        section: 'Opening',
      },
      {
        question_text: 'What are the main process or system changes you expect?',
        answer_text:
          "The new ERP modules replace our legacy reporting. We have three integrations going live. Access and data migration are the big unknowns—we're dependent on IT and Data Governance.",
        timestamp_utc: iso(2025, 11, 5, 9, 28),
        section: 'Process',
      },
    ],
  },
  [DEMO_INTERVIEW_IDS.maria]: {
    interview_id: DEMO_INTERVIEW_IDS.maria,
    engagement_id: 'demo-eng-1',
    stakeholder_name: 'Maria Garcia (Ops Manager)',
    stakeholder_email: 'maria.garcia@example.com',
    status: 'created',
    sentiment: 'N/A',
    duration_seconds: null,
    interview_date: null,
    final_summary: null,
    questions: [],
  },
};

export function getDemoResponsesDetail(interviewId: string): InterviewResponsesDetailOut | null {
  return DEMO_RESPONSES_DETAIL[interviewId] ?? null;
}
