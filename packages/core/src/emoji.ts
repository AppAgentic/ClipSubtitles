import type { CaptionPage, EmojiConfig, TranscriptWord } from '@clipsubtitles/contracts';

export interface SemanticEmoji {
  glyph: string;
  codepoint: string;
  label: string;
  wordIndex: number;
}

const RULES: ReadonlyArray<{
  words: ReadonlySet<string>;
  glyph: string;
  codepoint: string;
  label: string;
}> = [
  { words: new Set(['fire', 'hot', 'viral']), glyph: '🔥', codepoint: '1f525', label: 'fire' },
  {
    words: new Set(['rocket', 'launch', 'skyrocket']),
    glyph: '🚀',
    codepoint: '1f680',
    label: 'rocket',
  },
  {
    words: new Set(['love', 'heart', 'favorite', 'favourite']),
    glyph: '❤',
    codepoint: '2764',
    label: 'heart',
  },
  {
    words: new Set(['idea', 'ideas', 'tip', 'tips', 'learn']),
    glyph: '💡',
    codepoint: '1f4a1',
    label: 'light bulb',
  },
  {
    words: new Set(['money', 'cash', 'dollar', 'dollars', 'price', 'profit']),
    glyph: '💰',
    codepoint: '1f4b0',
    label: 'money bag',
  },
  {
    words: new Set(['clap', 'applause']),
    glyph: '👏',
    codepoint: '1f44f',
    label: 'clapping hands',
  },
  {
    words: new Set(['yes', 'right', 'correct', 'done', 'check', 'ready']),
    glyph: '✅',
    codepoint: '2705',
    label: 'check mark',
  },
  {
    words: new Set(['laugh', 'laughing', 'funny', 'hilarious']),
    glyph: '😂',
    codepoint: '1f602',
    label: 'laughing face',
  },
  {
    words: new Set(['celebrate', 'celebration', 'congratulations', 'party']),
    glyph: '🎉',
    codepoint: '1f389',
    label: 'party popper',
  },
  {
    words: new Set(['strong', 'strength', 'power', 'powerful']),
    glyph: '💪',
    codepoint: '1f4aa',
    label: 'flexed biceps',
  },
  {
    words: new Set(['look', 'watch', 'see', 'eyes']),
    glyph: '👀',
    codepoint: '1f440',
    label: 'eyes',
  },
  {
    words: new Set(['perfect', 'hundred', 'exactly']),
    glyph: '💯',
    codepoint: '1f4af',
    label: 'hundred points',
  },
];

function normalizedToken(text: string): string {
  return text.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function matchWord(word: TranscriptWord | undefined, wordIndex: number): SemanticEmoji | null {
  if (!word) return null;
  const token = normalizedToken(word.text);
  for (const rule of RULES) {
    if (rule.words.has(token))
      return { glyph: rule.glyph, codepoint: rule.codepoint, label: rule.label, wordIndex };
  }
  return null;
}

/** Select at most one deterministic decorative emoji. Spoken transcript words are never modified. */
export function semanticEmojiForPage(input: {
  page: CaptionPage;
  words: readonly TranscriptWord[];
  config: EmojiConfig;
  activeWordIndex: number | null;
}): SemanticEmoji | null {
  if (input.config.mode === 'off') return null;
  if (input.config.timing === 'active-word') {
    const index = input.activeWordIndex;
    return index === null ? null : matchWord(input.words[index], index);
  }
  if (input.config.timing === 'keyword-hold') {
    if (input.activeWordIndex === null) return null;
    for (
      let index = Math.min(input.activeWordIndex, input.page.endWordIndex);
      index >= input.page.startWordIndex;
      index -= 1
    ) {
      const match = matchWord(input.words[index], index);
      if (match) return match;
    }
    return null;
  }
  for (let index = input.page.startWordIndex; index <= input.page.endWordIndex; index += 1) {
    const match = matchWord(input.words[index], index);
    if (match) return match;
  }
  return null;
}
