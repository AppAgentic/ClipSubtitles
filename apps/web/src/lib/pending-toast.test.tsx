// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { usePendingToast, type PendingToast } from './pending-toast';

afterEach(cleanup);

let handle: PendingToast | null = null;

function Flow() {
  const toast = useToast();
  handle = usePendingToast(toast);
  return <div data-testid="flow" />;
}

function Host({ mounted }: { mounted: boolean }) {
  return <ToastProvider>{mounted ? <Flow /> : null}</ToastProvider>;
}

describe('usePendingToast', () => {
  it('dismisses the sticky toast when the owning screen unmounts (navigation mid-render)', () => {
    const view = render(<Host mounted />);
    act(() => handle!.start('3 credits reserved. Rendering…'));
    expect(screen.getByText('3 credits reserved. Rendering…')).toBeTruthy();
    view.rerender(<Host mounted={false} />);
    expect(screen.queryByTestId('flow')).toBeNull();
    expect(screen.queryByText('3 credits reserved. Rendering…')).toBeNull();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('settle() replaces the pending toast exactly once', () => {
    render(<Host mounted />);
    act(() => handle!.start('3 credits reserved. Rendering…'));
    let first = false;
    let second = false;
    act(() => {
      first = handle!.settle('ok', 'Render finished. Credits charged once.');
    });
    act(() => {
      second = handle!.settle('ok', 'Render finished. Credits charged once.');
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(screen.queryByText('3 credits reserved. Rendering…')).toBeNull();
    expect(screen.getAllByText('Render finished. Credits charged once.')).toHaveLength(1);
  });

  it('start() twice keeps a single sticky toast', () => {
    render(<Host mounted />);
    act(() => handle!.start('first'));
    act(() => handle!.start('second'));
    expect(screen.queryByText('first')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
