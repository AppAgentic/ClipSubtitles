import type { Metadata } from 'next';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clipsubtitles.com';

export type SeoPage = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  lede: string;
  proof: string;
  howTitle: string;
  howBody: string;
  steps: ReadonlyArray<{ title: string; body: string }>;
  benefitEyebrow: string;
  benefitTitle: string;
  benefits: ReadonlyArray<{ title: string; body: string }>;
  faqs: ReadonlyArray<{ question: string; answer: string }>;
  finalTitle: string;
  finalBody: string;
};

export const SEO_PAGES = {
  addCaptions: {
    slug: 'add-captions-to-video',
    title: 'Add Captions to Video Online | ClipSubtitles',
    description:
      'Add accurate, styled captions to a short video. Edit the transcript, preview the look, then export a captioned video or subtitle file.',
    eyebrow: 'Add captions to video',
    headline: 'Add polished captions to your video.',
    lede:
      'Turn speech into timed on-screen captions, correct the words, choose a visual style and preview the result before you export.',
    proof: 'From spoken video to readable captions, without rebuilding the clip on a timeline.',
    howTitle: 'How to add captions to a video',
    howBody: 'A direct workflow from upload to a publish-ready result.',
    steps: [
      { title: 'Upload your video', body: 'Start with the short clip you want to caption.' },
      { title: 'Generate and edit captions', body: 'Review the word-timed transcript and correct any word that needs attention.' },
      { title: 'Style, preview and export', body: 'Choose a caption look and motion, preview it, then download the result you need.' },
    ],
    benefitEyebrow: 'Made for short-form video',
    benefitTitle: 'Captions that are ready for the feed.',
    benefits: [
      { title: 'Readable by design', body: 'Use caption styles built to remain clear over vertical video.' },
      { title: 'Easy to correct', body: 'Change an individual word without retyping or retiming the whole transcript.' },
      { title: 'Flexible at export', body: 'Publish a captioned video or keep subtitles separate for another workflow.' },
    ],
    faqs: [
      { question: 'Can I edit the captions after they are generated?', answer: 'Yes. You can review the transcript and apply explicit word corrections before previewing or exporting.' },
      { question: 'Can I change the caption style?', answer: 'Yes. Choose a style and motion preset, then preview the current version of the clip.' },
      { question: 'Can I download subtitles separately?', answer: 'Yes. Subtitle files can be exported from the same approved words and timing as the captioned video.' },
    ],
    finalTitle: 'Add captions to your next clip.',
    finalBody: 'Upload one video and take it from spoken words to a polished export.',
  },
  automaticCaptions: {
    slug: 'automatic-video-captions',
    title: 'Automatic Video Captions You Can Edit | ClipSubtitles',
    description:
      'Generate automatic video captions with word-level timing, correct the transcript, choose a style and preview before exporting.',
    eyebrow: 'Automatic video captions',
    headline: 'Automatic captions you can still get right.',
    lede:
      'Generate a word-timed transcript from a short video, make precise corrections and carry the approved words into every preview and export.',
    proof: 'Automation handles the first pass. You keep control of the words viewers see.',
    howTitle: 'Generate automatic video captions',
    howBody: 'Move quickly without giving up the final review.',
    steps: [
      { title: 'Transcribe the speech', body: 'ClipSubtitles turns the spoken audio into timed caption words.' },
      { title: 'Review the transcript', body: 'Correct individual words while the surrounding timing remains in place.' },
      { title: 'Approve the result', body: 'Preview the styled captions and choose what to export.' },
    ],
    benefitEyebrow: 'Fast first pass, precise finish',
    benefitTitle: 'Spend time on the message, not manual timing.',
    benefits: [
      { title: 'Word-level control', body: 'Inspect and correct the transcript at the level that matters.' },
      { title: 'Version-aware previews', body: 'Preview the exact current words and style before committing to an export.' },
      { title: 'One approved source', body: 'Video, overlay and subtitle outputs stay tied to the same transcript timing.' },
    ],
    faqs: [
      { question: 'What are automatic video captions?', answer: 'They are timed on-screen words generated from the speech in a video, ready for review and styling.' },
      { question: 'Can I correct a transcription mistake?', answer: 'Yes. Corrections are explicit word edits, so the system does not silently rewrite what was said.' },
      { question: 'Can I preview automatic captions before exporting?', answer: 'Yes. You can render a low-resolution preview of the current transcript, style and motion.' },
    ],
    finalTitle: 'Generate captions, then make them yours.',
    finalBody: 'Start with an automatic transcript and finish with a result you have reviewed.',
  },
  animatedCaptions: {
    slug: 'animated-video-captions',
    title: 'Animated Video Captions Without Manual Keyframes | ClipSubtitles',
    description:
      'Create animated video captions with reusable styles and motion presets. Edit the words, preview the motion and export a publish-ready result.',
    eyebrow: 'Animated video captions',
    headline: 'Create animated captions without manual keyframes.',
    lede:
      'Choose a readable caption style, add a restrained motion preset and preview how the words move before rendering the finished clip.',
    proof: 'The animation follows the approved caption timing instead of a hand-built text timeline.',
    howTitle: 'How animated captions work',
    howBody: 'Words, style and motion remain separate choices, so each is easy to review.',
    steps: [
      { title: 'Generate the captions', body: 'Begin with a word-timed transcript of the speech in your clip.' },
      { title: 'Choose style and motion', body: 'Pair a caption look with a motion preset that fits the video.' },
      { title: 'Preview the animation', body: 'Check the current version before creating the final export.' },
    ],
    benefitEyebrow: 'Reusable caption design',
    benefitTitle: 'A consistent look across every clip.',
    benefits: [
      { title: 'Motion with restraint', body: 'Use movement to support the words rather than distract from them.' },
      { title: 'Repeatable styles', body: 'Reuse the same visual direction across a creator series or client batch.' },
      { title: 'No manual keyframing', body: 'Caption timing drives the animation, so there is no word-by-word timeline setup.' },
    ],
    faqs: [
      { question: 'Can I preview animated captions?', answer: 'Yes. Render a low-resolution preview of the current transcript, style and motion before a paid export.' },
      { question: 'Can I reuse the same caption style?', answer: 'Yes. Style and motion choices are reusable, which helps a run of clips keep a consistent look.' },
      { question: 'Do animated captions change my transcript?', answer: 'No. Motion changes presentation; the approved words and timing remain the source for the export.' },
    ],
    finalTitle: 'Give your captions the right movement.',
    finalBody: 'Choose a look, preview the motion and export when it feels right.',
  },
  captionApi: {
    slug: 'video-caption-api',
    title: 'Video Caption API for Styled Video Exports | ClipSubtitles',
    description:
      'Build automatic, styled video captioning into an agent or workflow with a typed API and MCP tools for import, editing, previews and exports.',
    eyebrow: 'Video caption API',
    headline: 'A caption API that finishes the video.',
    lede:
      'Import a clip, generate word-timed captions, apply explicit corrections, choose a style, request a preview and prepare a publish-ready export through MCP or a typed REST API.',
    proof: 'The machine workflow covers the whole caption job while keeping paid renders behind human approval.',
    howTitle: 'Build a complete video caption workflow',
    howBody: 'Use goal-oriented operations instead of stitching transcription, timing and rendering together yourself.',
    steps: [
      { title: 'Import and transcribe', body: 'Create a caption project from an upload target or supported source, then generate timed words.' },
      { title: 'Review and update', body: 'Read the current project version and apply explicit word or style changes.' },
      { title: 'Preview and export', body: 'Request a preview, receive a fixed quote and start a paid render only after approval.' },
    ],
    benefitEyebrow: 'Designed for agents and products',
    benefitTitle: 'A reliable caption job, not just a transcript.',
    benefits: [
      { title: 'Typed operations', body: 'MCP tools and REST routes share product contracts for the same project workflow.' },
      { title: 'Durable tasks', body: 'Long-running transcription and render work is tracked as recoverable task state.' },
      { title: 'Approval before spend', body: 'A paid render is quoted first and requires the approved amount before it starts.' },
    ],
    faqs: [
      { question: 'What can the video caption API do?', answer: 'It can create a project, generate captions, read and update the current version, render a preview, prepare an export, track tasks and cancel work.' },
      { question: 'Can an AI agent use ClipSubtitles?', answer: 'Yes. The same workflow is exposed through MCP for compatible agents and through the REST API for product integrations.' },
      { question: 'Does the API start paid renders automatically?', answer: 'No. It returns an immutable quote first; the render starts only with explicit approval for that amount.' },
    ],
    finalTitle: 'Give your agent a complete caption workflow.',
    finalBody: 'Start with the API overview, then run the same flow your users will see.',
  },
  transparentOverlay: {
    slug: 'transparent-caption-overlay',
    title: 'Transparent Caption Overlay for Video Editing | ClipSubtitles',
    description:
      'Export styled captions as a transparent video overlay for your editor, using the same approved words and timing as your captioned video and subtitle files.',
    eyebrow: 'Transparent caption overlay',
    headline: 'Keep the captions. Keep your edit flexible.',
    lede:
      'Export styled captions as a transparent video layer, then place that layer over your original footage inside your own editing workflow.',
    proof: 'The overlay uses the same reviewed transcript, timing, style and motion as the other outputs from the project.',
    howTitle: 'Create a transparent caption overlay',
    howBody: 'Finish the caption work in ClipSubtitles, then keep compositing control in your editor.',
    steps: [
      { title: 'Caption and review', body: 'Generate timed captions and correct the transcript before styling.' },
      { title: 'Choose the visual treatment', body: 'Select the caption style and motion you want carried into the overlay.' },
      { title: 'Export the transparent layer', body: 'Download a ProRes 4444 caption overlay for compositing over the source video.' },
    ],
    benefitEyebrow: 'For flexible post-production',
    benefitTitle: 'Styled captions without flattening the edit.',
    benefits: [
      { title: 'Transparent background', body: 'The export contains the caption layer rather than a duplicate of the source picture.' },
      { title: 'Editor-friendly output', body: 'Place the overlay in a compatible timeline and keep the original footage underneath.' },
      { title: 'Matching timing', body: 'The overlay and subtitle outputs come from the same approved project version.' },
    ],
    faqs: [
      { question: 'What is a transparent caption overlay?', answer: 'It is a video layer containing styled captions on transparency, designed to sit over your source footage in an editor.' },
      { question: 'Which format is the overlay?', answer: 'ClipSubtitles uses a ProRes 4444 MOV for the transparent caption layer.' },
      { question: 'Will the overlay match my subtitle files?', answer: 'Yes. They are generated from the same approved transcript timing and project version.' },
    ],
    finalTitle: 'Bring finished captions into your own edit.',
    finalBody: 'Review the words once, then export a transparent layer ready for compositing.',
  },
} as const satisfies Record<string, SeoPage>;

export function metadataFor(page: SeoPage): Metadata {
  const canonical = `/${page.slug}`;
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      url: new URL(canonical, SITE_URL),
      siteName: 'ClipSubtitles',
      title: page.title,
      description: page.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.description,
    },
  };
}
