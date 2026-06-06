/**
 * lib/export/prefs.ts
 * Cookie-based persistence for export preferences.
 * Uses a single JSON cookie per user so preferences survive page reloads and browser sessions.
 */
import type { ExportPrefs } from "./types";

const COOKIE_NAME_PREFIX = "millog_export_prefs_";
/** 1 year in seconds */
const MAX_AGE = 60 * 60 * 24 * 365;

function cookieName(userId: string): string {
  return COOKIE_NAME_PREFIX + userId.slice(0, 8);
}

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)};max-age=${maxAge};path=/;SameSite=Strict`;
}

function getCookie(name: string): string | null {
  const prefix = encodeURIComponent(name) + "=";
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function saveExportPrefs(userId: string, prefs: ExportPrefs): void {
  try {
    setCookie(cookieName(userId), JSON.stringify(prefs), MAX_AGE);
  } catch {
    // Silently ignore — cookie might be blocked
  }
}

export function loadExportPrefs(userId: string): Partial<ExportPrefs> | null {
  try {
    const raw = getCookie(cookieName(userId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ExportPrefs>;
  } catch {
    return null;
  }
}
