/**
 * Structured logger for Millog Fleet web app.
 *
 * Levels: debug → info → warn → error
 * In development: all levels print to console with colour-coded prefixes.
 * In production: warn + error are buffered and flushed to Supabase
 * `client_logs` table every 10 s (or on page unload).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("OrgContext", "Fetched membership", { orgId, role });
 *   logger.error("AuthContext", "Sign-in failed", { email: masked, err });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
  userId?: string;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const IS_DEV = import.meta.env.DEV;
const MIN_LEVEL: LogLevel = IS_DEV ? "debug" : "warn";
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUFFER_SIZE = 50;

/* ── State ─────────────────────────────────────────────── */

let currentUserId: string | undefined;
const buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

/* ── Core ──────────────────────────────────────────────── */

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[MIN_LEVEL];
}

function createEntry(
  level: LogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
): LogEntry {
  return {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    data,
    userId: currentUserId,
  };
}

function printToConsole(entry: LogEntry) {
  const prefix = `[${entry.ts.slice(11, 23)}] [${entry.level.toUpperCase()}] [${entry.component}]`;
  const args: unknown[] = [prefix, entry.message];
  if (entry.data) args.push(entry.data);

  switch (entry.level) {
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(...args);
      break;
    case "info":
      // eslint-disable-next-line no-console
      console.info(...args);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(...args);
      break;
    case "error":
      // eslint-disable-next-line no-console
      console.error(...args);
      break;
  }
}

function enqueue(entry: LogEntry) {
  buffer.push(entry);
  if (buffer.length >= MAX_BUFFER_SIZE) {
    flush();
  }
}

async function flush() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);

  try {
    // Dynamic import so we don't create a circular dependency
    const { supabase } = await import("@/lib/supabase");
    await supabase.from("client_logs").insert(
      batch.map((e) => ({
        level: e.level,
        component: e.component,
        message: e.message,
        data: e.data ?? null,
        user_id: e.userId ?? null,
        created_at: e.ts,
      })),
    );
  } catch {
    // If flush fails, don't lose the logs — put them back
    buffer.unshift(...batch);
    // But cap the buffer to avoid memory issues
    if (buffer.length > MAX_BUFFER_SIZE * 2) {
      buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
    }
  }
}

function log(
  level: LogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
) {
  if (!shouldLog(level)) return;

  const entry = createEntry(level, component, message, data);

  // Always print in dev
  if (IS_DEV) {
    printToConsole(entry);
  }

  // Buffer warn/error for remote persistence (prod only)
  if (!IS_DEV && LEVEL_RANK[level] >= LEVEL_RANK.warn) {
    enqueue(entry);
  }
}

/* ── Public API ────────────────────────────────────────── */

export const logger = {
  /** Set userId for all subsequent log entries */
  setUser(userId: string | undefined) {
    currentUserId = userId;
  },

  debug(component: string, message: string, data?: Record<string, unknown>) {
    log("debug", component, message, data);
  },

  info(component: string, message: string, data?: Record<string, unknown>) {
    log("info", component, message, data);
  },

  warn(component: string, message: string, data?: Record<string, unknown>) {
    log("warn", component, message, data);
  },

  error(component: string, message: string, data?: Record<string, unknown>) {
    log("error", component, message, data);
  },

  /** Force-flush buffered logs (called on page unload) */
  flush,
};

/* ── Auto-flush setup ──────────────────────────────────── */

if (!IS_DEV) {
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (flushTimer) clearInterval(flushTimer);
      // Best-effort flush — sendBeacon would be better but
      // Supabase client doesn't support it natively
      flush();
    });
  }
}
