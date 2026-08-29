import type { TruthTranscript, TruthWord } from '../truth';

export type BenchmarkCategory = 'clean' | 'music' | 'accent' | 'code_switching' | 'poor_mic' | 'multilingual';

export interface BenchmarkCase {
  id: string;
  title: string;
  category: BenchmarkCategory;
  language: string;
  /** Original, redistributable script. Entities/domain terms are wrapped in [[...]]. */
  script: string;
  wordsPerMinute: number;
  wordGapMs: number;
  sentencePauseMs: number;
  audio: {
    noise: 'none' | 'hiss' | 'hum' | 'music';
    noiseLevel: number;
    speechLevel: number;
    pitchHz: number;
  };
  speakers: number;
  /** Also emit a demo MP4 for the local product flow. */
  demoVideo?: boolean;
}

/**
 * Representative synthetic corpus. Every script is original text written for
 * this repository, so fixtures are redistributable. Audio is synthesized as
 * tone bursts aligned to the ground truth (see synth.ts); it exercises the
 * pipeline and scorer deterministically but is NOT speech, so results from
 * mock providers are never evidence about real providers.
 */
export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 'clean-en-product-demo',
    title: 'Clean English product demo',
    category: 'clean',
    language: 'en',
    script:
      'Welcome back to the channel. Today I want to show you how [[ClipSubtitles]] turns a raw clip into styled captions in about a minute. First, drop your video in. Then hit generate. Every word stays exactly as you said it, and you can fix timing with a single drag. Let us try it on this clip.',
    wordsPerMinute: 150,
    wordGapMs: 50,
    sentencePauseMs: 520,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.6, pitchHz: 190 },
    speakers: 1,
    demoVideo: true,
  },
  {
    id: 'clean-en-tutorial',
    title: 'Clean English tutorial with numbers',
    category: 'clean',
    language: 'en',
    script:
      'Step one, open the [[Studio]] tab. Step two, choose the [[Bold Pop]] preset. Step three, move the captions to the lower third. That is it, three steps and about forty seconds. If your clip is longer than ten minutes, split it first.',
    wordsPerMinute: 160,
    wordGapMs: 45,
    sentencePauseMs: 480,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.55, pitchHz: 210 },
    speakers: 1,
  },
  {
    id: 'fast-en-hype',
    title: 'Fast-paced English hook',
    category: 'clean',
    language: 'en',
    script:
      'Stop scrolling. This is the fastest way I have ever captioned a reel and I have tried [[CapCut]], [[Premiere]], and about six other apps. Watch this.',
    wordsPerMinute: 210,
    wordGapMs: 25,
    sentencePauseMs: 300,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.7, pitchHz: 240 },
    speakers: 1,
  },
  {
    id: 'music-en-vlog',
    title: 'English vlog over background music',
    category: 'music',
    language: 'en',
    script:
      'So we are finally in [[Lisbon]] and the light here is unreal. I filmed everything on the [[Pocket 3]] and honestly the audio picked up way more street noise than I expected. Anyway, captions on, let us see if it keeps up.',
    wordsPerMinute: 155,
    wordGapMs: 55,
    sentencePauseMs: 500,
    audio: { noise: 'music', noiseLevel: 0.25, speechLevel: 0.5, pitchHz: 200 },
    speakers: 1,
    demoVideo: true,
  },
  {
    id: 'accent-en-interview',
    title: 'Accented English interview, two speakers',
    category: 'accent',
    language: 'en',
    script:
      'Thank you for having me. I grew up in [[Nairobi]] and moved to [[Manchester]] for university. The first winter was a shock, honestly. What surprised you most about the work culture? People apologise before asking a question, which took me a while to decode.',
    wordsPerMinute: 140,
    wordGapMs: 60,
    sentencePauseMs: 620,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.55, pitchHz: 170 },
    speakers: 2,
  },
  {
    id: 'code-switching-es-en',
    title: 'Spanish/English code switching',
    category: 'code_switching',
    language: 'es',
    script:
      'Bueno, hoy vamos a probar esto con un clip real. The idea is simple: subes el video, y la app genera los subtítulos. Honestly it is faster than doing it a mano. Vamos a ver si respeta las palabras exactamente como las dije.',
    wordsPerMinute: 165,
    wordGapMs: 45,
    sentencePauseMs: 450,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.6, pitchHz: 205 },
    speakers: 1,
  },
  {
    id: 'poor-mic-en-podcast',
    title: 'Poor microphone podcast segment',
    category: 'poor_mic',
    language: 'en',
    script:
      'Yeah so the mic on this laptop is terrible, sorry about that. We were talking about retention windows. If exports vanish after seven days, people need a clear warning, and probably an email. Otherwise support tickets pile up fast.',
    wordsPerMinute: 150,
    wordGapMs: 60,
    sentencePauseMs: 560,
    audio: { noise: 'hiss', noiseLevel: 0.35, speechLevel: 0.3, pitchHz: 180 },
    speakers: 1,
  },
  {
    id: 'hum-en-kitchen',
    title: 'Mains hum, kitchen recording',
    category: 'poor_mic',
    language: 'en',
    script:
      'Okay the fridge is humming but let us keep going. Whisk the eggs, fold in the [[gruyère]], and do not overbake it. Twelve minutes, no more. Trust me on this one.',
    wordsPerMinute: 145,
    wordGapMs: 60,
    sentencePauseMs: 540,
    audio: { noise: 'hum', noiseLevel: 0.3, speechLevel: 0.45, pitchHz: 215 },
    speakers: 1,
  },
  {
    id: 'multilingual-pt',
    title: 'Brazilian Portuguese explainer',
    category: 'multilingual',
    language: 'pt-BR',
    script:
      'Oi pessoal, hoje eu vou mostrar como legendar um vídeo em menos de um minuto. Você envia o arquivo, gera as legendas, e ajusta o estilo. Cada palavra fica exatamente como você falou. Vamos testar agora com este clipe de [[São Paulo]].',
    wordsPerMinute: 160,
    wordGapMs: 45,
    sentencePauseMs: 480,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.6, pitchHz: 200 },
    speakers: 1,
  },
  {
    id: 'multilingual-de',
    title: 'German product update',
    category: 'multilingual',
    language: 'de',
    script:
      'Hallo zusammen. Heute zeige ich euch das neue Untertitel-Studio. Ihr ladet das Video hoch, wählt eine Vorlage, und exportiert als [[MP4]] oder [[SRT]]. Die Wörter werden nie umgeschrieben. Probieren wir es aus.',
    wordsPerMinute: 150,
    wordGapMs: 50,
    sentencePauseMs: 500,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.6, pitchHz: 185 },
    speakers: 1,
  },
  {
    id: 'multilingual-fr',
    title: 'French tutorial',
    category: 'multilingual',
    language: 'fr',
    script:
      'Bonjour à tous. Dans cette vidéo, on ajoute des sous-titres à un clip vertical en quelques secondes. Importez la vidéo, générez les sous-titres, puis choisissez la position. Chaque mot reste exactement tel que vous l’avez prononcé.',
    wordsPerMinute: 155,
    wordGapMs: 45,
    sentencePauseMs: 480,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.6, pitchHz: 195 },
    speakers: 1,
  },
  {
    id: 'entities-en-brands',
    title: 'Entity-heavy English, brands and numbers',
    category: 'clean',
    language: 'en',
    script:
      'We benchmarked [[Gemini]], [[ElevenLabs Scribe]], [[GPT Transcribe]], and [[Whisper]] on 48 clips. The average clip was 37 seconds at 1080 by 1920. [[Kubernetes]] and [[PostgreSQL]] tripped up two of the models, and [[Zürich]] became Zurich every single time.',
    wordsPerMinute: 150,
    wordGapMs: 50,
    sentencePauseMs: 520,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.6, pitchHz: 190 },
    speakers: 1,
  },
  {
    id: 'long-en-monologue',
    title: 'Longer English monologue (drift detection)',
    category: 'clean',
    language: 'en',
    script: Array.from(
      { length: 6 },
      (_, i) =>
        `Part ${i + 1}. When captions drift, viewers notice within seconds, so the benchmark tracks cumulative offset across the whole clip rather than a single average. A model that is perfect for thirty seconds and late by half a second at the end still fails the gate.`,
    ).join(' '),
    wordsPerMinute: 150,
    wordGapMs: 50,
    sentencePauseMs: 500,
    audio: { noise: 'none', noiseLevel: 0, speechLevel: 0.6, pitchHz: 190 },
    speakers: 1,
  },
];

