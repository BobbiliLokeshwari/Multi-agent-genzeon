import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyReply } from "fastify";

export interface EventStream {
  send(event: string, data: unknown): void;
  onClose(cleanup: () => void): void;
  close(): void;
}

/**
 * Takes over the response and turns it into a Server-Sent Events stream.
 * Headers already set by plugins (CORS, Helmet) are carried over, because
 * a hijacked reply no longer sends them automatically.
 */
export function openEventStream(
  reply: FastifyReply,
  options: { retryMs: number; heartbeatMs: number },
): EventStream {
  reply.hijack();
  const res = reply.raw;

  const inherited: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) inherited[name] = value;
  }
  res.writeHead(200, {
    ...inherited,
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no", // Stop nginx-style proxies from buffering the stream.
  });
  res.write(`retry: ${options.retryMs}\n\n`);

  let closed = false;
  const cleanups: Array<() => void> = [];
  // Comment lines keep idle proxies and load balancers from dropping the connection.
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), options.heartbeatMs);
  heartbeat.unref();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    for (const cleanup of cleanups.splice(0)) cleanup();
    if (!res.writableEnded) res.end();
  };
  // The response's "close" fires when the browser disconnects or we end it.
  res.on("close", close);

  return {
    send(event, data) {
      if (closed) return;
      // JSON.stringify escapes newlines, so each payload is a single `data:` line.
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    onClose(cleanup) {
      if (closed) cleanup();
      else cleanups.push(cleanup);
    },
    close,
  };
}
