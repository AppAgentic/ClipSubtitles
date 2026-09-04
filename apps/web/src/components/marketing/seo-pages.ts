import type { Metadata } from 'next';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clipsubtitles.com';

export type SeoPage = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  lede: string;
  answerTitle: string;
  answerBody: string;
  proof: string;
  visual: string;
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
    lede: 'Turn speech into timed on-screen captions, correct the words, choose a visual style and preview the result before you export.',
    answerTitle: 'The quickest way to add captions to a video',
    answerBody:
      'Upload the clip, generate a timed transcript, correct any words, choose a readable style and export either a captioned MP4 or a separate subtitle file. ClipSubtitles keeps those outputs tied to the same reviewed transcript and timing.',
    proof: 'From spoken video to readable captions, without rebuilding the clip on a timeline.',
    visual: '/marketing/founder-workshop.webp',
    howTitle: 'How to add captions to a video',
    howBody: 'A direct workflow from upload to a publish-ready result.',
    steps: [
      { title: 'Upload your video', body: 'Start with the short clip you want to caption.' },
      {
        title: 'Generate and edit captions',
        body: 'Review the word-timed transcript and correct any word that needs attention.',
      },
      {
        title: 'Style, preview and export',
        body: 'Choose a caption look and motion, preview it, then download the result you need.',
      },
    ],
    benefitEyebrow: 'Made for short-form video',
    benefitTitle: 'Captions that are ready for the feed.',
    benefits: [
      {
        title: 'Readable by design',
        body: 'Use caption styles built to remain clear over vertical video.',
      },
      {
        title: 'Easy to correct',
        body: 'Change an individual word without retyping or retiming the whole transcript.',
      },
      {
        title: 'Flexible at export',
        body: 'Publish a captioned video or keep subtitles separate for another workflow.',
      },
    ],
    faqs: [
      {
        question: 'Can I edit the captions after they are generated?',
        answer:
          'Yes. You can review the transcript and apply explicit word corrections before previewing or exporting.',
      },
      {
        question: 'Can I change the caption style?',
        answer:
          'Yes. Choose a style and motion preset, then preview the current version of the clip.',
      },
      {
        question: 'Can I download subtitles separately?',
        answer:
          'Yes. Subtitle files can be exported from the same approved words and timing as the captioned video.',
      },
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
    lede: 'Generate a word-timed transcript from a short video, make precise corrections and carry the approved words into every preview and export.',
    answerTitle: 'What are automatic video captions?',
    answerBody:
      'Automatic video captions are timed words created from the speech in a video. A useful caption generator should still let you review the transcript, correct names or specialist terms, preview the styling and choose how the captions are exported.',
    proof: 'Automation handles the first pass. You keep control of the words viewers see.',
    visual: '/marketing/creator-studio.webp',
    howTitle: 'Generate automatic video captions',
    howBody: 'Move quickly without giving up the final review.',
    steps: [
      {
        title: 'Transcribe the speech',
        body: 'ClipSubtitles turns the spoken audio into timed caption words.',
      },
      {
        title: 'Review the transcript',
        body: 'Correct individual words while the surrounding timing remains in place.',
      },
      {
        title: 'Approve the result',
        body: 'Preview the styled captions and choose what to export.',
      },
    ],
    benefitEyebrow: 'Fast first pass, precise finish',
    benefitTitle: 'Spend time on the message, not manual timing.',
    benefits: [
      {
        title: 'Word-level control',
        body: 'Inspect and correct the transcript at the level that matters.',
      },
      {
        title: 'Preview before export',
        body: 'Check the current words and style before creating the finished files.',
      },
      {
        title: 'One reviewed source',
        body: 'Video, overlay and subtitle outputs stay tied to the same reviewed caption timing.',
      },
    ],
    faqs: [
      {
        question: 'What are automatic video captions?',
        answer:
          'They are timed on-screen words generated from the speech in a video, ready for review and styling.',
      },
      {
        question: 'Can I correct a transcription mistake?',
        answer:
          'Yes. Corrections are explicit word edits, so the system does not silently rewrite what was said.',
      },
      {
        question: 'Can I preview automatic captions before exporting?',
        answer:
          'Yes. You can render a low-resolution preview of the current transcript, style and motion.',
      },
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
    lede: 'Choose a readable caption style, add a restrained motion preset and preview how the words move before rendering the finished clip.',
    answerTitle: 'What makes a video caption animated?',
    answerBody:
      'Animated captions change the presentation of timed words as they are spoken—for example with a rise, emphasis or active-word treatment. The motion should follow the approved timing without changing the transcript itself.',
    proof:
      'The animation follows the approved caption timing instead of a hand-built text timeline.',
    visual: '/marketing/founder-workshop.webp',
    howTitle: 'How animated captions work',
    howBody: 'Words, style and motion remain separate choices, so each is easy to review.',
    steps: [
      {
        title: 'Generate the captions',
        body: 'Begin with a word-timed transcript of the speech in your clip.',
      },
      {
        title: 'Choose style and motion',
        body: 'Pair a caption look with a motion preset that fits the video.',
      },
      {
        title: 'Preview the animation',
        body: 'Check the current version before creating the final export.',
      },
    ],
    benefitEyebrow: 'Reusable caption design',
    benefitTitle: 'A consistent look across every clip.',
    benefits: [
      {
        title: 'Motion with restraint',
        body: 'Use movement to support the words rather than distract from them.',
      },
      {
        title: 'Repeatable styles',
        body: 'Reuse the same visual direction across a creator series or client batch.',
      },
      {
        title: 'No manual keyframing',
        body: 'Caption timing drives the animation, so there is no word-by-word timeline setup.',
      },
    ],
    faqs: [
      {
        question: 'Can I preview animated captions?',
        answer:
          'Yes. Render a low-resolution preview of the current transcript, style and motion before a paid export.',
      },
      {
        question: 'Can I reuse the same caption style?',
        answer:
          'Yes. Style and motion choices are reusable, which helps a run of clips keep a consistent look.',
      },
      {
        question: 'Do animated captions change my transcript?',
        answer:
          'No. Motion changes presentation; the approved words and timing remain the source for the export.',
      },
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
    lede: 'Import a clip, generate word-timed captions, apply explicit corrections, choose a style, request a preview and prepare a publish-ready export through MCP or a typed REST API.',
    answerTitle: 'What does a video caption API return?',
    answerBody:
      'A complete video caption API goes beyond speech-to-text: it accepts a clip, creates timed captions, supports corrections and styling, renders previews and returns finished video or subtitle outputs. ClipSubtitles exposes that workflow through REST and MCP.',
    proof:
      'The machine workflow covers the whole caption job while keeping paid renders behind human approval.',
    visual: '/marketing/filmmaker-workflow.webp',
    howTitle: 'Build a complete video caption workflow',
    howBody:
      'Use goal-oriented operations instead of stitching transcription, timing and rendering together yourself.',
    steps: [
      {
        title: 'Import and transcribe',
        body: 'Create a caption project from an upload target or supported source, then generate timed words.',
      },
      {
        title: 'Review and update',
        body: 'Read the current project version and apply explicit word or style changes.',
      },
      {
        title: 'Preview and export',
        body: 'Request a preview, receive a fixed quote and start a paid render only after approval.',
      },
    ],
    benefitEyebrow: 'Designed for agents and products',
    benefitTitle: 'A reliable caption job, not just a transcript.',
    benefits: [
      {
        title: 'Typed operations',
        body: 'MCP tools and REST routes share product contracts for the same project workflow.',
      },
      {
        title: 'Recoverable progress',
        body: 'Long-running caption and export work can continue without keeping a browser tab open.',
      },
      {
        title: 'Approval before spend',
        body: 'A paid render is quoted first and requires the approved amount before it starts.',
      },
    ],
    faqs: [
      {
        question: 'What can the video caption API do?',
        answer:
          'It can create a project, generate captions, read and update the current version, render a preview, prepare an export, track tasks and cancel work.',
      },
      {
        question: 'Can an AI agent use ClipSubtitles?',
        answer:
          'Yes. The same workflow is exposed through MCP for compatible agents and through the REST API for product integrations.',
      },
      {
        question: 'Does the API start paid exports automatically?',
        answer:
          'No. It returns a fixed cost first; the export starts only with explicit approval for that amount.',
      },
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
    lede: 'Export styled captions as a transparent video layer, then place that layer over your original footage inside your own editing workflow.',
    answerTitle: 'What is a transparent caption overlay?',
    answerBody:
      'A transparent caption overlay is a video file that contains styled captions on an alpha channel instead of flattening them into the source footage. Place it above the original clip in a compatible editor to keep the picture and captions as separate layers.',
    proof:
      'The overlay uses the same reviewed transcript, timing, style and motion as the other outputs from the project.',
    visual: '/marketing/filmmaker-workflow.webp',
    howTitle: 'Create a transparent caption overlay',
    howBody:
      'Finish the caption work in ClipSubtitles, then keep compositing control in your editor.',
    steps: [
      {
        title: 'Caption and review',
        body: 'Generate timed captions and correct the transcript before styling.',
      },
      {
        title: 'Choose the visual treatment',
        body: 'Select the caption style and motion you want carried into the overlay.',
      },
      {
        title: 'Export the transparent layer',
        body: 'Download a ProRes 4444 caption overlay for compositing over the source video.',
      },
    ],
    benefitEyebrow: 'For flexible post-production',
    benefitTitle: 'Styled captions without flattening the edit.',
    benefits: [
      {
        title: 'Transparent background',
        body: 'The export contains the caption layer rather than a duplicate of the source picture.',
      },
      {
        title: 'Editor-friendly output',
        body: 'Place the overlay in a compatible timeline and keep the original footage underneath.',
      },
      {
        title: 'Matching timing',
        body: 'The overlay and subtitle files come from the same reviewed captions.',
      },
    ],
    faqs: [
      {
        question: 'What is a transparent caption overlay?',
        answer:
          'It is a video layer containing styled captions on transparency, designed to sit over your source footage in an editor.',
      },
      {
        question: 'Which format is the overlay?',
        answer: 'ClipSubtitles uses a ProRes 4444 MOV for the transparent caption layer.',
      },
      {
        question: 'Will the overlay match my subtitle files?',
        answer: 'Yes. They are generated from the same reviewed words and timing.',
      },
    ],
    finalTitle: 'Bring finished captions into your own edit.',
    finalBody: 'Review the words once, then export a transparent layer ready for compositing.',
  },
  tiktokCaptions: {
    slug: 'captions-for-tiktok',
    title: 'Add Captions to TikTok Videos Online | ClipSubtitles',
    description:
      'Create readable, animated captions for TikTok videos. Review the words, keep text clear of interface controls and export a captioned MP4.',
    eyebrow: 'Captions for TikTok videos',
    headline: 'Make every word readable on TikTok.',
    lede: 'Turn spoken audio into animated captions, correct names and phrases, keep the text in a safe viewing area and export a vertical video ready to post.',
    answerTitle: 'How do I add captions to a TikTok video?',
    answerBody:
      'Upload the finished vertical clip, generate captions from its dialogue, correct the transcript and position the text away from TikTok interface controls. Export a captioned MP4 so the styled words remain visible when the video is posted.',
    proof: 'Preview the actual caption treatment before exporting the finished TikTok video.',
    visual: '/marketing/creator-studio.webp',
    howTitle: 'Create TikTok captions in three steps',
    howBody: 'Keep the workflow focused on the spoken clip and the final mobile frame.',
    steps: [
      {
        title: 'Upload the vertical clip',
        body: 'Start with the edited TikTok video that contains the dialogue you want viewers to read.',
      },
      {
        title: 'Review words and placement',
        body: 'Correct the transcript, choose a readable look and keep captions clear of edge controls.',
      },
      {
        title: 'Preview and export',
        body: 'Watch the styled result, then export a captioned MP4 ready for upload.',
      },
    ],
    benefitEyebrow: 'Built for sound-on or sound-off viewing',
    benefitTitle: 'Captions that belong in the mobile frame.',
    benefits: [
      {
        title: 'Burned-in captions',
        body: 'The styled words travel with the MP4 instead of depending on a viewer setting.',
      },
      {
        title: 'Precise corrections',
        body: 'Fix creator names, product terms or slang before the video is rendered.',
      },
      {
        title: 'Reusable visual direction',
        body: 'Carry the same caption style across a recurring TikTok series.',
      },
    ],
    faqs: [
      {
        question: 'Can I add animated captions to a TikTok video?',
        answer:
          'Yes. Choose a caption style and motion preset, then preview the movement before exporting.',
      },
      {
        question: 'Should TikTok captions be burned into the video?',
        answer:
          'Burned-in captions preserve your chosen font, colour, motion and placement in the exported MP4.',
      },
      {
        question: 'Can I correct TikTok captions before exporting?',
        answer: 'Yes. Review and edit individual words before creating the final captioned video.',
      },
    ],
    finalTitle: 'Caption your next TikTok video.',
    finalBody: 'Bring the clip, check every word and export it ready to post.',
  },
  reelsCaptions: {
    slug: 'captions-for-instagram-reels',
    title: 'Add Captions to Instagram Reels Online | ClipSubtitles',
    description:
      'Create styled captions for Instagram Reels. Edit the transcript, preview mobile-safe placement and export a captioned vertical video.',
    eyebrow: 'Captions for Instagram Reels',
    headline: 'Create Reels people can follow without sound.',
    lede: 'Generate timed captions from your Reel, refine the transcript, choose a consistent visual style and check the composition before exporting.',
    answerTitle: 'How do I put captions on an Instagram Reel?',
    answerBody:
      'Upload the edited Reel, generate a transcript from its speech, correct the words and choose a caption style that stays clear of the app interface. Preview the vertical frame and export a captioned MP4 for Instagram.',
    proof: 'See the caption style and placement on a vertical frame before the final render.',
    visual: '/marketing/founder-workshop.webp',
    howTitle: 'Turn a spoken clip into a captioned Reel',
    howBody: 'Review the message and the mobile composition before anything is published.',
    steps: [
      {
        title: 'Bring your finished Reel',
        body: 'Upload the vertical edit with the dialogue and timing already in place.',
      },
      {
        title: 'Correct and style the captions',
        body: 'Review the timed words, then choose a legible style and placement.',
      },
      {
        title: 'Check the preview',
        body: 'Watch the current version and export the captioned video when it is ready.',
      },
    ],
    benefitEyebrow: 'Consistent short-form presentation',
    benefitTitle: 'A clear caption look for every Reel.',
    benefits: [
      {
        title: 'Readable vertical layout',
        body: 'Keep captions prominent without crowding the subject or mobile controls.',
      },
      {
        title: 'One reviewed transcript',
        body: 'The preview and final export use the same approved words and timing.',
      },
      {
        title: 'Repeatable styling',
        body: 'Reuse a visual direction across a creator, campaign or client feed.',
      },
    ],
    faqs: [
      {
        question: 'Can I add captions to an Instagram Reel before posting?',
        answer:
          'Yes. Caption and export the finished video first, then upload that MP4 to Instagram.',
      },
      {
        question: 'Can Instagram Reel captions be animated?',
        answer: 'Yes. Apply a motion preset to the timed captions and preview it before export.',
      },
      {
        question: 'Can I edit an automatically generated Reel transcript?',
        answer: 'Yes. Correct individual words while preserving the surrounding timing.',
      },
    ],
    finalTitle: 'Turn your next Reel into a readable story.',
    finalBody: 'Review the words, choose the look and export a post-ready vertical video.',
  },
  shortsCaptions: {
    slug: 'captions-for-youtube-shorts',
    title: 'Add Captions to YouTube Shorts Online | ClipSubtitles',
    description:
      'Generate, edit and style captions for YouTube Shorts. Export a captioned MP4 or keep an SRT or VTT subtitle file.',
    eyebrow: 'Captions for YouTube Shorts',
    headline: 'Give every YouTube Short clear, timed captions.',
    lede: 'Create captions from the spoken clip, correct the transcript, preview a vertical-safe style and choose a captioned video or separate subtitle file.',
    answerTitle: 'How do I add captions to a YouTube Short?',
    answerBody:
      'Upload the Short, generate timed captions, correct the transcript and preview the styled result. Export a burned-in MP4 when you want the design fixed in the video, or download an SRT or VTT file when you want a separate subtitle track.',
    proof:
      'Choose between a styled video and separate subtitle files from the same reviewed words.',
    visual: '/marketing/filmmaker-workflow.webp',
    howTitle: 'Prepare captions for a YouTube Short',
    howBody:
      'Create one reviewed caption source, then choose the output that fits your upload workflow.',
    steps: [
      {
        title: 'Upload the Short',
        body: 'Start with the vertical video and spoken audio you intend to publish.',
      },
      {
        title: 'Review captions and style',
        body: 'Correct the timed transcript and preview a readable treatment for mobile viewing.',
      },
      {
        title: 'Choose the export',
        body: 'Download a captioned MP4, or keep the approved timing in an SRT or VTT file.',
      },
    ],
    benefitEyebrow: 'Flexible YouTube caption workflow',
    benefitTitle: 'Burned-in style or a separate subtitle track.',
    benefits: [
      {
        title: 'Consistent visual captions',
        body: 'Use a captioned MP4 when the exact type, colour and motion should always show.',
      },
      {
        title: 'Separate subtitle files',
        body: 'Export SRT or VTT from the same reviewed transcript when the platform should control display.',
      },
      {
        title: 'Review before rendering',
        body: 'Check transcript accuracy and the visual preview before creating the finished output.',
      },
    ],
    faqs: [
      {
        question: 'Can I add animated captions to YouTube Shorts?',
        answer:
          'Yes. Choose a style and motion preset, preview it and export the captions burned into the video.',
      },
      {
        question: 'Can I download an SRT file for a YouTube Short?',
        answer: 'Yes. SRT and VTT subtitle files can be exported from the reviewed caption timing.',
      },
      {
        question: 'Should I use burned-in captions or an SRT file?',
        answer:
          'Use burned-in captions when the exact visual design must always show. Use a separate subtitle file when you want the player to control caption display.',
      },
    ],
    finalTitle: 'Prepare captions for your next Short.',
    finalBody: 'Review once, then export the video or subtitle file your workflow needs.',
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
