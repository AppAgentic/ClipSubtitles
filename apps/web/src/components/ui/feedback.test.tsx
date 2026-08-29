// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider, useToast, type ToastApi } from './Toast';
import { KV } from './primitives';

afterEach(cleanup);

function Capture({ onReady }: { onReady: (api: ToastApi) => void }) {
  onReady(useToast());
  return null;
}

describe('ToastProvider', () => {
  it('replaces a sticky pending toast with the terminal outcome so both never coexist', () => {
    let api: ToastApi | null = null;
    render(
      <ToastProvider>
        <Capture onReady={(a) => (api = a)} />
      </ToastProvider>,
    );
    let id = 0;
    act(() => {
      id = api!.push('info', '3 credits reserved. Rendering…', { sticky: true });
    });
    expect(screen.getByText('3 credits reserved. Rendering…')).toBeTruthy();
    act(() => {
      api!.replace(id, 'ok', 'Render finished. Credits charged once.');
    });
    expect(screen.queryByText('3 credits reserved. Rendering…')).toBeNull();
    expect(screen.getByText('Render finished. Credits charged once.')).toBeTruthy();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('exposes a dismiss control on every toast', () => {
    let api: ToastApi | null = null;
    render(
      <ToastProvider>
        <Capture onReady={(a) => (api = a)} />
      </ToastProvider>,
    );
    act(() => {
      api!.push('error', 'Something failed');
    });
    act(() => {
      screen.getByRole('button', { name: 'Dismiss notification' }).click();
    });
    expect(screen.queryByText('Something failed')).toBeNull();
  });
});

describe('KV', () => {
  it('keeps long identifiers visible by wrapping instead of clipping', () => {
    const id = 'quote_01m15s55qdnm381qn3qrjw87gkabcdefghijk';
    const { container } = render(<KV k="Quote" v={id} mono />);
    const value = container.querySelector('[data-kv-value]');
    expect(value?.textContent).toBe(id);
    expect(value?.className).toContain('min-w-0');
    expect(value?.className).toContain('break-all');
    const label = container.querySelector('span');
    expect(label?.className).toContain('shrink-0');
    expect(value?.getAttribute('aria-hidden')).toBeNull();
  });
});
