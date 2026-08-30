import { access, mkdir, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { ensureFontsRegistered, fontFiles } from '@clipsubtitles/render';

// The production server bundles workspace source while keeping npm packages
// external. Resolve every provider family here so Docker fails during build,
// rather than letting Cloud Run discover an omitted deployment dependency.
const runtimeRequire = createRequire(import.meta.url);
for (const runtimePackage of [
  '@aws-sdk/client-s3',
  '@google-cloud/storage',
  '@google-cloud/tasks',
  '@google/genai',
  '@workos-inc/node',
  'pg',
]) {
  runtimeRequire.resolve(runtimePackage);
}

function command(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.once('error', reject);
    child.once('close', (code) => (code === 0 ? resolve(`${stdout}\n${stderr}`) : reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`))));
  });
}

const dataDir = path.resolve(process.env.DATA_DIR ?? '/tmp/clipsubtitles');
await mkdir(dataDir, { recursive: true });
const canary = path.join(dataDir, `.runtime-check-${process.pid}`);
await writeFile(canary, 'ok');
await access(canary, constants.R_OK | constants.W_OK);
await rm(canary, { force: true });

const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';
await command(ffprobe, ['-version']);
const encoders = await command(ffmpeg, ['-hide_banner', '-encoders']);
for (const required of ['libx264', 'prores_ks']) {
  if (!encoders.includes(required)) throw new Error(`FFmpeg encoder ${required} is unavailable`);
}

ensureFontsRegistered();
for (const font of fontFiles()) await access(font.path, constants.R_OK);
const canvas = createCanvas(32, 32);
const ctx = canvas.getContext('2d');
ctx.font = '700 16px Inter';
ctx.fillText('Clip', 1, 18);
if (canvas.toBuffer('image/png').length < 100) throw new Error('Canvas PNG canary failed');

console.log(JSON.stringify({ ok: true, node: process.version, ffmpeg, ffprobe, fonts: fontFiles().length, dataDir }));
