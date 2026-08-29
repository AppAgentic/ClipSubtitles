export type OptionSlug = 'handoff' | 'contract-sheet' | 'frame-exact' | 'task-ledger' | 'three-gates';

export interface LandingOption {
  slug: OptionSlug;
  n: string;
  name: string;
  thesis: string;
  /** One-line description of the visual world, used on the index page. */
  world: string;
  /** Accent used for the switcher dot and the index mark. */
  dot: string;
  /** Background of the option, used for the index mark. */
  field: string;
  recommended?: boolean;
}

export const LANDING_OPTIONS: readonly LandingOption[] = [
  {
    slug: 'handoff',
    n: '01',
    name: 'The Handoff',
    thesis: 'Your agent captions the clip. You approve the words and the price.',
    world: 'Cool charcoal split stage — a live tool-call sequence on the left, the captioned 9:16 artifact on the right, one hash between them.',
    dot: '#ff7a1a',
    field: '#141618',
  },
  {
    slug: 'contract-sheet',
    n: '02',
    name: 'Contract Sheet',
    thesis: 'Captions your agent can run, under terms you can read.',
    world: 'Paper-white editorial sheet with numbered clauses, hairline rules and an oxblood accent. The hero proof is the render request itself.',
    dot: '#6d1f2b',
    field: '#f7f4ee',
  },
  {
    slug: 'frame-exact',
    n: '03',
    name: 'Frame Exact',
    thesis: 'Word-exact captions. Byte-exact renders.',
    world: 'The warm darkroom, extended: a dominant vertical frame, word ticks, a frame counter and a checksum that repeats.',
    dot: '#ff7a1a',
    field: '#0b0a09',
  },
  {
    slug: 'task-ledger',
    n: '04',
    name: 'Task Ledger',
    thesis: 'Let agents run the queue. Keep the ledger.',
    world: 'Ops console on grid paper, generous mono type, a five-row durable ledger where only the approval row pulses.',
    dot: '#f2b544',
    field: '#0f1113',
  },
  {
    slug: 'three-gates',
    n: '05',
    name: 'Three Gates',
    thesis: 'Agents do the work. Three decisions stay yours.',
    world: 'Deep ink and negative space. One caption artifact travels through Words, Cost and Output, and splits into four formats.',
    dot: '#e6a26b',
    field: '#07080b',
    recommended: true,
  },
];

export function findOption(slug: string): LandingOption | undefined {
  return LANDING_OPTIONS.find((o) => o.slug === slug);
}
