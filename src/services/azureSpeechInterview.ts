import * as sdk from "microsoft-cognitiveservices-speech-sdk";

const DEFAULT_STT_LANG = "en-US";
const DEFAULT_TTS_VOICE = "en-US-JennyNeural"; // e.g. "en-US-JennyNeural"
const SPEECH_API_KEY = import.meta.env.VITE_SPEECH_API_KEY as string | "";
const SPEECH_REGION = "swedencentral";

export function isAzureSpeechConfigured(): boolean {
  return Boolean(SPEECH_API_KEY?.trim() && SPEECH_REGION?.trim());
}

export function createInterviewSpeechConfig(): sdk.SpeechConfig {
  const key = SPEECH_API_KEY.trim();
  const region = SPEECH_REGION.trim();
  const c = sdk.SpeechConfig.fromSubscription(key, region);
  c.speechRecognitionLanguage = (DEFAULT_STT_LANG || "en-US").trim() || "en-US";
  const voice = (DEFAULT_TTS_VOICE || "").trim();
  if (voice) c.speechSynthesisVoiceName = voice;
  return c;
}

export type AzureSttDisplayHandler = (fullDisplayText: string) => void;
export type AzureSttFinalHandler = (phrase: string) => void;

export type AzureContinuousStt = {
  stop: () => Promise<void>;
};

/**
 * Microphone → Azure continuous speech-to-text on the given MediaStream
 * (same stream can be used for Web Audio visualisation).
 */
export function startAzureContinuousStt(
  speechConfig: sdk.SpeechConfig,
  mediaStream: MediaStream,
  handlers: {
    onDisplay: AzureSttDisplayHandler;
    onFinalPhrase: AzureSttFinalHandler;
    onError: (message: string) => void;
  },
): Promise<AzureContinuousStt> {
  const audioConfig = sdk.AudioConfig.fromStreamInput(mediaStream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  let accumulated = "";

  recognizer.recognizing = (_s, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
      const interim = e.result.text?.trim() ?? "";
      if (!interim) return;
      handlers.onDisplay(
        accumulated ? `${accumulated} ${interim}`.trim() : interim,
      );
    }
  };

  recognizer.recognized = (_s, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
      const phrase = e.result.text?.trim() ?? "";
      if (phrase) {
        accumulated = accumulated ? `${accumulated} ${phrase}`.trim() : phrase;
        handlers.onFinalPhrase(phrase);
        handlers.onDisplay(accumulated);
      }
    }
  };

  recognizer.canceled = (_s, e) => {
    if (e.reason === sdk.CancellationReason.Error) {
      handlers.onError(e.errorDetails || "Speech recognition error.");
    }
  };

  return new Promise((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(
      () => {
        resolve({
          stop: () =>
            new Promise<void>((res, rej) => {
              recognizer.stopContinuousRecognitionAsync(
                () => {
                  try {
                    recognizer.close();
                  } catch {
                    /* ignore */
                  }
                  res();
                },
                (err) => {
                  try {
                    recognizer.close();
                  } catch {
                    /* ignore */
                  }
                  rej(err);
                },
              );
            }),
        });
      },
      (err) => {
        try {
          recognizer.close();
        } catch {
          /* ignore */
        }
        reject(new Error(err || "Failed to start speech recognition."));
      },
    );
  });
}

/**
 * Queues Azure TTS utterances; supports cancel for barge-in / reset.
 */
export class AzureInterviewTts {
  private readonly speechConfig: sdk.SpeechConfig;
  private chain: Promise<void> = Promise.resolve();
  private activeSynth: sdk.SpeechSynthesizer | null = null;
  private generation = 0;

  constructor(speechConfig: sdk.SpeechConfig) {
    this.speechConfig = speechConfig;
  }

  cancel(): void {
    this.generation += 1;
    const s = this.activeSynth;
    this.activeSynth = null;
    if (s) {
      try {
        s.close(
          () => {},
          () => {},
        );
      } catch {
        /* ignore */
      }
    }
    this.chain = Promise.resolve();
  }

  /**
   * Speak after prior utterances finish. Audio plays via default system output (speakers).
   */
  speak(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();

    const gen = this.generation;
    const run = async (): Promise<void> => {
      if (gen !== this.generation) return;
      await this.speakOne(trimmed, gen);
    };

    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  private speakOne(text: string, gen: number): Promise<void> {
    if (gen !== this.generation) return Promise.resolve();

    return new Promise((resolve) => {
      const audioOutput = sdk.AudioConfig.fromDefaultSpeakerOutput();
      const synthesizer = new sdk.SpeechSynthesizer(
        this.speechConfig,
        audioOutput,
      );
      this.activeSynth = synthesizer;
      synthesizer.speakTextAsync(
        text,
        (result) => {
          if (this.activeSynth === synthesizer) this.activeSynth = null;
          try {
            synthesizer.close();
          } catch {
            /* ignore */
          }
          if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
            console.warn("Azure TTS completed with reason", result.reason);
          }
          resolve();
        },
        (err) => {
          if (this.activeSynth === synthesizer) this.activeSynth = null;
          try {
            synthesizer.close();
          } catch {
            /* ignore */
          }
          console.warn("Azure TTS error", err);
          resolve();
        },
      );
    });
  }

  async waitUntilIdle(): Promise<void> {
    await this.chain;
    for (let i = 0; i < 200; i++) {
      if (!this.activeSynth) return;
      await new Promise((r) => setTimeout(r, 40));
    }
  }
}
