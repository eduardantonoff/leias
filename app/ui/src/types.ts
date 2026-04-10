export interface LogMessage {
  id: string;
  source: string;
  counter: number;
  message: string;
  timestamp: Date;
}

export interface RetrievalTopic {
  id: string;
  title?: string;
  summary?: string;
  objectives?: string[];
  materials?: Array<{
    id: string;
    source_title?: string;
    page?: number;
    excerpt?: string;
  }>;
}

export interface RetrievalResult {
  tool: string;
  result: RetrievalTopic;
}

export interface Resource {
  type: "IMAGE" | "IFRAME";
  url: string;
  caption: string;
  placement: string;
}

export interface KeyPoint {
  idea: string;
  approach: string;
  prior_knowledge?: string | null;
}

export interface Checkpoint {
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SCENARIO";
  target_skill: string;
  key_point_indices: number[];
  pass_criteria: string;
}

export interface Strategy {
  intent: string;
  emphasis: string;
  out_of_scope: string[];
}

export interface Plan {
  topic: string;
  topic_id: string;
  title: string;
  strategy: Strategy;
  description: string;
  learning_objective: string;
  item_ids: string[];
  key_points: KeyPoint[];
  checkpoints: Checkpoint[];
  completion_criteria: string;
  resources: Resource[];
  next_topic_ids: string[];
}

export interface PlanContext {
  plan: Plan | null;
  completed: boolean;
  completed_checkpoints: number[];
  creation_message?: string;
  update_message?: string;
  completion_message?: string;
}

export interface Message {
  content: string;
  thoughtContent?: string;
  role: "user" | "assistant";
  id: string;
  retrievalResult?: RetrievalResult;
  planContext?: PlanContext;
  logs?: LogMessage[];
  source?: string;
}

export interface SessionMessage {
  role: "user" | "assistant";
  text: string;
}

export interface SessionPayload {
  session_id: string;
  user_id: string;
  active_topic_id?: string | null;
  active_topic_title?: string | null;
  active_topic?: RetrievalTopic | null;
  active_plan?: Plan | null;
  messages: SessionMessage[];
}

export interface StreamStatusEvent {
  type: "status";
  author: string;
  message: string;
}

export interface StreamToolCallEvent {
  type: "tool_call";
  agent?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface StreamToolResultEvent {
  type: "tool_result";
  agent?: string;
  name: string;
  summary: string;
  payload?: unknown;
}

export interface StreamAssistantTextEvent {
  type: "assistant_text";
  text: string;
  final: boolean;
}

export interface StreamAssistantThoughtEvent {
  type: "assistant_thought";
  text: string;
  final: boolean;
}

export interface StreamDoneEvent {
  type: "done";
  reply: string;
  thought?: string;
  active_topic_id?: string | null;
  active_topic_title?: string | null;
  active_topic?: RetrievalTopic | null;
  active_plan?: Plan | null;
  session_id: string;
}

export interface StreamErrorEvent {
  type: "error";
  message: string;
}

export type StreamEvent =
  | StreamStatusEvent
  | StreamToolCallEvent
  | StreamToolResultEvent
  | StreamAssistantThoughtEvent
  | StreamAssistantTextEvent
  | StreamDoneEvent
  | StreamErrorEvent;
