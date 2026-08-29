import { describe, expect, it } from 'vitest';
import { PatchError, applyPatchOps } from './patch';
import { evaluateCaptions } from './qa';
import { createCaptionState } from './state';
import { wordsFromText } from './test-utils';

let counter = 0;
const ctx = { newWordId: () => `w_${(counter += 1).toString().padStart(20, '0')}` };

function baseState() {
  return createCaptionState({
    title: 'Demo',
    words: wordsFromText('I love this app. | It saves me hours every week and my captions look great.'),
    revisionSeed: 'rev_test',
  });
}

describe('applyPatchOps', () => {
  it('replaces a word and marks it edited without touching neighbours', () => {
    const state = baseState();
    const target = state.words[1]!;
    const out = applyPatchOps(state, [{ op: 'replace_word_text', wordId: target.id, text: 'adore' }], ctx);
    expect(out.transcriptChanged).toBe(true);
    expect(out.state.words[1]?.text).toBe('adore');
    expect(out.state.words[1]?.edited).toBe(true);
    expect(out.state.words[1]?.id).toBe(target.id);
    expect(out.state.words[0]?.edited).toBeUndefined();
    expect(evaluateCaptions(out.state.words, out.state.pages, out.state.segmentation).fidelity).toBe(true);
    // Original state is not mutated.
    expect(state.words[1]?.text).toBe('love');
  });

  it('splits a replacement containing spaces into multiple timed words', () => {
    const state = baseState();
    const target = state.words[2]!; // "this"
    const out = applyPatchOps(state, [{ op: 'replace_word_text', wordId: target.id, text: 'this very' }], ctx);
    expect(out.state.words[2]?.text).toBe('this');
    expect(out.state.words[3]?.text).toBe('very');
    expect(out.state.words[2]?.startMs).toBe(target.startMs);
    expect(out.state.words[3]?.endMs).toBe(target.endMs);
    expect(out.state.words[3]?.startMs).toBe(out.state.words[2]?.endMs);
  });

  it('rejects timing that overlaps neighbours', () => {
    const state = baseState();
    const w = state.words[1]!;
    const prevEnd = state.words[0]!.endMs;
    expect(() =>
      applyPatchOps(state, [{ op: 'set_word_timing', wordId: w.id, startMs: prevEnd - 10, endMs: w.endMs }], ctx),
    ).toThrowError(PatchError);
    const ok = applyPatchOps(state, [{ op: 'set_word_timing', wordId: w.id, startMs: prevEnd, endMs: w.endMs }], ctx);
    expect(ok.state.words[1]?.startMs).toBe(prevEnd);
  });

  it('deletes and inserts words while keeping fidelity', () => {
    const state = baseState();
    const victim = state.words[3]!; // "app."
    const deleted = applyPatchOps(state, [{ op: 'delete_word', wordId: victim.id }], ctx);
    expect(deleted.state.words.some((w) => w.id === victim.id)).toBe(false);
    const after = deleted.state.words[2]!;
    const next = deleted.state.words[3]!;
    const inserted = applyPatchOps(
      deleted.state,
      [{ op: 'insert_word', afterWordId: after.id, text: 'tool.', startMs: after.endMs, endMs: Math.min(next.startMs, after.endMs + 200) }],
      ctx,
    );
    expect(inserted.state.words[3]?.text).toBe('tool.');
    expect(evaluateCaptions(inserted.state.words, inserted.state.pages, inserted.state.segmentation).fidelity).toBe(true);
  });

  it('split and merge pages are honoured by resegmentation and survive text edits', () => {
    const state = baseState();
    const page = state.pages[0]!;
    const breakWord = state.words[page.startWordIndex + 2]!;
    const split = applyPatchOps(state, [{ op: 'split_page', pageId: page.id, beforeWordId: breakWord.id }], ctx);
    expect(split.state.pages.some((p) => p.startWordIndex === page.startWordIndex + 2 && p.manual)).toBe(true);

    // An unrelated text edit keeps the manual break (constraint stored by word id).
    const edited = applyPatchOps(split.state, [{ op: 'replace_word_text', wordId: state.words[0]!.id, text: 'We' }], ctx);
    expect(edited.state.pages.some((p) => p.startWordIndex === page.startWordIndex + 2)).toBe(true);

    const first = edited.state.pages[0]!;
    const merged = applyPatchOps(edited.state, [{ op: 'merge_page_with_next', pageId: first.id }], ctx);
    expect(merged.state.pages.some((p) => p.startWordIndex === page.startWordIndex + 2)).toBe(false);
  });

  it('resegment clears manual constraints', () => {
    const state = baseState();
    const page = state.pages[0]!;
    const split = applyPatchOps(state, [{ op: 'split_page', pageId: page.id, beforeWordId: state.words[2]!.id }], ctx);
    expect(split.state.manualBreaks).toHaveLength(1);
    const reseg = applyPatchOps(split.state, [{ op: 'resegment', segmentation: { maxWordsPerPage: 4 } }], ctx);
    expect(reseg.state.manualBreaks).toHaveLength(0);
    expect(reseg.state.segmentation.maxWordsPerPage).toBe(4);
  });

  it('style patches validate and line-limit changes resegment', () => {
    const state = baseState();
    const out = applyPatchOps(state, [{ op: 'set_style', style: { maxLines: 1, maxCharsPerLine: 40 } }], ctx);
    expect(out.styleChanged).toBe(true);
    expect(out.pagesChanged).toBe(true);
    expect(out.state.segmentation.maxLinesPerPage).toBe(1);
    expect(() => applyPatchOps(state, [{ op: 'set_style', style: { fontSizePct: 5 } }], ctx)).toThrowError(PatchError);
    const pos = applyPatchOps(state, [{ op: 'set_position', position: 'top' }], ctx);
    expect(pos.state.style.position).toBe('top');
    expect(pos.pagesChanged).toBe(false);
    const preset = applyPatchOps(state, [{ op: 'set_preset', preset: 'bold-pop' }], ctx);
    expect(preset.state.style.preset).toBe('bold-pop');
  });

  it('is transactional: an invalid op leaves the input untouched and throws with a path', () => {
    const state = baseState();
    try {
      applyPatchOps(
        state,
        [
          { op: 'set_title', title: 'New' },
          { op: 'replace_word_text', wordId: 'w_00000000000000000000', text: 'x' },
        ],
        ctx,
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PatchError);
      expect((err as PatchError).code).toBe('NOT_FOUND');
      expect((err as PatchError).path).toBe('ops[1]');
    }
    expect(state.title).toBe('Demo');
  });
});
