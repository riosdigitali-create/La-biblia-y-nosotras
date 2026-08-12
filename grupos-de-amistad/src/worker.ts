import type { Env } from './lib/env';
import { handleQueue } from './queues/consumer';
import { handleScheduled } from './cron/scheduled';

/**
 * Manejadores de Queue y Cron.
 * Las rutas HTTP viven en functions/ (Pages Functions).
 */
export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleQueue(batch as never, env);
  },
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(event, env);
  },
};
