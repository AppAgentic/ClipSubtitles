import type { OutputSettings, RenderQuote, TaskStatus } from '@clipsubtitles/contracts';
import { DEFAULT_OUTPUT_SETTINGS } from '@clipsubtitles/contracts';

/**
 * Pure state machine for the render confirmation flow. The visible quote is
 * always the immutable server quote: any settings change while a quote is
 * open drops it, so Approve can never render something other than what the
 * card shows. Terminal tasks unlock the form again via an explicit reset.
 */
export interface RenderFlowState {
  settings: OutputSettings;
  quote: RenderQuote | null;
  taskId: string | null;
  taskStatus: TaskStatus | null;
  /** Set when a quote was dropped because settings changed. */
  quoteDroppedReason: 'settings_changed' | null;
}

export type RenderFlowAction =
  | { type: 'settings'; patch: Partial<OutputSettings> }
  | { type: 'toggle_output'; kind: OutputSettings['outputs'][number] }
  | { type: 'quoted'; quote: RenderQuote }
  | { type: 'quote_failed' }
  | { type: 'render_started'; taskId: string }
  | { type: 'task_status'; status: TaskStatus }
  | { type: 'reset' };

const TERMINAL = new Set<TaskStatus>(['succeeded', 'failed', 'cancelled']);

export function initialRenderFlowState(): RenderFlowState {
  return { settings: { ...DEFAULT_OUTPUT_SETTINGS, outputs: [...DEFAULT_OUTPUT_SETTINGS.outputs] }, quote: null, taskId: null, taskStatus: null, quoteDroppedReason: null };
}

export function isTaskActive(state: RenderFlowState): boolean {
  return state.taskId !== null && (state.taskStatus === null || !TERMINAL.has(state.taskStatus));
}

export function isTaskTerminal(state: RenderFlowState): boolean {
  return state.taskId !== null && state.taskStatus !== null && TERMINAL.has(state.taskStatus);
}

/** Settings are frozen while a render is queued/running; after it ends the user resets explicitly. */
export function formLocked(state: RenderFlowState): boolean {
  return state.taskId !== null;
}

export function canQuote(state: RenderFlowState, projectReady: boolean): boolean {
  return projectReady && !formLocked(state);
}

export function canApprove(state: RenderFlowState, nowMs: number, project: { version: number; contentHash: string } | null): boolean {
  const q = state.quote;
  if (!q || formLocked(state) || !project) return false;
  if (Date.parse(q.expiresAt) <= nowMs) return false;
  return q.projectVersion === project.version && q.contentHash === project.contentHash && q.status === 'open';
}

function dropQuote(state: RenderFlowState): RenderFlowState {
  return state.quote ? { ...state, quote: null, quoteDroppedReason: 'settings_changed' } : state;
}

export function renderFlowReducer(state: RenderFlowState, action: RenderFlowAction): RenderFlowState {
  switch (action.type) {
    case 'settings': {
      if (formLocked(state)) return state;
      return dropQuote({ ...state, settings: { ...state.settings, ...action.patch } });
    }
    case 'toggle_output': {
      if (formLocked(state)) return state;
      const has = state.settings.outputs.includes(action.kind);
      const outputs = has ? state.settings.outputs.filter((o) => o !== action.kind) : [...state.settings.outputs, action.kind];
      if (outputs.length === 0) return state; // at least one output stays selected
      return dropQuote({ ...state, settings: { ...state.settings, outputs } });
    }
    case 'quoted':
      return { ...state, quote: action.quote, quoteDroppedReason: null };
    case 'quote_failed':
      return { ...state, quote: null };
    case 'render_started':
      return { ...state, taskId: action.taskId, taskStatus: 'queued' };
    case 'task_status':
      return state.taskId ? { ...state, taskStatus: action.status } : state;
    case 'reset':
      // Keep the chosen settings; drop the consumed quote and finished task so a new quote can be requested.
      return { ...state, quote: null, taskId: null, taskStatus: null, quoteDroppedReason: null };
    default:
      return state;
  }
}
