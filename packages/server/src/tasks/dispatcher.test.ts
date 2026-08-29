import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '@clipsubtitles/storage';
import { CloudTasksDispatcher, PollTaskDispatcher } from './dispatcher';

const config = {
  driver: 'cloud-tasks' as const,
  projectId: 'clipsubtitles-test',
  location: 'europe-west2',
  queue: 'renders',
  workerUrl: 'https://worker.example.test',
  serviceAccountEmail: 'tasks@example.iam.gserviceaccount.com',
};

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task_01test',
    workspaceId: 'ws_test',
    kind: 'render_preview',
    status: 'queued',
    progress: 0,
    attempts: 0,
    maxAttempts: 2,
    input: {},
    cancelRequested: false,
    runAfter: '2026-08-29T12:00:00.000Z',
    createdAt: '2026-08-29T12:00:00.000Z',
    updatedAt: '2026-08-29T12:00:00.000Z',
    ...overrides,
  };
}

describe('task dispatchers', () => {
  it('poll dispatcher is a local no-op', async () => {
    await expect(new PollTaskDispatcher().dispatch(task())).resolves.toBeUndefined();
  });

  it('creates a deterministic OIDC-authenticated Cloud Task', async () => {
    const createTask = vi.fn().mockResolvedValue([{}]);
    const client = {
      queuePath: () => 'projects/p/locations/l/queues/q',
      taskPath: (_p: string, _l: string, _q: string, id: string) => `projects/p/locations/l/queues/q/tasks/${id}`,
      createTask,
    };
    await new CloudTasksDispatcher(config, client as never).dispatch(task({ runAfter: new Date(Date.now() + 60_000).toISOString() }));
    const request = createTask.mock.calls[0]?.[0];
    expect(request.task.name).toMatch(/\/tasks\/task_01test-g0$/);
    expect(request.task.httpRequest.url).toBe('https://worker.example.test/internal/tasks/task_01test');
    expect(request.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: config.serviceAccountEmail,
      audience: config.workerUrl,
    });
    expect(request.task.scheduleTime.seconds).toBeTypeOf('number');
  });

  it('treats an existing deterministic task as success', async () => {
    const client = {
      queuePath: () => 'queue',
      taskPath: () => 'task',
      createTask: vi.fn().mockRejectedValue(Object.assign(new Error('exists'), { code: 6 })),
    };
    await expect(new CloudTasksDispatcher(config, client as never).dispatch(task())).resolves.toBeUndefined();
  });

  it('uses a new Cloud Tasks name for each redispatch generation', async () => {
    const createTask = vi.fn().mockResolvedValue([{}]);
    const taskPath = vi.fn((_p: string, _l: string, _q: string, id: string) => id);
    const client = { queuePath: () => 'queue', taskPath, createTask };
    const dispatcher = new CloudTasksDispatcher(config, client as never);
    await dispatcher.dispatch(task(), 0);
    await dispatcher.dispatch(task({ attempts: 1 }), 1);
    expect(taskPath.mock.calls.map((call) => call[3])).toEqual(['task_01test-g0', 'task_01test-g1']);
  });
});
