import type { Response } from "express";

export interface LiveEvent {
  kind: "run_start" | "step" | "verdict" | "outcome" | "idle";
  at: string;
  data: Record<string, unknown>;
}

export class LiveBroadcast {
  private clients = new Set<Response>();
  private recent: LiveEvent[] = [];

  attach(res: Response): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    for (const event of this.recent.slice(-20)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  emit(kind: LiveEvent["kind"], data: Record<string, unknown>): void {
    const event: LiveEvent = { kind, at: new Date().toISOString(), data };
    this.recent.push(event);
    if (this.recent.length > 200) {
      this.recent.splice(0, this.recent.length - 200);
    }
    for (const client of this.clients) {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}
