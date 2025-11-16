// src/lib/swarm-core/types.ts

export type Hex0x = `0x${string}`;

export type NameDoc = {
  v?: number;
  owner?: Hex0x;   // platform signer (feed owner)
  subject?: Hex0x; // user
  name?: string;
};

export type AvatarDoc = {
  v?: number;
  owner?: Hex0x;
  subject?: Hex0x;
  imageRef?: string; // 64-hex /bzz reference
};

// API payloads
export type NamePayload   = { name: string;    subject: Hex0x };
export type AvatarPayload = { imageRef: string; subject: Hex0x };

// API responses
export type ApiOk  = { ok: true; owner: Hex0x; subject?: Hex0x; user?: Hex0x };
export type ApiErr = { ok: false; error: string };
