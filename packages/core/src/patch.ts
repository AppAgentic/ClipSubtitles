import { SegmentationParamsSchema, type PatchOp, type TranscriptWord } from '@clipsubtitles/contracts';
import { applyStylePatch, segmentationForStyle, stylePreset } from './presets';
import { resegmentState, type CaptionState } from './state';

export type PatchErrorCode = 'NOT_FOUND' | 'VALIDATION_FAILED';

export class PatchError extends Error {
  readonly code: PatchErrorCode;
  readonly path: string;
  constructor(code: PatchErrorCode, path: string, message: string) {
    super(message);
    this.name = 'PatchError';
    this.code = code;
    this.path = path;
  }
}

export interface PatchContext {
  newWordId: () => string;
}

export interface PatchOutcome {
  state: CaptionState;
  applied: number;
  transcriptChanged: boolean;
  pagesChanged: boolean;
  styleChanged: boolean;
  metaChanged: boolean;
}

function wordIndex(state: CaptionState, wordId: string, path: string): number {
  const idx = state.words.findIndex((w) => w.id === wordId);
  if (idx < 0) throw new PatchError('NOT_FOUND', path, `Word ${wordId} does not exist in this project version.`);
  return idx;
}

function pageIndex(state: CaptionState, pageId: string, path: string): number {
  const idx = state.pages.findIndex((p) => p.id === pageId);
  if (idx < 0) throw new PatchError('NOT_FOUND', path, `Page ${pageId} does not exist in this project version.`);
  return idx;
}

/**
 * Apply constrained edits. Pure: returns a new state. Throws PatchError for
 * the first invalid op (the caller applies none — transactional semantics).
 */
