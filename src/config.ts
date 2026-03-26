/**
 * App config – values from environment (see .env.example).
 * Import from here anywhere in the project.
 */

export const SPEECH_API_KEY = import.meta.env.VITE_SPEECH_API_KEY ?? '';
export const SPEECH_REGION = import.meta.env.VITE_SPEECH_REGION ?? '';
export const DEFAULT_STT_LANG = import.meta.env.VITE_DEFAULT_STT_LANG ?? '';
export const DEFAULT_TTS_VOICE = import.meta.env.VITE_DEFAULT_TTS_VOICE ?? '';