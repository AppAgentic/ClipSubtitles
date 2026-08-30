// Copies the OFL Inter faces (the caption typeface) into public/fonts so the
// browser overlay measures and draws with exactly the same font files the
// renderer uses. Idempotent; runs before dev/build/typecheck.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'public', 'fonts');
mkdirSync(outDir, { recursive: true });
const emojiDir = path.join(here, '..', 'public', 'emoji');
mkdirSync(emojiDir, { recursive: true });

const faces = [
  ['inter', '400Regular/Inter_400Regular.ttf', 'Inter_400Regular.ttf'],
  ['inter', '500Medium/Inter_500Medium.ttf', 'Inter_500Medium.ttf'],
  ['inter', '600SemiBold/Inter_600SemiBold.ttf', 'Inter_600SemiBold.ttf'],
  ['inter', '700Bold/Inter_700Bold.ttf', 'Inter_700Bold.ttf'],
  ['inter', '800ExtraBold/Inter_800ExtraBold.ttf', 'Inter_800ExtraBold.ttf'],
  ['inter', '900Black/Inter_900Black.ttf', 'Inter_900Black.ttf'],
  ['bebas-neue', '400Regular/BebasNeue_400Regular.ttf', 'BebasNeue_400Regular.ttf'],
  ['nunito', '700Bold/Nunito_700Bold.ttf', 'Nunito_700Bold.ttf'],
  ['nunito', '800ExtraBold/Nunito_800ExtraBold.ttf', 'Nunito_800ExtraBold.ttf'],
  ['nunito', '900Black/Nunito_900Black.ttf', 'Nunito_900Black.ttf'],
  [
    'playfair-display',
    '600SemiBold/PlayfairDisplay_600SemiBold.ttf',
    'PlayfairDisplay_600SemiBold.ttf',
  ],
  ['playfair-display', '700Bold/PlayfairDisplay_700Bold.ttf', 'PlayfairDisplay_700Bold.ttf'],
  ['space-mono', '400Regular/SpaceMono_400Regular.ttf', 'SpaceMono_400Regular.ttf'],
  ['space-mono', '700Bold/SpaceMono_700Bold.ttf', 'SpaceMono_700Bold.ttf'],
];

let copied = 0;
for (const [pkg, src, name] of faces) {
  const from = require.resolve(`@expo-google-fonts/${pkg}/${src}`);
  const to = path.join(outDir, name);
  if (!existsSync(to)) {
    copyFileSync(from, to);
    copied += 1;
  }
}
if (copied) console.log(`sync-fonts: copied ${copied} caption face(s) to public/fonts`);

for (const codepoint of [
  '1f525',
  '1f680',
  '2764',
  '1f4a1',
  '1f4b0',
  '1f44f',
  '2705',
  '1f602',
  '1f389',
  '1f4aa',
  '1f440',
  '1f4af',
]) {
  const to = path.join(emojiDir, `${codepoint}.svg`);
  if (!existsSync(to)) copyFileSync(require.resolve(`@twemoji/svg/${codepoint}.svg`), to);
}
