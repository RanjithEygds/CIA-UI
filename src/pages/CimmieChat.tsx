import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './CimmieChat.css';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  at: Date;
}

const INITIAL_BOT = `Hello. I'm CIMMIE, your Change Impact Assessment interview assistant. This session is time-boxed and accessed via your one-time link. I'll ask you structured questions and capture your responses—they will be used only for this interview. You cannot access post-interview outputs (summaries, templates, or other transcripts) from this session. When you're ready, we'll start with your role and how the change may affect your area. How would you describe your role in relation to this change?`;

export default function CimmieChat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'bot', text: INITIAL_BOT, at: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [sessionEndsAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 45);
    return d;
  });
  const [expired, setExpired] = useState(false);
  const [timeBannerDismissed, setTimeBannerDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessionMinutes = 45;

  useEffect(() => {
    const t = setInterval(() => {
      if (new Date() >= sessionEndsAt) setExpired(true);
    }, 1000);
    return () => clearInterval(t);
  }, [sessionEndsAt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || expired) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, at: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTimeout(() => {
      const botReply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: 'Thank you. I’ve captured that. Next: can you describe the main process or system changes you expect in your area, and any concerns about timing or readiness?',
        at: new Date(),
      };
      setMessages((prev) => [...prev, botReply]);
    }, 800);
  }

  const remaining = sessionEndsAt.getTime() - Date.now();
  const mins = Math.max(0, Math.floor(remaining / 60000));
  const secs = Math.max(0, Math.floor((remaining % 60000) / 1000));

  if (expired) {
    return (
      <div className="cimmie-page cimmie-standalone">
        <div className="cimmie-expired card">
          <h1>Session ended</h1>
          <p>This interview session has ended. Your responses have been captured for this change impact assessment. You cannot access summaries, transcripts, or templates from this link—those are available only to the Change Management Team.</p>
          <p className="cimmie-note">Thank you for participating.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cimmie-page cimmie-standalone">
      <header className="cimmie-header">
        <div className="cimmie-header-inner">
          <img src="/cimmie-robot.jpg" alt="" className="cimmie-page-robot-icon cimmie-page-robot-icon-light" aria-hidden="true" />
          <span className="cimmie-logo">CIMMIE</span>
          <span className="cimmie-session">Interview session</span>
          <span className="cimmie-timer">
            Time remaining: {mins}:{secs.toString().padStart(2, '0')}
          </span>
        </div>
      </header>

      {!timeBannerDismissed && (
        <div className="session-time-banner card" role="status">
          <p className="session-time-banner-text">
            This session is time-bound. The link will expire in {sessionMinutes} minutes.
          </p>
          <button
            type="button"
            className="session-time-banner-dismiss"
            onClick={() => setTimeBannerDismissed(true)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="cimmie-notice card">
        <p>
          <strong>One-time, time-boxed session.</strong> This link is valid only for your live interview. You cannot view post-interview outputs (summary, template, synthesis), other transcripts, or internal knowledge. Your responses are captured for this assessment only.
        </p>
      </div>

      <div className="cimmie-chat card">
        <div className="cimmie-messages">
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.role}`}>
              {m.role === 'bot' ? (
                <div className="chat-bubble-inner">
                  <img src="/cimmie-robot.jpg" alt="" className="chat-bubble-avatar" aria-hidden="true" />
                  <span className="chat-bubble-text">{m.text}</span>
                </div>
              ) : (
                m.text
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form
          className="cimmie-input-row"
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your response…"
            disabled={expired}
          />
          <button type="submit" className="btn btn-primary" disabled={expired || !input.trim()}>
            Send
          </button>
        </form>
      </div>

      {sessionId && (
        <p className="cimmie-session-id">Session: {sessionId}</p>
      )}
    </div>
  );
}
