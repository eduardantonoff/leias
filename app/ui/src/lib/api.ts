import type { SessionPayload, StreamEvent } from "@/types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function createSession(): Promise<{ session_id: string; user_id: string }> {
  const response = await fetch("/api/session", { method: "POST" });
  if (!response.ok) {
    throw new ApiError("Failed to create session", response.status);
  }
  return response.json();
}

export async function fetchSession(sessionId: string): Promise<SessionPayload> {
  const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    throw new ApiError("Failed to load session", response.status);
  }
  return response.json();
}

export async function* streamChat(
  sessionId: string,
  message: string,
): AsyncGenerator<StreamEvent, void, undefined> {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      message,
    }),
  });

  if (!response.ok || !response.body) {
    throw new ApiError("Failed to start chat stream", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      yield JSON.parse(trimmed) as StreamEvent;
    }
  }

  if (buffer.trim()) {
    yield JSON.parse(buffer.trim()) as StreamEvent;
  }
}
