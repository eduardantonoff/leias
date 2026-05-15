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
  concepts?: Array<{
    id: string;
    title?: string;
    summary?: string;
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

export interface PlanProgress {
  completed: boolean;
  completed_checkpoints: number[];
}

export interface Message {
  content: string;
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
  active_plan_progress?: PlanProgress | null;
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

export interface StreamDoneEvent {
  type: "done";
  reply: string;
  actions?: Array<"retrieved" | "planned" | "plan_updated" | "plan_completed">;
  active_topic_id?: string | null;
  active_topic_title?: string | null;
  active_topic?: RetrievalTopic | null;
  active_plan?: Plan | null;
  active_plan_progress?: PlanProgress | null;
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
  | StreamAssistantTextEvent
  | StreamDoneEvent
  | StreamErrorEvent;

export interface GraphEvidence {
  page?: number | null;
  section?: string | null;
  excerpt: string;
}

export interface GraphDocument {
  id: string;
  title: string;
  source_type: string;
  domain: string;
  overview: string;
}

export interface GraphTopic {
  id: string;
  title: string;
  summary: string;
  context: string;
}

export interface GraphTopicEdge {
  source_topic_id: string;
  target_topic_id: string;
  type: "sequence" | "prerequisite";
}

export interface GraphConcept {
  id: string;
  topic_id: string;
  title: string;
  summary: string;
  context: string;
  prerequisite_ids: string[];
  evidence: GraphEvidence[];
  media?: Resource[];
}

export interface GraphKnowledgeSpace {
  document?: GraphDocument | null;
  topics: GraphTopic[];
  topic_edges: GraphTopicEdge[];
  concepts: GraphConcept[];
}

export interface GraphLogEvent {
  type: "log";
  message: string;
}

export interface GraphOverviewCreatedEvent {
  type: "overview.created";
  payload: GraphDocument;
}

export interface GraphTopicCreatedEvent {
  type: "topic.created";
  step: number;
  payload: GraphTopic;
}

export interface GraphConceptCreatedEvent {
  type: "concept.created";
  topic_id: string;
  payload: GraphConcept;
}

export interface GraphCompletedEvent {
  type: "graph.completed";
  topic_count: number;
  concept_count: number;
  stop_reason: string;
}

export interface GraphErrorEvent {
  type: "error";
  message: string;
}

export type GraphStreamEvent =
  | GraphLogEvent
  | GraphOverviewCreatedEvent
  | GraphTopicCreatedEvent
  | GraphConceptCreatedEvent
  | GraphCompletedEvent
  | GraphErrorEvent;
