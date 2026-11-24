import { EventEmitter } from "node:events";
import type { StepEvent } from "@studio/shared";
import { QueueEvents, type ConnectionOptions } from "bullmq";

export type HubEvent =
  | { type: "step"; payload: StepEvent }
  /** The job completed or failed. Listeners re-read Postgres for the final state. */
  | { type: "finished" };

/**
 * Fans BullMQ queue events out to SSE connections. One Redis stream reader
 * per API process, however many browsers are watching.
 */
export class GenerationEventHub {
  readonly #emitter = new EventEmitter();
  readonly #events: QueueEvents;

  private constructor(events: QueueEvents) {
    this.#events = events;
    // One listener per open SSE connection; bounded by connections, so no leak warning.
    this.#emitter.setMaxListeners(0);
    events.on("progress", ({ jobId, data }) => {
      this.#emitter.emit(jobId, { type: "step", payload: data as StepEvent } satisfies HubEvent);
    });
    events.on("completed", ({ jobId }) => this.#emitter.emit(jobId, { type: "finished" } satisfies HubEvent));
    events.on("failed", ({ jobId }) => this.#emitter.emit(jobId, { type: "finished" } satisfies HubEvent));
  }

  static async connect(options: {
    queueName: string;
    prefix: string;
    connection: ConnectionOptions;
  }): Promise<GenerationEventHub> {
    const events = new QueueEvents(options.queueName, {
      connection: options.connection,
      prefix: options.prefix,
    });
    await events.waitUntilReady();
    return new GenerationEventHub(events);
  }

  /** Returns the unsubscribe function. */
  subscribe(generationId: string, listener: (event: HubEvent) => void): () => void {
    this.#emitter.on(generationId, listener);
    return () => this.#emitter.off(generationId, listener);
  }

  async close(): Promise<void> {
    this.#emitter.removeAllListeners();
    await this.#events.close();
  }
}
