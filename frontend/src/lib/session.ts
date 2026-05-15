export const SESSION_STORAGE_KEY = "stem-tutor-chat-session-id";

export function readStoredSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(SESSION_STORAGE_KEY);
}

export function writeStoredSessionId(sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

export function clearStoredSessionId(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
