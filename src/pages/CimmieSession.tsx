import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./CimmieSession.css";

import {
  firstIntro,
  getNextQuestion,
  submitAnswer,
  submitAnswerStream,
  endInterview,
  type AnswerStreamDonePayload,
  type NextQuestionResponse,
  firstIntroStream,
  getInterviewSections,
  type InterviewSectionRow,
} from "../api/interviews";
import { useNavigate, useParams } from "react-router-dom";
import { DEFAULT_TTS_VOICE } from "../config";

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
function getSpeechRecognitionConstructor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

/** Chrome/Safari often return an empty voice list until voiceschanged fires. */
function waitForSpeechSynthesisVoices(maxWaitMs = 2500): Promise<void> {
  const synth = getSpeechSynthesis();
  if (!synth) return Promise.resolve();
  if (synth.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener("voiceschanged", onVoices);
      resolve();
    };
    const onVoices = () => {
      if (synth.getVoices().length > 0) finish();
    };
    synth.addEventListener("voiceschanged", onVoices);
    void synth.getVoices();
    setTimeout(finish, maxWaitMs);
  });
}

function configureSpeechUtterance(u: SpeechSynthesisUtterance) {
  u.volume = 1;
  u.rate = 1;
  const preferred = DEFAULT_TTS_VOICE.trim();
  const synth = getSpeechSynthesis();
  const voices = synth?.getVoices() ?? [];
  if (preferred) {
    const v =
      voices.find((x) => x.name === preferred) ??
      voices.find((x) => x.voiceURI === preferred) ??
      voices.find((x) => x.lang === preferred);
    if (v) {
      u.voice = v;
      u.lang = v.lang || "en-US";
      return;
    }
  }
  u.lang = "en-US";
}

type Message = {
  id: string;
  from: "bot" | "user";
  text: string;
  /** Full text target from SSE (or local); typewriter reveals into view */
  streamTotal?: string;
  /** When false, network may still append to streamTotal */
  streamComplete?: boolean;
};

const WELCOME_BOT_TEXT =
  "Welcome to CIMMIE. This is your scheduled Change Impact Assessment interview. " +
  "We will proceed topic by topic and capture evidence across People, Process, Technology, and Data.";