export function applyPatchOps(initial: CaptionState, ops: readonly PatchOp[], ctx: PatchContext): PatchOutcome {
  let state: CaptionState = { ...initial, words: [...initial.words], manualBreaks: [...initial.manualBreaks], manualJoins: [...initial.manualJoins] };
  let transcriptChanged = false;
  let pagesChanged = false;
  let styleChanged = false;
  let metaChanged = false;

  ops.forEach((op, i) => {
    const path = `ops[${i}]`;
    switch (op.op) {
      case 'set_title': {
        state = { ...state, title: op.title };
        metaChanged = true;
        break;
      }
      case 'set_language': {
        state = { ...state, language: op.language };
        metaChanged = true;
        break;
      }
      case 'replace_word_text': {
        const idx = wordIndex(state, op.wordId, path);
        const original = state.words[idx];
        if (!original) throw new PatchError('NOT_FOUND', path, 'Word missing.');
        const tokens = op.text.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) throw new PatchError('VALIDATION_FAILED', path, 'Replacement text is empty.');
        const span = original.endMs - original.startMs;
        const totalChars = tokens.reduce((s, t) => s + t.length, 0);
        const replacements: TranscriptWord[] = [];
        let cursor = original.startMs;
        tokens.forEach((token, ti) => {
          const isLast = ti === tokens.length - 1;
          const end = isLast ? original.endMs : cursor + Math.max(1, Math.round((span * token.length) / totalChars));
          const word: TranscriptWord = {
            ...original,
            id: ti === 0 ? original.id : ctx.newWordId(),
            text: token,
            startMs: cursor,
            endMs: Math.max(end, cursor + 1),
            edited: true,
          };
          replacements.push(word);
          cursor = word.endMs;
        });
        state.words.splice(idx, 1, ...replacements);
        transcriptChanged = true;
        break;
      }
      case 'set_word_timing': {
        const idx = wordIndex(state, op.wordId, path);
        const prev = state.words[idx - 1];
        const next = state.words[idx + 1];
        if (prev && op.startMs < prev.endMs) {
          throw new PatchError('VALIDATION_FAILED', `${path}.startMs`, `startMs must be >= ${prev.endMs} (end of previous word).`);
        }
        if (next && op.endMs > next.startMs) {
          throw new PatchError('VALIDATION_FAILED', `${path}.endMs`, `endMs must be <= ${next.startMs} (start of next word).`);
        }
        const current = state.words[idx];
        if (!current) throw new PatchError('NOT_FOUND', path, 'Word missing.');
        state.words[idx] = { ...current, startMs: op.startMs, endMs: op.endMs, edited: true };
        transcriptChanged = true;
        break;
      }
      case 'delete_word': {
        const idx = wordIndex(state, op.wordId, path);
        state.words.splice(idx, 1);
        state.manualBreaks = state.manualBreaks.filter((id) => id !== op.wordId);
        state.manualJoins = state.manualJoins.filter((id) => id !== op.wordId);
        transcriptChanged = true;
        break;
      }
      case 'insert_word': {
        const at = op.afterWordId === null ? 0 : wordIndex(state, op.afterWordId, path) + 1;
        const prev = state.words[at - 1];
        const next = state.words[at];
        if (prev && op.startMs < prev.endMs) {
          throw new PatchError('VALIDATION_FAILED', `${path}.startMs`, `startMs must be >= ${prev.endMs} (end of previous word).`);
        }
        if (next && op.endMs > next.startMs) {
          throw new PatchError('VALIDATION_FAILED', `${path}.endMs`, `endMs must be <= ${next.startMs} (start of next word).`);
        }
        const word: TranscriptWord = {
          id: ctx.newWordId(),
          text: op.text.trim(),
          startMs: op.startMs,
          endMs: op.endMs,
          edited: true,
        };
        if (!word.text || /\s/.test(word.text)) {
          throw new PatchError('VALIDATION_FAILED', `${path}.text`, 'Insert one word at a time.');
        }
        state.words.splice(at, 0, word);
        transcriptChanged = true;
        break;
      }
      case 'split_page': {
        const pIdx = pageIndex(state, op.pageId, path);
        const page = state.pages[pIdx];
        const wIdx = wordIndex(state, op.beforeWordId, path);
        if (!page || wIdx <= page.startWordIndex || wIdx > page.endWordIndex) {
          throw new PatchError('VALIDATION_FAILED', `${path}.beforeWordId`, 'beforeWordId must be inside the page and not its first word.');
        }
        if (!state.manualBreaks.includes(op.beforeWordId)) state.manualBreaks.push(op.beforeWordId);
        state.manualJoins = state.manualJoins.filter((id) => id !== op.beforeWordId);
        pagesChanged = true;
        break;
      }
      case 'merge_page_with_next': {
        const pIdx = pageIndex(state, op.pageId, path);
        const next = state.pages[pIdx + 1];
        if (!next) throw new PatchError('VALIDATION_FAILED', path, 'There is no next page to merge with.');
        const firstWord = state.words[next.startWordIndex];
        if (!firstWord) throw new PatchError('VALIDATION_FAILED', path, 'Next page has no words.');
        if (!state.manualJoins.includes(firstWord.id)) state.manualJoins.push(firstWord.id);
        state.manualBreaks = state.manualBreaks.filter((id) => id !== firstWord.id);
        pagesChanged = true;
        break;
      }
      case 'resegment': {
        const merged = SegmentationParamsSchema.safeParse({ ...state.segmentation, ...(op.segmentation ?? {}) });
        if (!merged.success) throw new PatchError('VALIDATION_FAILED', `${path}.segmentation`, 'Invalid segmentation parameters.');
        state = { ...state, segmentation: merged.data, manualBreaks: [], manualJoins: [] };
        pagesChanged = true;
        break;
      }
      case 'set_style': {
        let style;
        try {
          style = applyStylePatch(state.style, op.style);
        } catch {
          throw new PatchError('VALIDATION_FAILED', `${path}.style`, 'Invalid style values.');
        }
        const lineLimitsChanged =
          style.maxLines !== state.style.maxLines || style.maxCharsPerLine !== state.style.maxCharsPerLine;
        state = {
          ...state,
          style,
          segmentation: lineLimitsChanged ? segmentationForStyle(style, state.segmentation) : state.segmentation,
        };
        styleChanged = true;
        if (lineLimitsChanged) pagesChanged = true;
        break;
      }
      case 'set_preset': {
        const style = stylePreset(op.preset);
        state = { ...state, style, segmentation: segmentationForStyle(style, state.segmentation) };
        styleChanged = true;
        pagesChanged = true;
        break;
      }
      case 'set_position': {
        state = { ...state, style: { ...state.style, position: op.position } };
        styleChanged = true;
        break;
      }
      default: {
        const never: never = op;
        throw new PatchError('VALIDATION_FAILED', path, `Unsupported op ${(never as { op: string }).op}`);
      }
    }
  });

  if (transcriptChanged || pagesChanged) {
    state = resegmentState(state);
    pagesChanged = true;
  }

  return { state, applied: ops.length, transcriptChanged, pagesChanged, styleChanged, metaChanged };
}
