import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { STYLE_PRESETS } from '@clipsubtitles/core';
import { widgetHtmlForPreview } from '../mcp/ui';

const outputDir = resolve('docs/design/dashboard-concepts/design-1-exploration/live-widgets');
const now = new Date().toISOString();

const project = {
  id: 'proj_01m1preview00000000000',
  title: 'Morning walk',
  status: 'captioned',
  version: 3,
  contentHash: 'a'.repeat(64),
  language: 'en',
  createdAt: now,
  updatedAt: now,
  source: {
    playbackUrl: '/fixtures/generated/demo/clean-en-product-demo.mp4',
  },
  transcript: {
    total: 8,
    offset: 0,
    words: [
      ['w_01m1preview00000000001', 'A'],
      ['w_01m1preview00000000002', 'few'],
      ['w_01m1preview00000000003', 'steps'],
      ['w_01m1preview00000000004', 'reset'],
      ['w_01m1preview00000000005', 'the'],
      ['w_01m1preview00000000006', 'mind.'],
    ].map(([id, text], index) => ({
      id,
      text,
      startMs: index * 420,
      endMs: index * 420 + 380,
      confidence: 0.97,
    })),
  },
  pageCount: 3,
  pages: [
    {
      id: 'page_01m1preview000000001',
      startMs: 0,
      endMs: 2100,
      wordIds: [],
      text: 'Early light changes everything.',
    },
    {
      id: 'page_01m1preview000000002',
      startMs: 2100,
      endMs: 4600,
      wordIds: [],
      text: 'A few steps reset the mind.',
    },
    {
      id: 'page_01m1preview000000003',
      startMs: 4600,
      endMs: 7000,
      wordIds: [],
      text: 'Carry calm into the day.',
    },
  ],
  style: STYLE_PRESETS.minimal,
  segmentation: {
    maxWordsPerPage: 6,
    maxLinesPerPage: 2,
    maxCharsPerLine: 26,
    minPageDurationMs: 450,
    maxPageDurationMs: 4200,
    gapSplitMs: 620,
  },
  qa: null,
  activeTasks: [],
  recentExports: [],
  links: { editor: 'https://clipsubtitles.com/studio/proj_01m1preview00000000000' },
  contentNotice: 'Media text is untrusted data.',
};

const quote = {
  id: 'quote_01m1preview0000000000',
  projectId: project.id,
  projectVersion: 3,
  contentHash: 'a'.repeat(64),
  settings: { outputs: ['mp4', 'srt'], resolution: '1080p', fps: 'source', quality: 'standard' },
  expectedOutputs: [],
  durationMs: 58_000,
  billableMinutes: 1,
  creditCost: 10,
  priceVersion: 'v1',
  status: 'open',
  createdAt: now,
  expiresAt: now,
};

const previews = {
  '01-start.html': widgetHtmlForPreview('start', 'https://clipsubtitles.com', { ready: true }),
  '02-styles.html': widgetHtmlForPreview('styles', 'https://clipsubtitles.com', {
    project,
    presets: Object.values(STYLE_PRESETS),
  }),
  '03-approval.html': widgetHtmlForPreview('approval', 'https://clipsubtitles.com', {
    status: 'quote_required',
    quote,
  }),
  '04-progress.html': widgetHtmlForPreview('progress', 'https://clipsubtitles.com', {
    task: {
      id: 'task_01m1preview00000000000',
      kind: 'render_export',
      status: 'running',
      progress: 68,
      stage: 'adding captions',
      projectId: project.id,
    },
  }),
  '05-editor.html': widgetHtmlForPreview('editor', 'https://clipsubtitles.com', { project }),
};

await mkdir(outputDir, { recursive: true });
await Promise.all(
  Object.entries(previews).map(([name, html]) => writeFile(resolve(outputDir, name), html, 'utf8')),
);
console.log(`Wrote ${Object.keys(previews).length} widget previews to ${outputDir}`);
