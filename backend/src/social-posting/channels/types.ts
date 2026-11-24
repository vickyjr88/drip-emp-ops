/** What a channel's publish returns: the id (and link, when there is one) of the post, or why it failed and whether trying again could help. */
export type Posted = { ok: true; id: string; permalink?: string; detail?: string } | { ok: false; error: string; transient: boolean };

/** The service's own HTTP call: the answer's status and JSON, or null when the service could not be reached. Never logs the address (it can carry a token). */
export type Call = (url: string, init: RequestInit, label: string) => Promise<{ status: number; data: any } | null>;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
