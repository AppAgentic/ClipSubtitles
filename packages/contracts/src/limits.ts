/**
 * Hard bounds enforced by schemas and services. Kept in one place so REST, MCP,
 * and the web editor agree, and so tests can probe every limit.
 */
export const LIMITS = {
  titleMaxChars: 200,
  wordTextMaxChars: 120,
  maxWordsPerTranscript: 20_000,
  maxPagesPerProject: 6_000,
  maxPatchOps: 200,
  maxVocabularyTerms: 100,
  vocabularyTermMaxChars: 64,
  maxSourceUrlChars: 2_048,
  maxRemoteSourceBytesDefault: 500 * 1024 * 1024,
  maxUploadBytesDefault: 500 * 1024 * 1024,
  maxSourceDurationMsDefault: 10 * 60 * 1000,
  maxWordsWindow: 500,
  maxIdempotencyKeyChars: 128,
  maxLanguageTagChars: 35,
  maxSpeakerLabelChars: 64,
  maxJsonBodyBytes: 1024 * 1024,
  maxTaskErrorMessageChars: 300,
  maxExportsPerRender: 4,
  minPreviewDurationMs: 500,
  maxPreviewDurationMs: 15_000,
} as const;

export const SUPPORTED_SOURCE_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
] as const;

export const SUPPORTED_SOURCE_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.mkv',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
] as const;
