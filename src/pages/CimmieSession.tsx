import React, { useEffect, useMemo, useState } from 'react';
import './CimmieSession.css';

type Message = {
  id: string;
  from: 'bot' | 'user';
  text: string;
};

type Section = {
  sectionId: string;
  title: string;
  fullTitle: string;
  status: string;
  totalQuestions: number;
  answeredQuestions: number;
};

const sections: Section[] = [
  {
    sectionId: '1',
    title: 'Opening & Consent',
    fullTitle: '1. Opening & Consent',
    status: 'not_started',
    totalQuestions: 1,
    answeredQuestions: 0,
  },
  {
    sectionId: '2',
    title: 'Role impact',
    fullTitle: '2. Role impact',
    status: 'in_progress',
    totalQuestions: 3,
    answeredQuestions: 1,
  },
  {
    sectionId: '3',
    title: 'Process & technology',
    fullTitle: '3. Process & technology',
    status: 'not_started',
    totalQuestions: 2,
    answeredQuestions: 0,
  },
  {
    sectionId: '4',
    title: 'Data & closure',
    fullTitle: '4. Data & closure',
    status: 'not_started',
    totalQuestions: 2,
    answeredQuestions: 0,
  },
];

/** Step state for the vertical progress pipe: completed, active, or upcoming */
function getStepState(index: number, sectionsList: Section[]): 'completed' | 'active' | 'upcoming' {
  const currentIndex = sectionsList.findIndex((s) => s.status === 'in_progress');
  const effectiveCurrent = currentIndex >= 0 ? currentIndex : 0;
  if (sectionsList[index]?.status === 'completed' || index < effectiveCurrent) return 'completed';
  if (index === effectiveCurrent) return 'active';
  return 'upcoming';
}

function StepCheckmark() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.5 5.5L4 8L8.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StepActiveDot() {
  return <span className="progress-pipe-active-inner" aria-hidden="true" />;
}

const seedMessages: Message[] = [
  {
    id: 'm1',
    from: 'bot',
    text: 'Hi, I’m CIMMIE, your Change Impact Assessment assistant. Welcome, and thank you for joining today.',
  },
  {
    id: 'm2',
    from: 'bot',
    text: 'The purpose of this session is to understand how the upcoming change will affect your part of the business, your teams, your customers, and your own role. We’ll explore impacts on people, processes, technology, skills and behaviours so we can plan the right support and mitigations. This is a collaborative conversation - your insights will help us make the change successful for everyone. ',
  },
  {
    id: 'm3',
    from: 'bot',
    text: 'May I proceed and capture notes? Please type "yes" to continue.',
  },
  {
    id: 'm4',
    from: 'user',
    text: 'Yes',
  },
  {
    id: 'm5',
    from: 'bot',
    text: 'To start us off, could you tell me a bit about your role and responsibilities, and what your main priorities are at the moment?',
  },
];

const SESSION_MINUTES = 30;

function formatRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function CimmieSession() {
  const [messages, setMessages] = useState<Message[]>(seedMessages);
  const [draft, setDraft] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(SESSION_MINUTES * 60);
  const [timeBannerDismissed, setTimeBannerDismissed] = useState(false);

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [remainingSeconds]);

  const sessionExpired = remainingSeconds <= 0;
  const countdown = useMemo(() => formatRemaining(remainingSeconds), [remainingSeconds]);

  function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || sessionExpired) return;

    const nextUser: Message = {
      id: `user-${Date.now()}`,
      from: 'user',
      text: draft.trim(),
    };

    const nextReadback: Message = {
      id: `bot-${Date.now()}`,
      from: 'bot',
      text: `Captured evidence: ${draft.trim()} This entry is tagged for validation in post-interview synthesis where severity cannot yet be confirmed.`,
    };

    setMessages((prev) => [...prev, nextUser, nextReadback]);
    setDraft('');
  }

  function extendInterviewSession() {
    // Placeholder: call backend "extend interview session" when implemented
  }

  function endInterviewSession() {
    // Placeholder: call backend "end interview session" when implemented
  }

  return (
    <div className="cimmie-page">
      <header className="cimmie-header card">
        <div className="cimmie-header-top">
          <div className="cimmie-header-title-row">
            <img src="/cimmie-robot.jpg" alt="" className="cimmie-page-robot-icon" aria-hidden="true" />
            <p className="cimmie-kicker">CIMMIE Interview Session</p>
          </div>
          <h1>Scheduled Stakeholder Interview</h1>
          <p>
            One-time access link validated. This session is scoped to this interview only and is
            time-limited. Post-interview outputs and internal sources are restricted.
          </p>
        </div>
        <div className="cimmie-header-bottom">
          <div className="cimmie-header-left">
            <div className="session-panel">
              <div>
                <span className="label">Session status</span>
                <strong>{sessionExpired ? 'Closed' : 'Active'}</strong>
              </div>
              <div>
                <span className="label">Time remaining</span>
                <strong>{countdown}</strong>
              </div>
              <div>
                <span className="label">Access scope</span>
                <strong>Current interview only</strong>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-extend-session"
              onClick={extendInterviewSession}
            >
              Extend Session
            </button>
            <button
              type="button"
              className="btn btn-extend-session btn-end-interview"
              onClick={endInterviewSession}
            >
              End Interview
            </button>
          </div>
          <div className="interview-progress-card card">
            <h2 className="interview-progress-card-title">Interview Progress</h2>
            <div className="progress-pipe-vertical" role="list" aria-label="Interview topics">
              {sections.map((section, index) => {
                const state = getStepState(index, sections);
                const isLast = index === sections.length - 1;
                return (
                  <div key={section.sectionId} className="progress-pipe-step" role="listitem">
                    <div className="progress-pipe-step-track">
                      {index > 0 && (
                        <div
                          className={`progress-pipe-connector progress-pipe-connector-above ${getStepState(index - 1, sections) === 'completed' ? 'progress-pipe-connector-completed' : ''}`}
                          aria-hidden="true"
                        />
                      )}
                      <div
                        className={`progress-pipe-dot progress-pipe-dot-${state}`}
                        aria-current={state === 'active' ? 'step' : undefined}
                      >
                        {state === 'completed' && <StepCheckmark />}
                        {state === 'active' && <StepActiveDot />}
                        {state === 'upcoming' && <span className="progress-pipe-dot-number">{index + 1}</span>}
                      </div>
                      {!isLast && (
                        <div
                          className={`progress-pipe-connector progress-pipe-connector-below ${state === 'completed' ? 'progress-pipe-connector-completed' : ''}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <span className={`progress-pipe-label progress-pipe-label-${state}`}>
                      {section.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {!timeBannerDismissed && (
        <section className="session-time-banner card" role="status">
          <p className="session-time-banner-text">
            This session is time-bound. The link will expire in {SESSION_MINUTES} minutes.
          </p>
          <button
            type="button"
            className="session-time-banner-dismiss"
            onClick={() => setTimeBannerDismissed(true)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </section>
      )}

      <section className="restriction-banner">
        Stakeholder view restrictions: no access to summary outputs, populated template files,
        synthesis from other interviews, or internal knowledge repositories.
      </section>

      <section className="chat-shell card">
        <div className="chat-log">
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble ${message.from}`}>
              {message.from === 'bot' ? (
                <div className="chat-bubble-inner">
                  <img src="/cimmie-robot.jpg" alt="" className="chat-bubble-avatar" aria-hidden="true" />
                  <span className="chat-bubble-text">{message.text}</span>
                </div>
              ) : (
                message.text
              )}
            </div>
          ))}
        </div>

        <form className="chat-compose" onSubmit={submitMessage}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type your response..."
            rows={3}
            disabled={sessionExpired}
          />
          <button className="btn btn-primary" type="submit" disabled={sessionExpired || !draft.trim()}>
            Submit response
          </button>
        </form>
      </section>
    </div>
  );
}
