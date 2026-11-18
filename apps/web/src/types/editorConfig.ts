// Per-project form memory for the shorts tabs (kept while switching tabs, not saved to the server).

export interface ShortsMediaPoolConfig {
  ytUrl: string;
}

export interface ShortsNarrationConfig {
  topic: string;
  preset: string; // template id
  duration: number; // seconds
}

export interface ShortsConfig {
  mediaPool: ShortsMediaPoolConfig;
  narration: ShortsNarrationConfig;
}
