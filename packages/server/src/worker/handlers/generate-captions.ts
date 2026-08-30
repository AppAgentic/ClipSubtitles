import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { TaskResult } from '@clipsubtitles/contracts';
import { SegmentationParamsSchema } from '@clipsubtitles/contracts';
import {
  createCaptionState,
  evaluateCaptions,
  newId,
  normalizeWords,
  segmentationForStyle,
  stateContentHash,
  stylePreset,
} from '@clipsubtitles/core';
import { StorageError, type TaskRecord } from '@clipsubtitles/storage';
import {
  detectSpeech,
  extractAudio,
  readWav,
  transcribeWithFallback,
  type TranscriptionProvider,
} from '@clipsubtitles/transcription';
import type { AppContext } from '../../context';
import { TaskFailure } from '../errors';
import { GenerateCaptionsInputSchema } from '../inputs';
import type { HandlerTools } from '../worker';

export async function generateCaptionsHandler(
  ctx: AppContext,
  task: TaskRecord,
  tools: HandlerTools,
): Promise<TaskResult> {
  const input = GenerateCaptionsInputSchema.parse(task.input);
  const project = await ctx.db.getProjectById(input.projectId);
  if (!project || project.workspaceId !== task.workspaceId)
    throw new TaskFailure('NOT_FOUND', 'Project not found.');
  const asset = await ctx.db.getAssetById(input.assetId);
  if (!asset || asset.status !== 'ready' || !asset.storageKey)
    throw new TaskFailure('SOURCE_NOT_READY');

  const workDir = path.join(ctx.config.workDir, task.id);
  await mkdir(workDir, { recursive: true });
  try {
    tools.progress(5, 'extracting-audio');
    const audioPath = path.join(workDir, 'audio.wav');
    const sourcePath = await ctx.store.materialize(asset.storageKey);
    try {
      await extractAudio(sourcePath, audioPath, {
        tools: { ffmpegPath: ctx.config.ffmpegPath, ffprobePath: ctx.config.ffprobePath },
        signal: tools.signal,
      });
    } finally {
      await ctx.store.releaseMaterialized?.(sourcePath).catch(() => undefined);
    }
    if (asset.truthKey && (await ctx.store.exists(asset.truthKey))) {
      // Fixture ground truth travels with the audio so mock providers can find it; live providers ignore it.
      const truthPath = await ctx.store.materialize(asset.truthKey);
      try {
        await copyFile(truthPath, `${audioPath}.truth.json`);
      } finally {
        await ctx.store.releaseMaterialized?.(truthPath).catch(() => undefined);
      }
    }
    tools.progress(15, 'detecting-speech');
    const pcm = await readWav(audioPath);
    const durationMs = asset.durationMs ?? Math.round((pcm.samples.length / pcm.sampleRate) * 1000);
    const speechRegions = detectSpeech(pcm.samples, pcm.sampleRate);

    tools.progress(20, 'transcribing');
    let providers: TranscriptionProvider[] = ctx.providers.chain;
    if (input.provider) {
      const forced = ctx.providers.chain.find((provider) => provider.id === input.provider);
      if (!forced) throw new TaskFailure('VALIDATION_FAILED', 'Provider is not enabled.');
      providers = [forced];
    }
    const outcome = await transcribeWithFallback(
      providers,
      {
        audioPath,
        durationMs,
        sampleRate: pcm.sampleRate,
        ...((input.language ?? project.language)
          ? { languageHint: input.language ?? project.language }
          : {}),
        ...(input.vocabulary ? { vocabulary: input.vocabulary } : {}),
        speechRegions,
        ...(asset.truthKey ? { fixtureId: asset.id } : {}),
      },
      {
        signal: tools.signal,
        onAttempt: (a) =>
          ctx.logger.info('transcription attempt', {
            taskId: task.id,
            providerId: a.providerId,
            outcome: a.outcome,
            errorCode: a.errorCode,
            errorMessage: a.errorMessage,
            providerDiagnostic: a.diagnostic,
            latencyMs: a.latencyMs,
          }),
      },
    );
    tools.progress(70, 'normalizing');
    const words = normalizeWords(outcome.result.words, { durationMs, wordId: () => newId('word') });
    if (words.length === 0)
      throw new TaskFailure('TRANSCRIPT_MISSING', 'No speech was recognized in the source.');

    tools.progress(80, 'segmenting');
    const language = outcome.result.language || input.language || project.language || 'und';

    // Commit atomically against the CURRENT version. Style is derived from the latest
    // project state (edits made during transcription survive); the request's explicit
    // preset/position are applied on top. expectedVersion only records what the caller saw.
    const commit = () =>
      ctx.db.transaction(async () => {
        const current = await ctx.db.getProjectById(project.id);
        if (!current) throw new TaskFailure('NOT_FOUND', 'Project disappeared.');
        if (current.version !== input.expectedVersion) {
          ctx.logger.info('project edited during transcription; merging onto latest style', {
            taskId: task.id,
            expected: input.expectedVersion,
            current: current.version,
          });
        }
        const baseStyle = input.preset ? stylePreset(input.preset) : current.style;
        const style = input.position ? { ...baseStyle, position: input.position } : baseStyle;
        const segmentation = SegmentationParamsSchema.parse({
          ...segmentationForStyle(style, current.segmentation),
          ...(input.segmentation ?? {}),
        });
        const now = ctx.clock.iso();
        const revision = await ctx.db.createRevision({
          projectId: project.id,
          source: outcome.fallbackFrom ? 'fallback' : 'generated',
          provider: outcome.providerId,
          model: outcome.result.model,
          language,
          words,
          durationMs,
          ...(outcome.fallbackFrom ? { fallbackFrom: outcome.fallbackFrom } : {}),
          ...(current.currentRevisionId ? { parentRevisionId: current.currentRevisionId } : {}),
          now,
        });
        const state = createCaptionState({
          title: current.title,
          words,
          style,
          segmentation,
          language,
          revisionSeed: revision.id,
        });
        const qa = evaluateCaptions(state.words, state.pages, state.segmentation);
        const updated = await ctx.db.commitProjectEdit({
          id: project.id,
          workspaceId: task.workspaceId,
          expectedVersion: current.version,
          patch: {
            title: current.title,
            language,
            status: 'captioned',
            style,
            segmentation,
            pages: state.pages,
            manualBreaks: [],
            manualJoins: [],
            qa,
            contentHash: stateContentHash(state),
            currentRevisionId: revision.id,
          },
          now,
        });
        await ctx.db.invalidateOpenQuotes(project.id, 'captions regenerated');
        return { revision, updated, pageCount: state.pages.length };
      });
    let committed;
    try {
      committed = await commit();
    } catch (err) {
      if (err instanceof StorageError && err.code === 'VERSION_CONFLICT') committed = await commit();
      else throw err;
    }
    tools.progress(98, 'done');
    const result: TaskResult = {
      kind: 'generate_captions',
      projectId: project.id,
      revisionId: committed.revision.id,
      projectVersion: committed.updated.version,
      wordCount: words.length,
      pageCount: committed.pageCount,
      provider: outcome.providerId,
      language,
    };
    if (outcome.result.model) result.model = outcome.result.model;
    if (outcome.fallbackFrom) result.fallbackFrom = outcome.fallbackFrom;
    return result;
  } catch (err) {
    if (!tools.signal.aborted) {
      const current = await ctx.db.getProjectById(project.id);
      if (current && current.status === 'transcribing') {
        await ctx.db.updateProjectMeta(
          project.id,
          { status: current.currentRevisionId ? 'captioned' : 'ready' },
          ctx.clock.iso(),
        );
      }
    }
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
