export type JobStatus =
  | 'queued'
  | 'auth_pending'
  | 'quick_preview'
  | 'scanning'
  | 'paused_flood_wait'
  | 'paused_user'
  | 'completed'
  | 'partial'
  | 'cancelled'
  | 'failed';

export type MessageKind =
  | 'text'
  | 'voice'
  | 'video_note'
  | 'photo'
  | 'video'
  | 'sticker'
  | 'gif'
  | 'other';

export interface TopChatStat {
  chatHash: string;
  displayLabel: string;
  chatType: 'private' | 'group';
  sentMessages: number;
}

export interface PersonaProfile {
  code:
    | 'midnight_architect'
    | 'voice_conductor'
    | 'community_catalyst'
    | 'visual_storyteller'
    | 'steady_pulse'
    | 'minimalist_signal';
  title: string;
  subtitle: string;
  traits: string[];
  basisMetrics: Record<string, number>;
}

export interface ScanMetrics {
  apiRequestsCount: number;
  elapsedMs: number;
  floodWaitCount: number;
  floodWaitTotalSec: number;
  processedDialogs: number;
  totalEligibleDialogs: number;
  skippedDialogs: number;
  failedDialogs: number;
}

export interface RecapStats {
  year: number;
  timezone: string;
  completionStatus: 'completed' | 'partial';
  generatedAt: string;
  totalMessages: number;
  activeDays: number;
  longestStreakDays: number;
  longestStreakRange: { start: string; end: string } | null;
  byMonth: number[];
  byWeekday: number[];
  byHour: number[];
  byKind: Record<MessageKind, number>;
  voiceCount: number;
  voiceTotalDurationSec: number | null;
  videoNoteCount: number;
  photoCount: number;
  videoCount: number;
  stickerAndGifCount: number;
  topPrivateChats: TopChatStat[];
  topGroupChats: TopChatStat[];
  persona: PersonaProfile;
  metrics: ScanMetrics;
}

export interface RecapMe {
  authorized: boolean;
  activeJob: ScanProgressPayload | null;
  availableYears: number[];
  timezone: string | null;
  hideChatNames: boolean;
}

export interface ScanProgressPayload {
  jobId: string;
  year: number;
  status: JobStatus;
  stage: 'quick_preview' | 'full_scan';
  processedDialogs: number;
  totalEligibleDialogs: number;
  outgoingFound: number;
  floodWaitUntil: string | null;
  errorMessage: string | null;
  updatedAt?: string;
}
