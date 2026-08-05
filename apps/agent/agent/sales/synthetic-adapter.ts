import type { BuyerTurn, SalesAction, SalesChannelAdapter } from "./adapter";

export class SyntheticSalesAdapter implements SalesChannelAdapter {
  readonly external = false;
  readonly identity = {
    provider: "synthetic",
    model: "deterministic-script",
    tool: "SyntheticSalesAdapter",
    identityStatus: "VERIFIED" as const,
  };
  readonly outgoing: SalesAction[] = [];
  readonly followups: SalesAction[] = [];
  private readonly turns: BuyerTurn[];
  private failSends: number;

  constructor(turns: BuyerTurn[], options: { failSends?: number } = {}) {
    this.turns = [...turns];
    this.failSends = options.failSends ?? 0;
  }

  async send(action: SalesAction): Promise<void> {
    if (this.failSends > 0) {
      this.failSends -= 1;
      throw new Error("synthetic adapter send failure");
    }
    this.outgoing.push(structuredClone(action));
  }

  async receive(): Promise<BuyerTurn | null> {
    return this.turns.shift() ?? null;
  }

  async scheduleFollowup(action: SalesAction): Promise<void> {
    this.followups.push(structuredClone(action));
  }

  async close(): Promise<void> {}
}