export interface CaseTruth {
  truth: TruthTranscript;
  durationMs: number;
}

/**
 * Deterministic ground truth from a case: word durations scale with word
 * length around the case speaking rate; sentence ends add a pause; entity
 * markup is stripped from text but recorded on the word.
 */
export function truthFromCase(c: BenchmarkCase): CaseTruth {
  const tokens = tokenizeScript(c.script);
  const avgWordMs = 60_000 / c.wordsPerMinute;
  const words: TruthWord[] = [];
  const sentenceStarts: number[] = [0];
  let cursor = 400; // leading silence
  let speaker = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!t) continue;
    const lengthFactor = Math.max(0.5, Math.min(2.2, t.text.replace(/[\p{P}]/gu, '').length / 5));
    const durationMs = Math.max(120, Math.round(avgWordMs * lengthFactor * 0.8));
    const word: TruthWord = { text: t.text, startMs: cursor, endMs: cursor + durationMs };
    if (t.entity) word.entity = true;
    if (c.speakers > 1) word.speaker = `S${speaker + 1}`;
    words.push(word);
    cursor += durationMs + c.wordGapMs;
    if (/[.!?]["')]?$/.test(t.text)) {
      cursor += c.sentencePauseMs;
      if (i + 1 < tokens.length) sentenceStarts.push(i + 1);
      if (c.speakers > 1 && /\?$/.test(t.text) === false && Math.floor(i / 12) % 2 === 1) {
        speaker = (speaker + 1) % c.speakers;
      }
    }
  }
  const durationMs = cursor + 600; // trailing silence
  return { truth: { language: c.language, words, sentenceStarts }, durationMs };
}

interface ScriptToken {
  text: string;
  entity: boolean;
}

export function tokenizeScript(script: string): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  const re = /\[\[([^\]]+)\]\]([\p{P}]*)|(\S+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    if (m[1] !== undefined) {
      const parts = m[1].split(/\s+/).filter(Boolean);
      parts.forEach((p, i) => {
        tokens.push({ text: i === parts.length - 1 ? p + (m?.[2] ?? '') : p, entity: true });
      });
    } else if (m[3]) {
      tokens.push({ text: m[3], entity: false });
    }
  }
  return tokens;
}
