import { z } from 'zod';

/**
 * Explicit caption positioning only. Visual safe-placement, face detection, OCR,
 * and automatic repositioning are intentionally out of scope (product decision).
 */
export const CaptionPositionSchema = z.enum(['top', 'center', 'lower-third', 'bottom']);
export type CaptionPosition = z.infer<typeof CaptionPositionSchema>;

export const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'must be #RRGGBB or #RRGGBBAA');

export const FontFamilySchema = z.enum(['Inter']);
export const FontWeightSchema = z.union([
  z.literal(400),
  z.literal(500),
  z.literal(600),
  z.literal(700),
  z.literal(800),
  z.literal(900),
]);
export const TextTransformSchema = z.enum(['none', 'uppercase']);
export const HighlightModeSchema = z.enum(['none', 'word']);
export const TextAlignSchema = z.enum(['left', 'center', 'right']);
export const MotionPresetSchema = z.enum(['none', 'soft-rise', 'spring-pop', 'karaoke-slide']);
export type MotionPreset = z.infer<typeof MotionPresetSchema>;
export const MotionConfigSchema = z.object({
  preset: MotionPresetSchema,
  enterDurationMs: z.number().int().min(80).max(1_200),
  exitDurationMs: z.number().int().min(0).max(600),
  wordTransitionMs: z.number().int().min(60).max(600),
});

export const StylePresetIdSchema = z.enum([
  'clean',
  'bold-pop',
  'lower-third',
  'karaoke',
  'minimal',
]);
export type StylePresetId = z.infer<typeof StylePresetIdSchema>;

/**
 * All sizes are fractions of the SHORTER frame side (resolution and
 * orientation independent) so the browser overlay, canvas rasterizer, and
 * Remotion composition agree exactly. Vertical offsets are fractions of height.
 */
export const StyleConfigSchema = z
  .object({
    preset: StylePresetIdSchema,
    position: CaptionPositionSchema,
    fontFamily: FontFamilySchema,
    fontWeight: FontWeightSchema,
    fontSizePct: z
      .number()
      .min(0.02)
      .max(0.12)
      .describe('Font size as fraction of the shorter frame side'),
    lineHeight: z.number().min(1).max(1.8),
    maxLines: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    maxCharsPerLine: z.number().int().min(10).max(60),
    textAlign: TextAlignSchema,
    textTransform: TextTransformSchema,
    textColor: HexColorSchema,
    stroke: z.object({
      widthPct: z
        .number()
        .min(0)
        .max(0.02)
        .describe('Outline width as fraction of the shorter frame side'),
      color: HexColorSchema,
    }),
    shadow: z.object({
      enabled: z.boolean(),
      color: HexColorSchema,
      blurPct: z.number().min(0).max(0.03),
      offsetYPct: z.number().min(-0.02).max(0.02),
    }),
    background: z.object({
      enabled: z.boolean(),
      color: HexColorSchema,
      paddingXPct: z.number().min(0).max(0.05),
      paddingYPct: z.number().min(0).max(0.05),
      radiusPct: z.number().min(0).max(0.03),
    }),
    highlight: z.object({
      mode: HighlightModeSchema,
      color: HexColorSchema,
      backgroundColor: HexColorSchema.optional(),
      scale: z.number().min(1).max(1.3).describe('Scale applied to the active word'),
    }),
    motion: MotionConfigSchema.default({
      preset: 'soft-rise',
      enterDurationMs: 260,
      exitDurationMs: 120,
      wordTransitionMs: 180,
    }),
    safeMarginPct: z
      .number()
      .min(0.02)
      .max(0.2)
      .describe('Distance from the frame edge for top/bottom positions'),
    lowerThirdOffsetPct: z
      .number()
      .min(0.1)
      .max(0.4)
      .describe('Vertical offset from bottom for lower-third'),
  })
  .meta({ id: 'StyleConfig' });
export type StyleConfig = z.infer<typeof StyleConfigSchema>;

/** Partial style used by PATCH/update operations (partial at both levels). Unknown keys are rejected. */
export const StylePatchSchema = StyleConfigSchema.partial()
  .extend({
    stroke: StyleConfigSchema.shape.stroke.partial().strict().optional(),
    shadow: StyleConfigSchema.shape.shadow.partial().strict().optional(),
    background: StyleConfigSchema.shape.background.partial().strict().optional(),
    highlight: StyleConfigSchema.shape.highlight.partial().strict().optional(),
    motion: MotionConfigSchema.partial().strict().optional(),
  })
  .strict();
export type StylePatch = z.infer<typeof StylePatchSchema>;
