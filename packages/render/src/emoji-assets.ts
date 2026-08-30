import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Image } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);
const cache = new Map<string, Image>();

/** Load a bundled Twemoji SVG synchronously once so frame rasterization remains deterministic and offline. */
export function emojiImage(codepoint: string): Image {
  const cached = cache.get(codepoint);
  if (cached) return cached;
  const image = new Image();
  image.src = readFileSync(require.resolve(`@twemoji/svg/${codepoint}.svg`));
  cache.set(codepoint, image);
  return image;
}
