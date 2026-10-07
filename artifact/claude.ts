/**
 * Minimal typings for the claude.ai artifact runtime (`window.claude`).
 * The authoritative definitions are served by the platform; these cover only
 * what Comper calls.
 */

export interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}

export interface QuerySnapshot {
  docs: DocSnapshot[];
  size: number;
  empty: boolean;
}

export interface DbError {
  code: string;
  message: string;
}

export interface DocRef {
  id: string;
  path: string;
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: DbError) => void): () => void;
  collection(path: string): CollectionRef;
}

export interface CollectionRef {
  path: string;
  doc(id?: string): DocRef;
  get(): Promise<QuerySnapshot>;
  onSnapshot(next: (snap: QuerySnapshot) => void, error?: (e: DbError) => void): () => void;
}

export interface Db {
  doc(path: string): DocRef;
  collection(path: string): CollectionRef;
}

export interface UserNs {
  id(): Promise<string | null>;
}

export interface McpError {
  code: string;
  message: string;
  server?: string;
  retryable?: boolean;
  retryAfterMs?: number;
}

export interface McpNs {
  callTool(
    server: string,
    tool: string,
    input?: unknown,
    options?: { cache?: false | { staleTime?: number; refresh?: boolean }; signal?: AbortSignal },
  ): Promise<{ content: unknown[]; payload?: unknown }>;
}

export type PermissionState = "granted" | "prompt" | "denied" | "unavailable";

export interface PermissionsNs {
  state(name: string): Promise<PermissionState>;
  request(names?: readonly string[]): Promise<Record<string, PermissionState>>;
  manage(): Promise<void>;
}

interface CapabilityMap {
  db: Db;
  user: UserNs;
  mcp: McpNs;
  permissions: PermissionsNs;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

/** `claude.use(name)`, or null when this view can't run the capability (or isn't inside Claude at all). */
export async function capability<K extends keyof CapabilityMap>(name: K): Promise<CapabilityMap[K] | null> {
  try {
    return ((await window.claude?.use(name)) as CapabilityMap[K] | null | undefined) ?? null;
  } catch {
    return null;
  }
}

/** The connector Comper reads feeds through, by its claude.ai display name. */
export const FETCH_CONNECTOR = "Parallel Search";
export const FETCH_TOOL = "web_fetch";
