/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPEECH_API_KEY: string;
  readonly VITE_SPEECH_REGION: string;
  readonly VITE_DEFAULT_STT_LANG: string;
  readonly VITE_DEFAULT_TTS_VOICE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}