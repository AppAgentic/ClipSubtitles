import { CloudTasksClient } from '@google-cloud/tasks';
import type { TaskRecord } from '@clipsubtitles/storage';
import type { AppConfig } from '../config';

export interface TaskDispatcher {
  dispatch(task: TaskRecord, generation?: number): Promise<void>;
}

export class PollTaskDispatcher implements TaskDispatcher {
  async dispatch(_task: TaskRecord, _generation = 0): Promise<void> {
    // The local durable worker polls the database.
  }
}

export class CloudTasksDispatcher implements TaskDispatcher {
  private readonly client: Pick<CloudTasksClient, 'queuePath' | 'taskPath' | 'createTask'>;
  private readonly parent: string;

  constructor(
    private readonly config: Extract<AppConfig['tasks'], { driver: 'cloud-tasks' }>,
    client: Pick<CloudTasksClient, 'queuePath' | 'taskPath' | 'createTask'> = new CloudTasksClient(),
  ) {
    this.client = client;
    this.parent = client.queuePath(config.projectId, config.location, config.queue);
  }

  async dispatch(task: TaskRecord, generation = 0): Promise<void> {
    const name = this.client.taskPath(
      this.config.projectId,
      this.config.location,
      this.config.queue,
      `${task.id}-g${generation}`,
    );
    const scheduleMs = Date.parse(task.runAfter);
    try {
      await this.client.createTask({
        parent: this.parent,
        task: {
          name,
          httpRequest: {
            httpMethod: 'POST',
            url: `${this.config.workerUrl}/internal/tasks/${encodeURIComponent(task.id)}`,
            oidcToken: { serviceAccountEmail: this.config.serviceAccountEmail, audience: this.config.workerUrl },
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from('{}').toString('base64'),
          },
          ...(Number.isFinite(scheduleMs) && scheduleMs > Date.now()
            ? { scheduleTime: { seconds: Math.floor(scheduleMs / 1000), nanos: (scheduleMs % 1000) * 1_000_000 } }
            : {}),
        },
      });
    } catch (err) {
      if ((err as { code?: number }).code === 6) return; // gRPC ALREADY_EXISTS
      throw err;
    }
  }
}

export function createTaskDispatcher(config: AppConfig): TaskDispatcher {
  return config.tasks.driver === 'cloud-tasks' ? new CloudTasksDispatcher(config.tasks) : new PollTaskDispatcher();
}