function BotTypewriterBlock({
  messageId,
  streamTotal,
  streamComplete,
  onTick,
  onSettled,
}: {
  messageId: string;
  streamTotal: string;
  streamComplete: boolean;
  onTick: () => void;
  onSettled: (id: string, final: string) => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const posRef = useRef(0);
  const totalRef = useRef(streamTotal);
  const scRef = useRef(streamComplete);
  const settledRef = useRef(false);
  totalRef.current = streamTotal;
  scRef.current = streamComplete;

  useEffect(() => {
    settledRef.current = false;
    posRef.current = 0;
    setDisplayed("");
  }, [messageId]);

  useEffect(() => {
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      const target = totalRef.current;
      const i = posRef.current;
      if (i >= target.length) {
        if (!scRef.current) {
          requestAnimationFrame(step);
          return;
        }
        if (!settledRef.current) {
          settledRef.current = true;
          onSettled(messageId, target);
        }
        return;
      }
      const c = target[i]!;
      posRef.current = i + 1;
      setDisplayed(target.slice(0, i + 1));
      onTick();
      const ms = c === " " ? 0 : Math.round(30 + Math.random() * 20);
      window.setTimeout(step, ms);
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [messageId, onSettled, onTick]);

  const showTyping = displayed.length < streamTotal.length || !streamComplete;

  return (
    <span className="chat-bubble-text cimmie-streaming-wrap">
      <span>{displayed}</span>
      {showTyping ? (
        <span className="cimmie-typing" aria-hidden="true">
          <span className="cimmie-typing-dot" />
          <span className="cimmie-typing-dot" />
          <span className="cimmie-typing-dot" />
        </span>
      ) : null}
    </span>
  );
}

/** Step state for the vertical progress pipe: completed, active, or upcoming */
function getStepState(
  index: number,
  sectionsList: InterviewSectionRow[],
): "completed" | "active" | "upcoming" {
  // 1. Find the first section that is NOT completed.
  const firstIncompleteIndex = sectionsList.findIndex((s) => !s.completed);

  // ✅ All sections complete? Then all are completed.
  if (firstIncompleteIndex === -1) {
    return "completed";
  }

  // ✅ Completed sections
  if (sectionsList[index].completed) {
    return "completed";
  }

  // ✅ The first section with completed=false is the ACTIVE section
  if (index === firstIncompleteIndex) {
    return "active";
  }

  // ✅ Anything after the first incomplete is upcoming
  return "upcoming";
}

function StepCheckmark() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 5.5L4 8L8.5 3"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

const SESSION_MINUTES = 30;
const INTERVIEW_MODE_KEY = "cimmie-interview-mode";
const ACTIVE_STAKEHOLDER_KEY = "ciassist_active_stakeholder_id";
const COMPLETED_STAKEHOLDERS_KEY = "ciassist_completed_stakeholders";
const INTERVIEW_EXTENSIONS_KEY = "ciassist_interview_extensions";
const SILENCE_TIMEOUT_MS = 7000;
const VOICE_PANEL_SILENCE_TIMEOUT_MS = 2500;
const MIC_TOGGLE_DEBOUNCE_MS = 400;

type InterviewMode = "text" | "voice";

/** Mic status under Text mode: idle, just started (Speak Now), or user speaking (I am listening…) */
type ComposerMicStatus = "idle" | "speak_now" | "listening";

/** Mic status under Voice mode: idle, recording (Speak Now), or speech detected (I am listening…) */
type VoicePanelMicStatus = "idle" | "speak_now" | "listening";

function getStoredInterviewMode(): InterviewMode {
  if (typeof window === "undefined") return "text";
  const stored = window.localStorage.getItem(INTERVIEW_MODE_KEY);
  return stored === "voice" ? "voice" : "text";
}

function formatRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function getInterviewExtensionMinutes(interviewId: string | undefined): number {
  if (!interviewId) return 0;
  try {
    const raw = localStorage.getItem(INTERVIEW_EXTENSIONS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const v = parsed[interviewId];
    if (typeof v !== "number" || Number.isNaN(v)) return 0;
    return Math.max(0, Math.floor(v));
  } catch {
    return 0;
  }
}

export default function CimmieSession() {
  const navigate = useNavigate();
  const [sections, setSections] = useState<InterviewSectionRow[]>([]);
  const { interviewId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(
    SESSION_MINUTES * 60,
  );
  const [sessionMinutes, setSessionMinutes] = useState(SESSION_MINUTES);
  const [timeBannerDismissed, setTimeBannerDismissed] = useState(false);
  const [interviewMode, setInterviewMode] = useState<InterviewMode>(() =>
    getStoredInterviewMode(),
  );
  const [voicePanelListening, setVoicePanelListening] = useState(false);
  const [voicePanelMicStatus, setVoicePanelMicStatus] =
    useState<VoicePanelMicStatus>("idle");
  const [voicePanelTranscript, setVoicePanelTranscript] = useState("");
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [composerListening, setComposerListening] = useState(false);
  const [composerMicStatus, setComposerMicStatus] =
    useState<ComposerMicStatus>("idle");
  const [composerSpeechError, setComposerSpeechError] = useState<string | null>(
    null,
  );
  const [completed, setCompleted] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] =
    useState<NextQuestionResponse | null>(null);
  const appliedExtensionMinutesRef = useRef(0);
  const hasEndedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionTranscriptRef = useRef("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMicToggleTimeRef = useRef(0);
  /* Voice panel: recognition, stream, transcript, and audio analysis */
  const voiceRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceMediaStreamRef = useRef<MediaStream | null>(null);
  const voiceTranscriptRef = useRef("");
  const voiceSilenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceAnimationFrameRef = useRef<number | null>(null);
  const voiceAgentLogRef = useRef<HTMLDivElement | null>(null);
  const voiceTtsBufferRef = useRef("");
  const voiceTtsUtteranceCountRef = useRef(0);
  const voiceAfterTtsRef = useRef<(() => void) | null>(null);
  const voiceAnswerInFlightRef = useRef(false);
  /** Id of the bot stream bubble last created by `appendStreamBeginPart` (voice sequencing). */
  const lastCreatedBotStreamIdRef = useRef<string | null>(null);
  /** Bot message id currently receiving streamed deltas in a voice answer (null between parts). */
  const voiceCurrentPartOpenIdRef = useRef<string | null>(null);
  const voiceAnswerPumpLockRef = useRef(false);
  const voiceSubmitCycleResolveRef = useRef<(() => void) | null>(null);
  const voiceTwResolversRef = useRef(new Map<string, () => void>());
  const [voiceDisplayedBotId, setVoiceDisplayedBotId] = useState<string | null>(
    null,
  );
  /** Browsers require a user gesture before speechSynthesis; boot waits on this. */
  const voiceAudioUnlockResolveRef = useRef<(() => void) | null>(null);
  const [voiceAwaitingAudioUnlock, setVoiceAwaitingAudioUnlock] =
    useState(false);
  const interviewModeRef = useRef(interviewMode);
  const completedRef = useRef(completed);
  const backendCompletionSyncedRef = useRef(false);
  const sessionExpiredRef = useRef(false);
  const voiceBootRef = useRef({
    feedVoiceTtsDelta: (_c: string) => {},
    flushVoiceTtsRemainder: () => {},
    prepareVoiceAgentSpeech: () => {},
    closeAndFinalizeBotStreams: () => {},
    waitUntilSpeechIdle: async () => {},
    speakUtteranceSimple: (_t: string) => Promise.resolve(),
    startVoiceRecording: () => {},
  });

  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = logRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const handleBotStreamSettled = useCallback((id: string, final: string) => {
    const r = voiceTwResolversRef.current.get(id);
    if (r) {
      voiceTwResolversRef.current.delete(id);
      r();
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.streamTotal !== undefined
          ? { id: m.id, from: "bot" as const, text: final }
          : m,
      ),
    );
  }, []);

  const appendStreamBeginPart = useCallback((part: string) => {
    const id = `bot-${part}-${Date.now()}`;
    lastCreatedBotStreamIdRef.current = id;
    setMessages((prev) => {
      const closed = prev.map((m) =>
        m.from === "bot" &&
        m.streamTotal !== undefined &&
        m.streamComplete === false
          ? { ...m, streamComplete: true }
          : m,
      );
      return [
        ...closed,
        {
          id,
          from: "bot" as const,
          text: "",
          streamTotal: "",
          streamComplete: false,
        },
      ];
    });
  }, []);

  const markStakeholderCompleted = useCallback(() => {
    const stakeholderId = sessionStorage.getItem(ACTIVE_STAKEHOLDER_KEY);
    if (!stakeholderId) return;
    try {
      const raw = sessionStorage.getItem(COMPLETED_STAKEHOLDERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const ids = new Set(
        Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === "string")
          : [],
      );
      ids.add(stakeholderId);
      sessionStorage.setItem(
        COMPLETED_STAKEHOLDERS_KEY,
        JSON.stringify([...ids]),
      );
    } catch {
      sessionStorage.setItem(
        COMPLETED_STAKEHOLDERS_KEY,
        JSON.stringify([stakeholderId]),
      );
    }
  }, []);

  const appendStreamDelta = useCallback((t: string) => {
    setMessages((prev) => {
      let lastStreaming = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        const m = prev[i]!;
        if (
          m.from === "bot" &&
          m.streamTotal !== undefined &&
          m.streamComplete === false
        ) {
          lastStreaming = i;
          break;
        }
      }
      if (lastStreaming < 0) return prev;
      const next = [...prev];
      const m = next[lastStreaming]!;
      next[lastStreaming] = {
        ...m,
        streamTotal: (m.streamTotal ?? "") + t,
      };
      return next;
    });
  }, []);

  const markOpenStreamsComplete = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.from === "bot" &&
        m.streamTotal !== undefined &&
        m.streamComplete === false
          ? { ...m, streamComplete: true }
          : m,
      ),
    );
  }, []);

  /** Voice mode: collapse streaming bot bubbles to final text immediately (no typewriter). */
  const closeAndFinalizeBotStreams = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.from === "bot" && m.streamTotal !== undefined
          ? { id: m.id, from: "bot" as const, text: m.streamTotal ?? "" }
          : m,
      ),
    );
  }, []);

  const waitVoiceTypewriter = useCallback((id: string) => {
    return new Promise<void>((resolve) => {
      voiceTwResolversRef.current.set(id, resolve);
    });
  }, []);

  function flushVoiceTypewriterResolvers() {
    voiceTwResolversRef.current.forEach((fn) => {
      fn();
    });
    voiceTwResolversRef.current.clear();
  }

  function setInterviewModeAndPersist(mode: InterviewMode) {
    setInterviewMode(mode);
    if (typeof window !== "undefined")
      window.localStorage.setItem(INTERVIEW_MODE_KEY, mode);
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
      setComposerSpeechError(
        "Speech recognition is not supported in this browser.",
      );
      return;
    }
    setComposerSpeechError(null);
    sessionTranscriptRef.current = "";
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
            const text = result[0].transcript?.trim?.() ?? "";
            if (text) {
              hadSpeech = true;
              setComposerMicStatus("listening");
              if (result.isFinal) {
                sessionTranscriptRef.current +=
                  (sessionTranscriptRef.current ? " " : "") + text;
              }
            }
          }
        }
        if (hadSpeech) {
          clearSilenceTimeout();
          silenceTimeoutRef.current = setTimeout(() => {
            silenceTimeoutRef.current = null;
            stopComposerListening();
            setComposerSpeechError("No input detected.");
          }, SILENCE_TIMEOUT_MS);
        }
      };
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        clearSilenceTimeout();
        stopMediaTracks();
        recognitionRef.current = null;
        setComposerListening(false);
        setComposerMicStatus("idle");
        if (event.error === "not-allowed")
          setComposerSpeechError("Microphone access denied.");
        else if (event.error === "no-speech")
          setComposerSpeechError("No speech detected.");
        else if (event.error === "network")
          setComposerSpeechError("Network error. Check your connection.");
        else if (event.message) setComposerSpeechError(event.message);
        else setComposerSpeechError("Speech recognition error.");
      };
      recognition.onend = async () => {
        clearSilenceTimeout();
        stopMediaTracks();
        recognitionRef.current = null;
        setComposerListening(false);
        setComposerMicStatus("idle");
        const text = sessionTranscriptRef.current.trim();
        setVoicePanelTranscript("");
        if (text) setDraft((prev) => (prev ? `${prev} ${text}` : text));

        if (!text) return;
        await handleVoiceAnswerSubmit(text);
      };
      try {
        recognition.start();
        setComposerListening(true);
        setComposerMicStatus("speak_now");
        silenceTimeoutRef.current = setTimeout(() => {
          silenceTimeoutRef.current = null;
          stopComposerListening();
          setComposerSpeechError("No input detected.");
        }, SILENCE_TIMEOUT_MS);
      } catch {
        stopMediaTracks();
        setComposerSpeechError("Could not start microphone.");
      }
    };

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(startRecognition)
      .catch((err: Error) => {
        setComposerSpeechError(
          err.name === "NotAllowedError"
            ? "Microphone access denied."
            : "Microphone unavailable.",
        );
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
        setComposerMicStatus("idle");
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

  function clearVoiceSilenceTimeout() {
    if (voiceSilenceTimeoutRef.current) {
      clearTimeout(voiceSilenceTimeoutRef.current);
      voiceSilenceTimeoutRef.current = null;
    }
  }

  function startVoiceRecording() {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;
    voiceTranscriptRef.current = "";
    setVoicePanelTranscript("");
    stopVoicePanelTracks();
    clearVoiceSilenceTimeout();

    const startRecognition = (stream: MediaStream) => {
      voiceMediaStreamRef.current = stream;
      const ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
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
        let display = "";
        let hadSpeech = false;
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.length > 0) {
            const text = result[0].transcript?.trim?.() ?? "";
            if (text) {
              hadSpeech = true;
              if (result.isFinal) {
                voiceTranscriptRef.current +=
                  (voiceTranscriptRef.current ? " " : "") + text;
              }
              display += (display ? " " : "") + text;
            }
          }
        }
        if (display) setVoicePanelTranscript(display);
        if (hadSpeech) {
          clearVoiceSilenceTimeout();
          voiceSilenceTimeoutRef.current = setTimeout(() => {
            voiceSilenceTimeoutRef.current = null;
            stopVoiceRecording();
          }, VOICE_PANEL_SILENCE_TIMEOUT_MS);
        }
      };
      recognition.onerror = () => {
        clearVoiceSilenceTimeout();
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
        setVoicePanelMicStatus("idle");
        setVoicePanelTranscript("");
      };
      recognition.onend = async () => {
        clearVoiceSilenceTimeout();
        stopVoicePanelTracks();
        voiceRecognitionRef.current = null;
        setVoicePanelListening(false);
        setVoicePanelMicStatus("idle");
        setVoiceVolume(0);
        setVoicePanelTranscript("");
        const text = voiceTranscriptRef.current.trim();
        setVoicePanelTranscript("");
        if (text) setDraft((prev) => (prev ? `${prev} ${text}` : text));

        if (!text) return;
        await handleVoiceAnswerSubmit(text);
      };
      try {
        recognition.start();
        setVoicePanelListening(true);
        setVoicePanelMicStatus("listening");
        voiceSilenceTimeoutRef.current = setTimeout(() => {
          voiceSilenceTimeoutRef.current = null;
          stopVoiceRecording();
        }, VOICE_PANEL_SILENCE_TIMEOUT_MS);
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
        clearVoiceSilenceTimeout();
        stopVoicePanelTracks();
        setVoicePanelListening(false);
        setVoicePanelMicStatus("idle");
      }
    };

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(startRecognition)
      .catch(() => {
        clearVoiceSilenceTimeout();
        setVoicePanelListening(false);
        setVoicePanelMicStatus("idle");
      });
  }

  function stopVoiceRecording() {
    clearVoiceSilenceTimeout();
    stopVoicePanelTracks();
    const recognition = voiceRecognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        voiceRecognitionRef.current = null;
        setVoicePanelListening(false);
        setVoicePanelMicStatus("idle");
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
      clearVoiceSilenceTimeout();
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

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (interviewMode !== "voice") return;
    requestAnimationFrame(() => {
      const el = voiceAgentLogRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [messages, interviewMode, voiceDisplayedBotId]);

  const sessionExpired = remainingSeconds <= 0;
  const countdown = useMemo(
    () => formatRemaining(remainingSeconds),
    [remainingSeconds],
  );

  useEffect(() => {
    interviewModeRef.current = interviewMode;
  }, [interviewMode]);

  useEffect(() => {
    completedRef.current = completed;
  }, [completed]);

  useEffect(() => {
    if (!completed || !interviewId || backendCompletionSyncedRef.current)
      return;
    backendCompletionSyncedRef.current = true;
    markStakeholderCompleted();
    void endInterview(interviewId).catch(() => {
      // non-fatal: UI completion should still be reflected locally
    });
  }, [completed, interviewId, markStakeholderCompleted]);

  useEffect(() => {
    sessionExpiredRef.current = sessionExpired;
  }, [sessionExpired]);

  function prepareVoiceAgentSpeech() {
    const synth = getSpeechSynthesis();
    if (synth) synth.cancel();
    voiceTtsBufferRef.current = "";
    voiceTtsUtteranceCountRef.current = 0;
    voiceAfterTtsRef.current = null;
  }

  function speakUtteranceCounted(text: string) {
    const synth = getSpeechSynthesis();
    if (!synth) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const u = new SpeechSynthesisUtterance(trimmed);
    configureSpeechUtterance(u);
    voiceTtsUtteranceCountRef.current += 1;
    u.onend = () => {
      voiceTtsUtteranceCountRef.current -= 1;
      if (voiceTtsUtteranceCountRef.current <= 0) {
        voiceTtsUtteranceCountRef.current = 0;
        const fn = voiceAfterTtsRef.current;
        if (fn) {
          voiceAfterTtsRef.current = null;
          fn();
        }
      }
    };
    synth.speak(u);
  }

  /** Accumulate streamed text only; one utterance is spoken in flushVoiceTtsRemainder when the stream ends. */
  function feedVoiceTtsDelta(chunk: string) {
    voiceTtsBufferRef.current += chunk;
  }

  function flushVoiceTtsRemainder() {
    const rest = voiceTtsBufferRef.current.trim();
    voiceTtsBufferRef.current = "";
    if (rest) speakUtteranceCounted(rest);
  }

  async function waitUntilSpeechIdle() {
    const synth = getSpeechSynthesis();
    if (!synth) return;
    for (let i = 0; i < 400; i++) {
      if (!synth.speaking && !synth.pending) {
        return;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  function speakUtteranceSimple(text: string): Promise<void> {
    return new Promise((resolve) => {
      const synth = getSpeechSynthesis();
      if (!synth) {
        resolve();
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(trimmed);
      configureSpeechUtterance(u);
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
  }

  voiceBootRef.current = {
    feedVoiceTtsDelta,
    flushVoiceTtsRemainder,
    prepareVoiceAgentSpeech,
    closeAndFinalizeBotStreams,
    waitUntilSpeechIdle,
    speakUtteranceSimple,
    startVoiceRecording,
  };

  async function handleVoiceAnswerSubmit(text: string) {
    if (!interviewId || !currentQuestion || completed) return;
    if (voiceAnswerInFlightRef.current) return;
    voiceAnswerInFlightRef.current = true;

    const isVoiceUi = interviewMode === "voice";

    setMessages((prev) => [
      ...prev,
      { id: `voice-user-${Date.now()}`, from: "user", text },
    ]);

    const isVoice = isVoiceUi;
    if (isVoice) prepareVoiceAgentSpeech();

    const resolveVoiceSubmitCycle = () => {
      const r = voiceSubmitCycleResolveRef.current;
      if (r) {
        voiceSubmitCycleResolveRef.current = null;
        r();
      }
    };

    type VoiceAnswerQ =
      | { type: "begin"; part: string }
      | { type: "delta"; text: string }
      | { type: "done"; payload: AnswerStreamDonePayload };

    try {
      if (isVoice) {
        const q: VoiceAnswerQ[] = [];

        const finalizeOpenVoicePart = async () => {
          const partId = voiceCurrentPartOpenIdRef.current;
          if (!partId) return;
          voiceCurrentPartOpenIdRef.current = null;
          markOpenStreamsComplete();
          flushVoiceTtsRemainder();
          await Promise.all([
            waitUntilSpeechIdle(),
            waitVoiceTypewriter(partId),
          ]);
        };

        const applyVoiceAnswerDone = (payload: AnswerStreamDonePayload) => {
          const { result, next_question, interview_completed } = payload;
          if (!result) return;
          if (result.stay_on_question === true) return;
          if (result.status === "recorded") {
            if (interview_completed || !next_question) {
              setCompleted(true);
              setCurrentQuestion(null);
            } else {
              setCurrentQuestion(next_question);
            }
          }
        };

        const pumpVoiceAnswerQueue = async () => {
          if (voiceAnswerPumpLockRef.current) return;
          voiceAnswerPumpLockRef.current = true;
          try {
            outer: for (;;) {
              while (q.length > 0) {
                const item = q[0]!;
                if (item.type === "begin") {
                  await finalizeOpenVoicePart();
                  q.shift();
                  appendStreamBeginPart(item.part);
                  const mid = lastCreatedBotStreamIdRef.current;
                  if (mid) {
                    setVoiceDisplayedBotId(mid);
                    voiceCurrentPartOpenIdRef.current = mid;
                  }
                  while (q[0]?.type === "delta") {
                    const d = q.shift() as Extract<
                      VoiceAnswerQ,
                      { type: "delta" }
                    >;
                    appendStreamDelta(d.text);
                    feedVoiceTtsDelta(d.text);
                  }
                } else if (item.type === "delta") {
                  const deltaEv = item;
                  q.shift();
                  appendStreamDelta(deltaEv.text);
                  feedVoiceTtsDelta(deltaEv.text);
                } else if (item.type === "done") {
                  await finalizeOpenVoicePart();
                  q.shift();
                  applyVoiceAnswerDone(item.payload);
                  resolveVoiceSubmitCycle();
                  break outer;
                }
              }
              break;
            }
          } finally {
            voiceAnswerPumpLockRef.current = false;
            if (q.length > 0) void pumpVoiceAnswerQueue();
          }
        };

        const voiceSubmitDone = new Promise<void>((resolve) => {
          voiceSubmitCycleResolveRef.current = resolve;
        });

        await submitAnswerStream(
          interviewId,
          {
            question_id: currentQuestion.question_id,
            answer_text: text,
          },
          {
            onBeginPart: (part) => {
              q.push({ type: "begin", part });
              void pumpVoiceAnswerQueue();
            },
            onDelta: (t) => {
              q.push({ type: "delta", text: t });
              void pumpVoiceAnswerQueue();
            },
            onDone: (payload) => {
              q.push({ type: "done", payload });
              void pumpVoiceAnswerQueue();
            },
            onError: (msg) => {
              q.length = 0;
              flushVoiceTypewriterResolvers();
              voiceCurrentPartOpenIdRef.current = null;
              voiceAnswerPumpLockRef.current = false;
              prepareVoiceAgentSpeech();
              closeAndFinalizeBotStreams();
              setError(msg || "Failed to submit response.");
              const errId = `voice-error-${Date.now()}`;
              setVoiceDisplayedBotId(errId);
              setMessages((prev) => [
                ...prev,
                {
                  id: errId,
                  from: "bot",
                  text: "Oops — something went wrong submitting your answer.",
                },
              ]);
              resolveVoiceSubmitCycle();
            },
          },
        );
        await voiceSubmitDone;
      } else {
        await submitAnswerStream(
          interviewId,
          {
            question_id: currentQuestion.question_id,
            answer_text: text,
          },
          {
            onBeginPart: appendStreamBeginPart,
            onDelta: appendStreamDelta,
            onDone: ({
              result,
              next_question,
              interview_completed,
            }: AnswerStreamDonePayload) => {
              markOpenStreamsComplete();
              if (!result) return;
              if (result.stay_on_question === true) return;
              if (result.status === "recorded") {
                if (interview_completed || !next_question) {
                  setCompleted(true);
                  setCurrentQuestion(null);
                } else {
                  setCurrentQuestion(next_question);
                }
              }
            },
            onError: (msg) => {
              setError(msg || "Failed to submit response.");
              setMessages((prev) => [
                ...prev,
                {
                  id: `voice-error-${Date.now()}`,
                  from: "bot",
                  text: "Oops — something went wrong submitting your answer.",
                },
              ]);
            },
          },
        );
      }
    } catch (err) {
      console.error(err);
      if (isVoice) {
        prepareVoiceAgentSpeech();
        flushVoiceTypewriterResolvers();
        voiceCurrentPartOpenIdRef.current = null;
        closeAndFinalizeBotStreams();
      }
      const errId = `voice-error-${Date.now()}`;
      if (isVoice) setVoiceDisplayedBotId(errId);
      setMessages((prev) => [
        ...prev,
        {
          id: errId,
          from: "bot",
          text: "Oops — something went wrong submitting your answer.",
        },
      ]);
      resolveVoiceSubmitCycle();
    } finally {
      voiceAnswerInFlightRef.current = false;
    }
  }

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        setLoading(true);
        setError(null);

        if (!interviewId) {
          navigate("/");
          return;
        }

        // ✅ Load real section progress
        try {
          const sec = await getInterviewSections(interviewId);
          setSections(sec.sections);
        } catch (err) {
          console.error("Failed to load sections:", err);
        }

        // ✅ Validate interview by calling firstIntro
        const summaryRaw = sessionStorage.getItem(
          "ciassist_engagement_summary",
        );
        const summary = summaryRaw ? JSON.parse(summaryRaw) : null;

        const briefText =
          summary?.summary && typeof summary.summary === "string"
            ? summary.summary.slice(0, 800)
            : undefined;

        const intro = await firstIntro(interviewId, briefText);

        if (!mounted) return;

        setMessages([
          {
            id: "m-welcome",
            from: "bot",
            text:
              "Welcome to CIMMIE. This is your scheduled Change Impact Assessment interview. " +
              "We will proceed topic by topic and capture evidence across People, Process, Technology, and Data.",
          },
          { id: "m-intro", from: "bot", text: intro.context_brief },
        ]);
        const modeBoot = getStoredInterviewMode();

        if (modeBoot === "text") {
          setMessages([
            {
              id: "m-welcome",
              from: "bot",
              text: "",
              streamTotal: WELCOME_BOT_TEXT,
              streamComplete: true,
            },
          ]);

          await firstIntroStream(interviewId, briefText, {
            onBeginPart: appendStreamBeginPart,
            onDelta: appendStreamDelta,
            onDone: () => {
              markOpenStreamsComplete();
            },
            onError: (msg) => {
              if (mounted && msg) {
                setError(
                  msg ||
                    "Failed to load introduction. Ensure context extraction is complete.",
                );
              }
            },
          });
        } else {
          setMessages([
            {
              id: "m-welcome",
              from: "bot",
              text: "",
              streamTotal: WELCOME_BOT_TEXT,
              streamComplete: true,
            },
          ]);
          setVoiceDisplayedBotId("m-welcome");
          voiceBootRef.current.prepareVoiceAgentSpeech();
          let introBotId = "";
          const synthOk =
            typeof window !== "undefined" && !!window.speechSynthesis;
          if (synthOk) {
            setVoiceAwaitingAudioUnlock(true);
            await new Promise<void>((resolve) => {
              if (!mounted) {
                setVoiceAwaitingAudioUnlock(false);
                resolve();
                return;
              }
              voiceAudioUnlockResolveRef.current = () => {
                voiceAudioUnlockResolveRef.current = null;
                setVoiceAwaitingAudioUnlock(false);
                resolve();
              };
            });
            if (!mounted) return;
            const s = getSpeechSynthesis();
            if (s) void s.getVoices();
            await waitForSpeechSynthesisVoices();
            if (!mounted) return;
            await Promise.all([
              voiceBootRef.current.speakUtteranceSimple(WELCOME_BOT_TEXT),
              waitVoiceTypewriter("m-welcome"),
            ]);
            if (!mounted) return;
          } else {
            await waitVoiceTypewriter("m-welcome");
            if (!mounted) return;
            setMessages((prev) => [
              ...prev,
              {
                id: "voice-tts-unsupported",
                from: "bot",
                text: "This browser does not support spoken readout. Switch to Text mode or use Chrome or Edge.",
              },
            ]);
            setVoiceDisplayedBotId("voice-tts-unsupported");
          }
          await firstIntroStream(interviewId, briefText, {
            onBeginPart: (_part: string) => {
              appendStreamBeginPart(_part);
              const mid = lastCreatedBotStreamIdRef.current ?? "";
              introBotId = mid;
              if (mid) setVoiceDisplayedBotId(mid);
            },
            onDelta: (t) => {
              appendStreamDelta(t);
              voiceBootRef.current.feedVoiceTtsDelta(t);
            },
            onDone: () => {
              markOpenStreamsComplete();
              voiceBootRef.current.flushVoiceTtsRemainder();
            },
            onError: (msg) => {
              if (mounted && msg) {
                setError(
                  msg ||
                    "Failed to load introduction. Ensure context extraction is complete.",
                );
              }
            },
          });
          if (!mounted) return;
          await voiceBootRef.current.waitUntilSpeechIdle();
          if (!mounted) return;
          if (introBotId) await waitVoiceTypewriter(introBotId);
          if (!mounted) return;
        }

        if (!mounted) return;

        // ✅ Load the first question (existing interview)
        const firstQ = await getNextQuestion(interviewId);

        if (!mounted) return;

        if (firstQ.section === "DONE" || firstQ.question_id === "-1") {
          setCompleted(true);
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-complete-${Date.now()}`,
              from: "bot",
              text: "No questions available.",
            },
          ]);
        } else {
          setCurrentQuestion(firstQ);
          setMessages((prev) => [
            ...prev,
            modeBoot === "text"
              ? {
                  id: `q-${firstQ.question_id}`,
                  from: "bot",
                  text: "",
                  streamTotal: firstQ.question_text,
                  streamComplete: true,
                }
              : {
                  id: `q-${firstQ.question_id}`,
                  from: "bot",
                  text: "",
                  streamTotal: firstQ.question_text,
                  streamComplete: true,
                },
          ]);
        }

        // (4) start timer (base 30 mins + accumulated facilitator extensions)
        const extensionMinutes = getInterviewExtensionMinutes(interviewId);
        const totalSessionMinutes = SESSION_MINUTES + extensionMinutes;
        appliedExtensionMinutesRef.current = extensionMinutes;
        setSessionMinutes(totalSessionMinutes);
        setRemainingSeconds(totalSessionMinutes * 60);
      } catch (e: any) {
        console.error(e);
        setError(
          "Invalid or expired interview link. Please contact your facilitator.",
        );
        navigate("/");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();
    return () => {
      mounted = false;
      const unlock = voiceAudioUnlockResolveRef.current;
      if (unlock) {
        voiceAudioUnlockResolveRef.current = null;
        unlock();
      }
      setVoiceAwaitingAudioUnlock(false);
    };
  }, [
    appendStreamBeginPart,
    appendStreamDelta,
    markOpenStreamsComplete,
    closeAndFinalizeBotStreams,
    waitVoiceTypewriter,
  ]);

  useEffect(() => {
    if (!interviewId) return;
    const syncExtension = () => {
      const nextExtensionMinutes = getInterviewExtensionMinutes(interviewId);
      const prevExtensionMinutes = appliedExtensionMinutesRef.current;
      if (nextExtensionMinutes <= prevExtensionMinutes) return;
      const deltaMinutes = nextExtensionMinutes - prevExtensionMinutes;
      appliedExtensionMinutesRef.current = nextExtensionMinutes;
      setSessionMinutes(SESSION_MINUTES + nextExtensionMinutes);
      setRemainingSeconds((prev) => prev + deltaMinutes * 60);
    };

    const timer = window.setInterval(syncExtension, 2000);
    return () => window.clearInterval(timer);
  }, [interviewId]);

  useEffect(() => {
    if (sessionExpired && !hasEndedRef.current && interviewId && !completed) {
      hasEndedRef.current = true;
      (async () => {
        try {
          backendCompletionSyncedRef.current = true;
          await endInterview(interviewId);
        } catch (e) {
          // non-fatal
        } finally {
          markStakeholderCompleted();
          setCompleted(true);
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-ended-${Date.now()}`,
              from: "bot",
              text: "Session time has ended. Thank you for your participation.",
            },
          ]);
        }
      })();
    }
  }, [sessionExpired, interviewId, completed, markStakeholderCompleted]);

  async function submitMessage(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    if (
      !draft.trim() ||
      sessionExpired ||
      completed ||
      !interviewId ||
      !currentQuestion ||
      submitting
    )
      return;

    const text = draft.trim();
    const userMsg: Message = { id: `user-${Date.now()}`, from: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setSubmitting(true);

    try {
      if (interviewMode === "text") {
        await submitAnswerStream(
          interviewId,
          {
            question_id: currentQuestion.question_id,
            answer_text: text,
          },
          {
            onBeginPart: appendStreamBeginPart,
            onDelta: appendStreamDelta,
            onDone: ({ result, next_question, interview_completed }) => {
              markOpenStreamsComplete();
              if (!result) return;
              if (result.stay_on_question === true) return;
              if (result.status === "recorded") {
                if (interview_completed || !next_question) {
                  setCompleted(true);
                  setCurrentQuestion(null);
                } else {
                  setCurrentQuestion(next_question);
                }
              }
            },
            onError: (msg) => {
              setError(msg || "Failed to submit response.");
              setMessages((prev) => [
                ...prev,
                {
                  id: `bot-error-${Date.now()}`,
                  from: "bot",
                  text: "Sorry—there was an error capturing your response. Please try again.",
                },
              ]);
            },
          },
        );
      } else {
        // 1) Submit answer to the current question
        const result = await submitAnswer(interviewId, {
          question_id: currentQuestion.question_id,
          answer_text: text,
        });

        // 2) Clarification or Follow-up → STAY on same question
        if (result.stay_on_question === true) {
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              from: "bot",
              text: result.bot_reply,
            },
          ]);
          return; // IMPORTANT: do not fetch next question
        }

        // 3) Recorded → show readback and possibly a “moving on” nudge
        if (result.status === "recorded") {
          if (result.readback) {
            try {
              const sec = await getInterviewSections(interviewId);
              setSections(sec.sections);
            } catch (err) {
              console.error("Failed to refresh sections:", err);
            }

            setMessages((prev) => [
              ...prev,
              {
                id: `readback-${Date.now()}`,
                from: "bot",
                text: result.readback!,
              },
            ]);
          }

          if (result?.reason === "max_followups_reached") {
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-${Date.now()}`,
                from: "bot",
                text: "Thanks — let's move ahead.",
              },
            ]);
          }

          // 4) Fetch NEXT question only after recorded
          const nextQ = await getNextQuestion(interviewId);

          if (nextQ.section === "DONE" || nextQ.question_id === "-1") {
            setCompleted(true);
            setCurrentQuestion(null);
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-complete-${Date.now()}`,
                from: "bot",
                text: "Interview completed. Thank you for your responses.",
              },
            ]);
          } else {
            setCurrentQuestion(nextQ);
            setMessages((prev) => [
              ...prev,
              {
                id: `q-${nextQ.question_id}`,
                from: "bot",
                text: nextQ.question_text,
              },
            ]);
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to submit response.");
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-error-${Date.now()}`,
          from: "bot",
          text: "Sorry—there was an error capturing your response. Please try again.",
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEndInterviewClick() {
    if (completed || !interviewId || ending) return;

    const proceed = window.confirm(
      "Are you sure you want to end this interview now? You won’t be able to add more responses.",
    );
    if (!proceed) return;

    try {
      setEnding(true);
      hasEndedRef.current = true;
      backendCompletionSyncedRef.current = true;
      await endInterview(interviewId);
      markStakeholderCompleted();
      setCompleted(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-ended-manual-${Date.now()}`,
          from: "bot",
          text: "Interview ended by facilitator. Thank you for your participation.",
        },
      ]);
    } catch (e: any) {
      console.error(e);
      hasEndedRef.current = false;
      alert(e?.message || "Failed to end the interview. Please try again.");
    } finally {
      setEnding(false);
    }
  }

  const handleVoiceAudioUnlockClick = useCallback(() => {
    const s = getSpeechSynthesis();
    if (s) void s.getVoices();
    voiceAudioUnlockResolveRef.current?.();
  }, []);

  /** Text chat: only one bot stream bubble mounts at a time so typewriters run in order. */
  const textChatFirstPendingStreamIndex = useMemo(
    () =>
      messages.findIndex(
        (m) => m.from === "bot" && m.streamTotal !== undefined,
      ),
    [messages],
  );

  return (
    <div className="cimmie-page">
      <header className="cimmie-header card">
        <div className="cimmie-header-top">
          <div className="cimmie-header-title-row">
            <img
              src="/cimmie-robot.jpg"
              alt=""
              className="cimmie-page-robot-icon"
              aria-hidden="true"
            />
            <p className="cimmie-kicker">CIMMIE Interview Session</p>
          </div>
          <h1>Scheduled Stakeholder Interview</h1>
          <p>
            One-time access link validated. This session is scoped to this
            interview only and is time-limited. Post-interview outputs and
            internal sources are restricted.
          </p>
        </div>
        <div className="cimmie-header-bottom">
          <div className="cimmie-header-left">
            <div className="session-panel">
              <div>
                <span className="label">Session status</span>
                <strong>{sessionExpired ? "Closed" : "Active"}</strong>
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
              className="btn btn-extend-session btn-end-interview"
              onClick={handleEndInterviewClick}
            >
              End Interview
            </button>
          </div>
          <div className="interview-progress-card card">
            <h2 className="interview-progress-card-title">
              Interview Progress
            </h2>
            <div
              className="progress-pipe-vertical"
              role="list"
              aria-label="Interview topics"
            >
              {sections.map((section, index) => {
                const state = getStepState(index, sections);
                const isLast = index === sections.length - 1;
                return (
                  <div
                    key={section.section_index}
                    className="progress-pipe-step"
                    role="listitem"
                  >
                    <div className="progress-pipe-step-track">
                      {index > 0 && (
                        <div
                          className={`progress-pipe-connector progress-pipe-connector-above ${getStepState(index - 1, sections) === "completed" ? "progress-pipe-connector-completed" : ""}`}
                          aria-hidden="true"
                        />
                      )}
                      <div
                        className={`progress-pipe-dot progress-pipe-dot-${state}`}
                        aria-current={state === "active" ? "step" : undefined}
                      >
                        {state === "completed" && <StepCheckmark />}
                        {state === "active" && <StepActiveDot />}
                        {state === "upcoming" && (
                          <span className="progress-pipe-dot-number">
                            {index + 1}
                          </span>
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={`progress-pipe-connector progress-pipe-connector-below ${state === "completed" ? "progress-pipe-connector-completed" : ""}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <span
                      className={`progress-pipe-label progress-pipe-label-${state}`}
                    >
                      {section.section_title}
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
            This session is time-bound. The link will expire in{" "}
            {sessionMinutes} minutes.
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
        {error
          ? error
          : "Stakeholder view restrictions: no access to summary outputs, populated template files, synthesis from other interviews, or internal knowledge repositories."}
      </section>

      <section className="mode-toggle-card card" aria-label="Input mode">
        <div
          className="interview-mode-toggle"
          role="group"
          aria-label="Interview mode"
        >
          <button
            type="button"
            className={`interview-mode-btn ${interviewMode === "text" ? "interview-mode-btn-active" : ""}`}
            onClick={() => setInterviewModeAndPersist("text")}
            aria-pressed={interviewMode === "text"}
          >
            <TextMessageIcon />
            <span>Text</span>
          </button>
          <button
            type="button"
            className={`interview-mode-btn ${interviewMode === "voice" ? "interview-mode-btn-active" : ""}`}
            onClick={() => setInterviewModeAndPersist("voice")}
            aria-pressed={interviewMode === "voice"}
          >
            <MicIcon />
            <span>Voice</span>
          </button>
        </div>
      </section>

      {/* Exclusive rendering: only one mode mounted—no text chat when voice, no voice UI when text. */}
      {interviewMode === "text" && (
        <section className="chat-shell card">
          <div className="chat-log" ref={logRef}>
            {loading && messages.length === 0 ? (
              <div className="chat-bubble bot">Preparing your interview…</div>
            ) : (
              messages.map((message, index) => {
                const hideUntilPriorStreamSettled =
                  textChatFirstPendingStreamIndex >= 0 &&
                  message.from === "bot" &&
                  message.streamTotal !== undefined &&
                  index !== textChatFirstPendingStreamIndex;
                if (hideUntilPriorStreamSettled) {
                  return <Fragment key={message.id} />;
                }
                return (
                  <div
                    key={message.id}
                    className={`chat-bubble ${message.from}`}
                  >
                    {message.from === "bot" ? (
                      <div className="chat-bubble-inner">
                        <img
                          src="/cimmie-robot.jpg"
                          alt=""
                          className="chat-bubble-avatar"
                          aria-hidden="true"
                        />
                        {message.streamTotal !== undefined ? (
                          <BotTypewriterBlock
                            messageId={message.id}
                            streamTotal={message.streamTotal ?? ""}
                            streamComplete={message.streamComplete ?? true}
                            onTick={scrollChatToBottom}
                            onSettled={handleBotStreamSettled}
                          />
                        ) : (
                          <span className="chat-bubble-text">
                            {message.text}
                          </span>
                        )}
                      </div>
                    ) : (
                      message.text
                    )}
                  </div>
                );
              })
            )}
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
                className={`chat-compose-status ${composerListening ? "chat-compose-status-listening" : ""} ${composerSpeechError ? "chat-compose-status-error" : ""}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {composerMicStatus === "speak_now" && "Speak Now"}
                {composerMicStatus === "listening" && "I am listening…"}
                {composerMicStatus === "idle" &&
                  composerSpeechError &&
                  composerSpeechError}
                {composerMicStatus === "idle" &&
                  !composerSpeechError &&
                  "\u00A0"}
              </p>
              <div className="chat-compose-actions">
                <button
                  type="button"
                  className={`chat-compose-mic ${composerListening ? "chat-compose-mic-active" : ""} ${composerMicStatus === "listening" ? "chat-compose-mic-listening" : ""}`}
                  onClick={toggleComposerListening}
                  disabled={sessionExpired}
                  aria-label={
                    composerListening ? "Stop listening" : "Dictate message"
                  }
                  aria-pressed={composerListening}
                >
                  <MicIcon />
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={sessionExpired || !draft.trim()}
                >
                  Submit response
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {interviewMode === "voice" && (
        <section className="voice-fullscreen" aria-label="Voice interview">
          {voiceAwaitingAudioUnlock ? (
            <div
              className="voice-audio-unlock-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="voice-audio-unlock-title"
            >
              <div className="voice-audio-unlock-panel card">
                <h2
                  id="voice-audio-unlock-title"
                  className="voice-audio-unlock-title"
                >
                  Enable voice
                </h2>
                <p className="voice-audio-unlock-copy">
                  Your browser needs a tap here before it can play CIMMIE&apos;s
                  spoken questions and replies.
                </p>
                <button
                  type="button"
                  className="btn btn-primary voice-audio-unlock-btn"
                  onClick={handleVoiceAudioUnlockClick}
                >
                  Start voice interview
                </button>
              </div>
            </div>
          ) : null}
          <div
            className="voice-ui-panel voice-ui-panel-fullscreen"
            aria-label="Voice input"
          >
            <div
              className={`voice-ui-orb ${voicePanelMicStatus === "speak_now" ? "voice-ui-orb-speak-now" : ""} ${voicePanelMicStatus === "listening" ? "voice-ui-orb-listening" : ""}`}
              style={
                voicePanelMicStatus === "listening"
                  ? { ["--voice-level" as string]: voiceVolume }
                  : undefined
              }
            >
              <div
                className={`voice-ui-orb-wave ${voicePanelMicStatus === "listening" ? "voice-ui-orb-wave-listening" : ""}`}
                aria-hidden="true"
                style={
                  voicePanelMicStatus === "listening"
                    ? { ["--voice-level" as string]: voiceVolume }
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
                <img
                  src="/cimmie-robot.jpg"
                  alt=""
                  className="voice-ui-orb-icon-img"
                />
              </div>
            </div>
            <div
              className="voice-agent-transcript"
              ref={voiceAgentLogRef}
              aria-label="CIMMIE agent transcript"
            >
              {loading &&
              messages.filter((m) => m.from === "bot").length === 0 ? (
                <div className="voice-agent-bubble chat-bubble bot">
                  <div className="chat-bubble-inner">
                    <img
                      src="/cimmie-robot.jpg"
                      alt=""
                      className="chat-bubble-avatar"
                      aria-hidden="true"
                    />
                    <span className="chat-bubble-text">
                      Preparing your interview…
                    </span>
                  </div>
                </div>
              ) : (
                (() => {
                  const voiceBots = messages.filter((m) => m.from === "bot");
                  const vm =
                    (voiceDisplayedBotId != null
                      ? voiceBots.find((m) => m.id === voiceDisplayedBotId)
                      : null) ?? voiceBots.at(-1);
                  if (!vm) return null;
                  const streaming =
                    vm.streamTotal !== undefined && vm.streamComplete === false;
                  return (
                    <div
                      key={vm.id}
                      className={`voice-agent-bubble chat-bubble bot${streaming ? " voice-agent-bubble-streaming" : ""}`}
                    >
                      <div className="chat-bubble-inner">
                        <img
                          src="/cimmie-robot.jpg"
                          alt=""
                          className="chat-bubble-avatar"
                          aria-hidden="true"
                        />
                        {vm.streamTotal !== undefined ? (
                          <BotTypewriterBlock
                            messageId={vm.id}
                            streamTotal={vm.streamTotal ?? ""}
                            streamComplete={vm.streamComplete ?? true}
                            onTick={() => {
                              requestAnimationFrame(() => {
                                const el = voiceAgentLogRef.current;
                                if (!el) return;
                                el.scrollTo({
                                  top: el.scrollHeight,
                                  behavior: "smooth",
                                });
                              });
                            }}
                            onSettled={handleBotStreamSettled}
                          />
                        ) : (
                          <span className="chat-bubble-text">{vm.text}</span>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
            <p className="voice-ui-status" role="status" aria-live="polite">
              {voicePanelMicStatus === "idle" && "Speak now"}
              {voicePanelMicStatus === "speak_now" && "Speak now"}
              {voicePanelMicStatus === "listening" && "I am listening"}
            </p>
            {voicePanelTranscript && (
              <div
                className="voice-ui-transcript"
                role="log"
                aria-live="polite"
              >
                {voicePanelTranscript}
              </div>
            )}
            <button
              type="button"
              className={`voice-ui-mic ${voicePanelListening ? "voice-ui-mic-active" : ""} ${voicePanelMicStatus === "listening" ? "voice-ui-mic-listening" : ""}`}
              style={
                voicePanelMicStatus === "listening"
                  ? { ["--voice-level" as string]: voiceVolume }
                  : undefined
              }
              onClick={toggleVoicePanelMic}
              disabled={sessionExpired}
              aria-label={
                voicePanelListening ? "Stop listening" : "Start listening"
              }
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
