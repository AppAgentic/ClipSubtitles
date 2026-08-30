import { createRequire } from 'node:module';
import { GlobalFonts } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);

const FACES: Array<{ family: string; weight: number; packageName: string; file: string }> = [
  { family: 'Inter', weight: 400, packageName: 'inter', file: '400Regular/Inter_400Regular.ttf' },
  { family: 'Inter', weight: 500, packageName: 'inter', file: '500Medium/Inter_500Medium.ttf' },
  { family: 'Inter', weight: 600, packageName: 'inter', file: '600SemiBold/Inter_600SemiBold.ttf' },
  { family: 'Inter', weight: 700, packageName: 'inter', file: '700Bold/Inter_700Bold.ttf' },
  {
    family: 'Inter',
    weight: 800,
    packageName: 'inter',
    file: '800ExtraBold/Inter_800ExtraBold.ttf',
  },
  { family: 'Inter', weight: 900, packageName: 'inter', file: '900Black/Inter_900Black.ttf' },
  {
    family: 'Bebas Neue',
    weight: 400,
    packageName: 'bebas-neue',
    file: '400Regular/BebasNeue_400Regular.ttf',
  },
  { family: 'Nunito', weight: 700, packageName: 'nunito', file: '700Bold/Nunito_700Bold.ttf' },
  {
    family: 'Nunito',
    weight: 800,
    packageName: 'nunito',
    file: '800ExtraBold/Nunito_800ExtraBold.ttf',
  },
  { family: 'Nunito', weight: 900, packageName: 'nunito', file: '900Black/Nunito_900Black.ttf' },
  {
    family: 'Playfair Display',
    weight: 600,
    packageName: 'playfair-display',
    file: '600SemiBold/PlayfairDisplay_600SemiBold.ttf',
  },
  {
    family: 'Playfair Display',
    weight: 700,
    packageName: 'playfair-display',
    file: '700Bold/PlayfairDisplay_700Bold.ttf',
  },
  {
    family: 'Space Mono',
    weight: 400,
    packageName: 'space-mono',
    file: '400Regular/SpaceMono_400Regular.ttf',
  },
  {
    family: 'Space Mono',
    weight: 700,
    packageName: 'space-mono',
    file: '700Bold/SpaceMono_700Bold.ttf',
  },
];

let registered = false;

/** Absolute paths of every bundled OFL caption face. */
export function fontFiles(): Array<{ family: string; weight: number; path: string }> {
  return FACES.map((face) => ({
    family: face.family,
    weight: face.weight,
    path: require.resolve(`@expo-google-fonts/${face.packageName}/${face.file}`),
  }));
}

/** Register all caption families with the canvas engine once per process. Idempotent. */
export function ensureFontsRegistered(): void {
  if (registered) return;
  for (const f of fontFiles()) GlobalFonts.registerFromPath(f.path, f.family);
  registered = true;
}
