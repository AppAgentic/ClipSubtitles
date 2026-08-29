import { createRequire } from 'node:module';
import { GlobalFonts } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);

export const FONT_FAMILY = 'Inter';

const WEIGHTS: Array<{ weight: number; file: string }> = [
  { weight: 400, file: '400Regular/Inter_400Regular.ttf' },
  { weight: 500, file: '500Medium/Inter_500Medium.ttf' },
  { weight: 600, file: '600SemiBold/Inter_600SemiBold.ttf' },
  { weight: 700, file: '700Bold/Inter_700Bold.ttf' },
  { weight: 800, file: '800ExtraBold/Inter_800ExtraBold.ttf' },
  { weight: 900, file: '900Black/Inter_900Black.ttf' },
];

let registered = false;

/** Absolute paths of the bundled OFL Inter faces (also used by the web app font sync). */
export function fontFiles(): Array<{ weight: number; path: string }> {
  return WEIGHTS.map((w) => ({ weight: w.weight, path: require.resolve(`@expo-google-fonts/inter/${w.file}`) }));
}

/** Register Inter with the canvas engine once per process. Idempotent. */
export function ensureFontsRegistered(): void {
  if (registered) return;
  for (const f of fontFiles()) GlobalFonts.registerFromPath(f.path, FONT_FAMILY);
  registered = true;
}
