import React, { useEffect, useMemo, useRef, useState } from 'react';
import './CimmieSession.css';

/** Minimal type for Web Speech API SpeechRecognition. */
interface SpeechRecognitionLike {
  start(): void;
  stop(): void;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
  isFinal: boolean;
}

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

/** Browser Speech Recognition (Web Speech API); may be prefixed. */
function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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

function TextMessageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
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
const INTERVIEW_MODE_KEY = 'cimmie-interview-mode';
const SILENCE_TIMEOUT_MS = 7000;
const MIC_TOGGLE_DEBOUNCE_MS = 400;

type InterviewMode = 'text' | 'voice';

/** Mic status under Text mode: idle, just started (Speak Now), or user speaking (I am listening…) */
type ComposerMicStatus = 'idle' | 'speak_now' | 'listening';

/** Mic status under Voice mode: idle, recording (Speak Now), or speech detected (I am listening…) */
type VoicePanelMicStatus = 'idle' | 'speak_now' | 'listening';

function getStoredInterviewMode(): InterviewMode {
  if (typeof window === 'undefined') return 'text';
  const stored = window.localStorage.getItem(INTERVIEW_MODE_KEY);
  return stored === 'voice' ? 'voice' : 'text';
}

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
  const [interviewMode, setInterviewMode] = useState<InterviewMode>(() => getStoredInterviewMode());
  const [voicePanelListening, setVoicePanelListening] = useState(false);
  const [voicePanelMicStatus, setVoicePanelMicStatus] = useState<VoicePanelMicStatus>('idle');
  const [voicePanelTranscript, setVoicePanelTranscript] = useState('');
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [composerListening, setComposerListening] = useState(false);
  const [composerMicStatus, setComposerMicStatus] = useState<ComposerMicStatus>('idle');
  const [composerSpeechError, setComposerSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionTranscriptRef = useRef('');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMicToggleTimeRef = useRef(0);
  /* Voice panel: recognition, stream, transcript, and audio analysis */
  const voiceRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceMediaStreamRef = useRef<MediaStream | null>(null);
  const voiceTranscriptRef = useRef('');
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceAnimationFrameRef = useRef<number | null>(null);

  function setInterviewModeAndPersist(mode: InterviewMode) {
    setInterviewMode(mode);
    if (typeof window !== 'undefined') window.localStorage.setItem(INTERVIEW_MODE_KEY, mode);
  }

  function clearSilenceTimeout() {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }

  function stopMediaTracks() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  function startComposerListening() {
    const now = Date.now();
    if (now - lastMicToggleTimeRef.current < MIC_TOGGLE_DEBOUNCE_MS) return;
    lastMicToggleTimeRef.current = now;

    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setComposerSpeechError('Speech recognition is not supported in this browser.');
      return;
    }
    setComposerSpeechError(null);
    sessionTranscriptRef.current = '';
    clearSilenceTimeout();
    stopMediaTracks();

    const startRecognition = (stream: MediaStream) => {
      mediaStreamRef.current = stream;
      const recognition = new Ctor!();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let hadSpeech = false;
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.length > 0) {
            const text = result[0].transcript?.trim?.() ?? '';
            if (text) {
              hadSpeech = true;
              setComposerMicStatus('listening');
              if (result.isFinal) {
                sessionTranscriptRef.current += (sessionTranscriptRef.current ? ' ' : '') + text;
              }
            }
          }
        }
        if (hadSpeech) {
          clearSilenceTimeout();
          silenceTimeoutRef.current = setTimeout(() => {
            silenceTimeoutRef.current = null;
            stopComposerListening();
            setComposerSpeechError('No input detected.');
          }, SILENCE_TIMEOUT_MS);
        }
      };
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        clearSilenceTimeout();
        stopMediaTracks();
        recognitionRef.current = null;
        setComposerListening(false);
        setComposerMicStatus('idle');
        if (event.error === 'not-allowed') setComposerSpeechError('Microphone access denied.');
        else if (event.error === 'no-speech') setComposerSpeechError('No speech detected.');
        else if (event.error === 'network') setComposerSpeechError('Network error. Check your connection.');
        else if (event.message) setComposerSpeechError(event.message);
        else setComposerSpeechError('Speech recognition error.');
      };
      recognition.onend = () => {
        clearSilenceTimeout();
        stopMediaTracks();
        recognitionRef.current = null;
        setComposerListening(false);
        setComposerMicStatus('idle');
        const text = sessionTranscriptRef.current.trim();
        if (text) setDraft((prev) => (prev ? `${prev} ${text}` : text));
      };
      try {
        recognition.start();
        setComposerListening(true);
        setComposerMicStatus('speak_now');
        silenceTimeoutRef.current = setTimeout(() => {
          silenceTimeoutRef.current = null;
          stopComposerListening();
          setComposerSpeechError('No input detected.');
        }, SILENCE_TIMEOUT_MS);
      } catch {
        stopMediaTracks();
        setComposerSpeechError('Could not start microphone.');
      }
    };

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(startRecognition)
      .catch((err: Error) => {
        setComposerSpeechError(err.name === 'NotAllowedError' ? 'Microphone access denied.' : 'Microphone unavailable.');
      });
  }

  function stopComposerListening() {
    clearSilenceTimeout();
    stopMediaTracks();
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        recognitionRef.current = null;
        setComposerListening(false);
        setComposerMicStatus('idle');
      }
    }
  }

  function toggleComposerListening() {
    if (composerListening) stopComposerListening();
    else startComposerListening();
  }

  function stopVoicePanelTracks() {
    if (voiceMediaStreamRef.current) {
      voiceMediaStreamRef.current.getTracks().forEach((t) => t.stop());
      voiceMediaStreamRef.current = null;
    }
    if (voiceAudioContextRef.current) {
      voiceAudioContextRef.current.close().catch(() => {});
      voiceAudioContextRef.current = null;
    }
    voiceAnalyserRef.current = null;
    if (voiceAnimationFrameRef.current != null) {
      cancelAnimationFrame(voiceAnimationFrameRef.current);
      voiceAnimationFrameRef.current = null;
    }
  }

  function startVoiceRecording() {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;
    voiceTranscriptRef.current = '';
    setVoicePanelTranscript('');
    stopVoicePanelTracks();

    const startRecognition = (stream: MediaStream) => {
      voiceMediaStreamRef.current = stream;
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      voiceAudioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      voiceAnalyserRef.current = analyser;

      const recognition = new Ctor();
      voiceRecognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let display = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.length > 0) {
            const text = result[0].transcript?.trim?.() ?? '';
            if (text) {
              setVoicePanelMicStatus('listening');
              if (result.isFinal) {
                voiceTranscriptRef.current += (voiceTranscriptRef.current ? ' ' : '') + text;
              }
              display += (display ? ' ' : '') + text;
            }
          }
        }
        if (display) setVoicePanelTranscript(display);
      };
      recognition.onerror = () => {
        stopVoicePanelTracks();
        if (voiceRecognitionRef.current) {
          try {
            voiceRecognitionRef.current.stop();
          } catch {
            /* ignore */
          }
          voiceRecognitionRef.current = null;
        }
        setVoicePanelListening(false);
        setVoicePanelMicStatus('idle');
        setVoicePanelTranscript('');
      };
      recognition.onend = () => {
        stopVoicePanelTracks();
        voiceRecognitionRef.current = null;
        setVoicePanelListening(false);
        setVoicePanelMicStatus('idle');
        setVoiceVolume(0);
        setVoicePanelTranscript('');
        const text = voiceTranscriptRef.current.trim();
        if (text) setDraft((prev) => (prev ? `${prev} ${text}` : text));
      };
      try {
        recognition.start();
        setVoicePanelListening(true);
        setVoicePanelMicStatus('speak_now');
        voiceAnimationFrameRef.current = requestAnimationFrame(function tick() {
          const analyserNode = voiceAnalyserRef.current;
          if (!analyserNode) return;
          const data = new Uint8Array(analyserNode.frequencyBinCount);
          analyserNode.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = data.length > 0 ? sum / data.length : 0;
          setVoiceVolume(avg / 255);
          voiceAnimationFrameRef.current = requestAnimationFrame(tick);
        });
      } catch {
        stopVoicePanelTracks();
        setVoicePanelListening(false);
        setVoicePanelMicStatus('idle');
      }
    };

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(startRecognition)
      .catch(() => {
        setVoicePanelListening(false);
        setVoicePanelMicStatus('idle');
      });
  }

  function stopVoiceRecording() {
    stopVoicePanelTracks();
    const recognition = voiceRecognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        voiceRecognitionRef.current = null;
        setVoicePanelListening(false);
        setVoicePanelMicStatus('idle');
        setVoiceVolume(0);
      }
    }
    /* Transcript is inserted in recognition.onend to avoid duplicate updates */
  }

  function toggleVoicePanelMic() {
    if (voicePanelListening) stopVoiceRecording();
    else startVoiceRecording();
  }

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [remainingSeconds]);

  useEffect(() => {
    return () => {
      clearSilenceTimeout();
      stopMediaTracks();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
      stopVoicePanelTracks();
      if (voiceRecognitionRef.current) {
        try {
          voiceRecognitionRef.current.stop();
        } catch {
          /* ignore */
        }
        voiceRecognitionRef.current = null;
      }
    };
  }, []);

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

      <section className="mode-toggle-card card" aria-label="Input mode">
        <div className="interview-mode-toggle" role="group" aria-label="Interview mode">
          <button
            type="button"
            className={`interview-mode-btn ${interviewMode === 'text' ? 'interview-mode-btn-active' : ''}`}
            onClick={() => setInterviewModeAndPersist('text')}
            aria-pressed={interviewMode === 'text'}
          >
            <TextMessageIcon />
            <span>Text</span>
          </button>
          <button
            type="button"
            className={`interview-mode-btn ${interviewMode === 'voice' ? 'interview-mode-btn-active' : ''}`}
            onClick={() => setInterviewModeAndPersist('voice')}
            aria-pressed={interviewMode === 'voice'}
          >
            <MicIcon />
            <span>Voice</span>
          </button>
        </div>
      </section>

      {/* Exclusive rendering: only one mode mounted—no text chat when voice, no voice UI when text. */}
      {interviewMode === 'text' && (
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
          <div className="chat-compose-wrap">
            <form className="chat-compose" onSubmit={submitMessage}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type your response..."
                rows={3}
                disabled={sessionExpired}
              />
              <p
                className={`chat-compose-status ${composerListening ? 'chat-compose-status-listening' : ''} ${composerSpeechError ? 'chat-compose-status-error' : ''}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {composerMicStatus === 'speak_now' && 'Speak Now'}
                {composerMicStatus === 'listening' && 'I am listening…'}
                {composerMicStatus === 'idle' && composerSpeechError && composerSpeechError}
                {composerMicStatus === 'idle' && !composerSpeechError && '\u00A0'}
              </p>
              <div className="chat-compose-actions">
                <button
                  type="button"
                  className={`chat-compose-mic ${composerListening ? 'chat-compose-mic-active' : ''} ${composerMicStatus === 'listening' ? 'chat-compose-mic-listening' : ''}`}
                  onClick={toggleComposerListening}
                  disabled={sessionExpired}
                  aria-label={composerListening ? 'Stop listening' : 'Dictate message'}
                  aria-pressed={composerListening}
                >
                  <MicIcon />
                </button>
                <button className="btn btn-primary" type="submit" disabled={sessionExpired || !draft.trim()}>
                  Submit response
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {interviewMode === 'voice' && (
        <section className="voice-fullscreen" aria-label="Voice interview">
          <div className="voice-ui-panel voice-ui-panel-fullscreen" aria-label="Voice input">
            <div
              className={`voice-ui-orb ${voicePanelMicStatus === 'speak_now' ? 'voice-ui-orb-speak-now' : ''} ${voicePanelMicStatus === 'listening' ? 'voice-ui-orb-listening' : ''}`}
              style={
                voicePanelMicStatus === 'listening'
                  ? { ['--voice-level' as string]: voiceVolume }
                  : undefined
              }
            >
              <div
                className={`voice-ui-orb-wave ${voicePanelMicStatus === 'listening' ? 'voice-ui-orb-wave-listening' : ''}`}
                aria-hidden="true"
                style={
                  voicePanelMicStatus === 'listening'
                    ? { ['--voice-level' as string]: voiceVolume }
                    : undefined
                }
              >
                <img
                  src="/voice-wave_2.png"
                  alt=""
                  className="voice-ui-orb-wave-img"
                />
              </div>
              <div className="voice-ui-orb-icon" aria-hidden="true">
                <img src="/cimmie-robot.jpg" alt="" className="voice-ui-orb-icon-img" />
              </div>
            </div>
            <p className="voice-ui-status" role="status" aria-live="polite">
              {voicePanelMicStatus === 'idle' && '\u00A0'}
              {voicePanelMicStatus === 'speak_now' && 'Speak Now'}
              {voicePanelMicStatus === 'listening' && 'I am listening…'}
            </p>
            {voicePanelTranscript && (
              <div className="voice-ui-transcript" role="log" aria-live="polite">
                {voicePanelTranscript}
              </div>
            )}
            <button
              type="button"
              className={`voice-ui-mic ${voicePanelListening ? 'voice-ui-mic-active' : ''} ${voicePanelMicStatus === 'listening' ? 'voice-ui-mic-listening' : ''}`}
              style={
                voicePanelMicStatus === 'listening'
                  ? { ['--voice-level' as string]: voiceVolume }
                  : undefined
              }
              onClick={toggleVoicePanelMic}
              disabled={sessionExpired}
              aria-label={voicePanelListening ? 'Stop listening' : 'Start listening'}
              aria-pressed={voicePanelListening}
            >
              <MicIcon />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
