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

const faces = [
  ['400Regular/Inter_400Regular.ttf', 'Inter_400Regular.ttf'],
  ['500Medium/Inter_500Medium.ttf', 'Inter_500Medium.ttf'],
  ['600SemiBold/Inter_600SemiBold.ttf', 'Inter_600SemiBold.ttf'],
  ['700Bold/Inter_700Bold.ttf', 'Inter_700Bold.ttf'],
  ['800ExtraBold/Inter_800ExtraBold.ttf', 'Inter_800ExtraBold.ttf'],
  ['900Black/Inter_900Black.ttf', 'Inter_900Black.ttf'],
];

let copied = 0;
for (const [src, name] of faces) {
  const from = require.resolve(`@expo-google-fonts/inter/${src}`);
  const to = path.join(outDir, name);
  if (!existsSync(to)) {
    copyFileSync(from, to);
    copied += 1;
  }
}
if (copied) console.log(`sync-fonts: copied ${copied} Inter face(s) to public/fonts`);
