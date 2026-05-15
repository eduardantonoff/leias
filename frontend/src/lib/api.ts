import type {
  GraphKnowledgeSpace,
  GraphStreamEvent,
  SessionPayload,
  StreamEvent,
} from "@/types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function* readJsonLines<T>(
  response: Response,
  errorMessage: string,
): AsyncGenerator<T, void, undefined> {
  if (!response.ok || !response.body) {
    throw new ApiError(errorMessage, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) yield JSON.parse(trimmed) as T;
    }
  }

  const trimmed = buffer.trim();
  if (trimmed) yield JSON.parse(trimmed) as T;
}

export async function createSession(
  knowledgeSpace?: GraphKnowledgeSpace,
): Promise<{ session_id: string; user_id: string }> {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: knowledgeSpace
      ? JSON.stringify({ knowledge_space: knowledgeSpace })
      : undefined,
  });
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

export async function fetchSampleGraph(): Promise<GraphKnowledgeSpace> {
  const response = await fetch("/static/graphs/machine-learning-foundations.json");
  if (!response.ok) {
    throw new ApiError("Failed to load sample graph", response.status);
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

  for await (const event of readJsonLines<StreamEvent>(
    response,
    "Failed to start chat stream",
  )) {
    yield event;
  }
}

export async function* streamGraphBuild(
  file: File,
  options: {
    signal?: AbortSignal;
    userIntent?: string;
  } = {},
): AsyncGenerator<GraphStreamEvent, void, undefined> {
  const formData = new FormData();
  formData.append("file", file);
  if (options.userIntent?.trim()) {
    formData.append("user_intent", options.userIntent.trim());
  }

  const response = await fetch("/api/graph/build", {
    method: "POST",
    body: formData,
    signal: options.signal,
  });

  for await (const event of readJsonLines<GraphStreamEvent>(
    response,
    "Failed to start graph build",
  )) {
    yield event;
  }
}
