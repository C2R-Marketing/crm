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

export interface SalesAdapterIdentity {
  provider: string;
  model: string;
  tool: string;
  identityStatus: "VERIFIED" | "UNVERIFIED";
}

export interface SalesChannelAdapter {
  readonly external: boolean;
  readonly identity: SalesAdapterIdentity;
  send(action: SalesAction): Promise<void>;
  receive(): Promise<BuyerTurn | null>;
  scheduleFollowup(action: SalesAction): Promise<void>;
  close(): Promise<void>;
}
