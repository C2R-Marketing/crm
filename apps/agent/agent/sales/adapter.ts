export type BuyerTurn =
  | { kind: "objection"; text: string }
  | { kind: "accept"; text: string }
  | { kind: "decline"; text: string }
  | { kind: "opt-out"; text: string };

export interface SalesAction {
  kind: "pitch" | "objection-response" | "cta" | "follow-up" | "handoff";
  text: string;
  claimIds: string[];
  external: boolean;
}

export interface SalesChannelAdapter {
  readonly external: boolean;
  send(action: SalesAction): Promise<void>;
  receive(): Promise<BuyerTurn | null>;
  scheduleFollowup(action: SalesAction): Promise<void>;
  close(): Promise<void>;
}
