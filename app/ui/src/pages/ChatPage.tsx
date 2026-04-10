import { ArrowDown } from "lucide-react";
import { clsx } from "clsx";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChatInput } from "@/components/ChatInput";
import { PreviewMessage, ThinkingMessage } from "@/components/ChatMessage";
import { QuickReplies } from "@/components/QuickReplies";
import { Overview } from "@/components/WelcomeOverview";
import { SessionSidebar, buildRetrievalTopics } from "@/components/SessionSidebar";
import { useScrollManager } from "@/hooks/useScrollManager";
import { ApiError, createSession, fetchSession, streamChat } from "@/lib/api";
import type {
  LogMessage,
  Message,
  Plan,
  PlanContext,
  RetrievalTopic,
  StreamEvent,
} from "@/types";

const SESSION_STORAGE_KEY = "stem-tutor-chat-session-id";
const LATEST_MESSAGE_VISIBILITY_MARGIN = 16;
const JUMP_ANCHOR_TARGET_OFFSET = 12;
const JUMP_VISIBILITY_TOLERANCE = 32;
const JUMP_BUTTON_MIN_BOTTOM = 16;
const JUMP_BUTTON_STACK_GAP = 12;
const JUMP_BUTTON_DEFAULT_BOTTOM = 88;

const extractQuickRepliesPayload = (content: string): string | null => {
  const patterns = [
    /<quick-replies>([\s\S]+?)<\/quick-replies>/i,
    /\[quick-replies\]([\s\S]+?)\[\/quick-replies\]/i,
    /<quick-replies>([\s\S]+)$/i,
    /\[quick-replies\]([\s\S]+)$/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
};

const buildLog = (source: string, counter: number, message: string): LogMessage => ({
  id: `${source}-${counter}-${Date.now()}`,
  source,
  counter,
  message,
  timestamp: new Date(),
});

const buildPlanContext = (plan: Plan | null | undefined): PlanContext | undefined =>
  plan
    ? {
        plan,
        completed: false,
        completed_checkpoints: [],
        creation_message: "Learning plan created",
      }
    : undefined;

export function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStreamingStarted, setHasStreamingStarted] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<LogMessage[]>([]);
  const [currentAgent, setCurrentAgent] = useState("Assistant");
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [jumpButtonBottomPx, setJumpButtonBottomPx] = useState(JUMP_BUTTON_DEFAULT_BOTTOM);
  const [activeTopic, setActiveTopic] = useState<RetrievalTopic | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [lockTraceId, setLockTraceId] = useState<string | null>(null);

  const currentAssistantIdRef = useRef<string | null>(null);
  const logCounterRef = useRef(0);
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const quickRepliesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  const {
    containerRef,
    spacerHeight,
    setFocusMsgId,
    smoothScrollMessageToTopById,
  } = useScrollManager({
    lockTraceId,
    isLoading,
    hasStreamingStarted,
    messagesLength: messages.length,
  });

  const latestPlanContext = useMemo(() => buildPlanContext(activePlan) ?? null, [activePlan]);
  const retrievalTopics = useMemo(() => buildRetrievalTopics(activeTopic), [activeTopic]);
  const isToolCallActive = isLoading && currentLogs.some((log) => /\bcalled\b.+\btool\b/i.test(log.message));

  const latestTurn = useMemo(() => {
    const latestVisible = [...messages].reverse().find((msg) => msg.role === "assistant" || msg.role === "user");
    if (!latestVisible?.id) {
      return { anchorId: null, messageId: null };
    }
    const anchorId =
      latestVisible.role === "assistant" && !latestVisible.id.endsWith("-user")
        ? `${latestVisible.id}-user`
        : latestVisible.id;
    return { anchorId, messageId: latestVisible.id };
  }, [messages]);

  const syncAssistantMessage = useCallback((updater: (message: Message) => Message) => {
    const assistantId = currentAssistantIdRef.current;
    if (!assistantId) return;
    setMessages((prev) =>
      prev.map((message) => (message.id === assistantId ? updater(message) : message)),
    );
  }, []);

  const appendLog = useCallback(
    (source: string, message: string) => {
      logCounterRef.current += 1;
      const log = buildLog(source, logCounterRef.current, message);
      setCurrentLogs((prev) => {
        const next = [...prev, log];
        syncAssistantMessage((assistantMessage) => ({
          ...assistantMessage,
          logs: next,
          source,
        }));
        return next;
      });
    },
    [syncAssistantMessage],
  );

  useEffect(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!lastAssistant?.content || isLoading) {
      setQuickReplies([]);
      return;
    }

    const payload = extractQuickRepliesPayload(lastAssistant.content);
    if (!payload) {
      setQuickReplies([]);
      return;
    }

    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        setQuickReplies(parsed.slice(0, 3));
        return;
      }
    } catch {
      const options = payload
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 3);
      setQuickReplies(options);
      return;
    }

    setQuickReplies([]);
  }, [messages, isLoading]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const createAndStoreSession = async () => {
        const session = await createSession();
        window.localStorage.setItem(SESSION_STORAGE_KEY, session.session_id);
        return session.session_id;
      };

      let nextSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!nextSessionId) {
        nextSessionId = await createAndStoreSession();
      }

      let session;
      try {
        session = await fetchSession(nextSessionId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          nextSessionId = await createAndStoreSession();
          session = await fetchSession(nextSessionId);
        } else {
          throw error;
        }
      }

      if (cancelled) return;

      setSessionId(session.session_id);
      setActiveTopic(session.active_topic ?? null);
      setActivePlan(session.active_plan ?? null);
      setMessages(
        session.messages.map((message, index) => ({
          id: `history-${index}`,
          role: message.role,
          content: message.text,
        })),
      );
    };

    void boot().catch((error) => {
      console.error(error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const jumpToLatest = useCallback(() => {
    if (!latestTurn.anchorId) return;

    if (latestTurn.anchorId.endsWith("-user")) {
      const traceId = latestTurn.anchorId.slice(0, -5);
      const scrolledToUser = smoothScrollMessageToTopById(`${traceId}-user`);
      if (!scrolledToUser) {
        smoothScrollMessageToTopById(traceId);
      }
      return;
    }

    smoothScrollMessageToTopById(latestTurn.anchorId);
  }, [latestTurn.anchorId, smoothScrollMessageToTopById]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateJumpVisibility = () => {
      if (!latestTurn.anchorId || !latestTurn.messageId) {
        setShowJumpToLatest(false);
        return;
      }

      const latestMessage = container.querySelector(
        `[data-mid='${latestTurn.messageId}']`,
      ) as HTMLElement | null;
      if (latestMessage) {
        const containerRect = container.getBoundingClientRect();
        const messageRect = latestMessage.getBoundingClientRect();
        const isLatestVisible =
          messageRect.bottom > containerRect.top + LATEST_MESSAGE_VISIBILITY_MARGIN &&
          messageRect.top < containerRect.bottom - LATEST_MESSAGE_VISIBILITY_MARGIN;

        if (isLatestVisible) {
          setShowJumpToLatest(false);
          return;
        }
      }

      const anchor = container.querySelector(`[data-mid='${latestTurn.anchorId}']`) as HTMLElement | null;
      if (!anchor) {
        setShowJumpToLatest(false);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const offsetFromTop = anchorRect.top - containerRect.top;
      setShowJumpToLatest(
        Math.abs(offsetFromTop - JUMP_ANCHOR_TARGET_OFFSET) > JUMP_VISIBILITY_TOLERANCE,
      );
    };

    updateJumpVisibility();
    container.addEventListener("scroll", updateJumpVisibility);
    return () => container.removeEventListener("scroll", updateJumpVisibility);
  }, [latestTurn.anchorId, latestTurn.messageId, messages.length]);

  useLayoutEffect(() => {
    const content = contentAreaRef.current;
    const composer = composerRef.current;
    if (!content || !composer) return;

    const computeBottomOffset = () => {
      const contentRect = content.getBoundingClientRect();
      const composerRect = composer.getBoundingClientRect();
      const quickRepliesContent = quickRepliesRef.current?.firstElementChild as HTMLElement | null;
      const quickRepliesRect = quickRepliesContent?.getBoundingClientRect() || null;
      const stackTop = quickRepliesRect?.top ?? composerRect.top;
      const bottomOffset = Math.max(
        JUMP_BUTTON_MIN_BOTTOM,
        Math.round(contentRect.bottom - stackTop + JUMP_BUTTON_STACK_GAP),
      );
      setJumpButtonBottomPx((prev) => (prev === bottomOffset ? prev : bottomOffset));
    };

    computeBottomOffset();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(computeBottomOffset) : null;

    resizeObserver?.observe(content);
    resizeObserver?.observe(composer);
    if (quickRepliesRef.current) resizeObserver?.observe(quickRepliesRef.current);

    window.addEventListener("resize", computeBottomOffset);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", computeBottomOffset);
    };
  }, [quickReplies.length, messages.length]);

  const applyStreamEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case "status":
          if (event.author === "Retriever" || event.author === "Planner") {
            setCurrentAgent(event.author);
          }
          return;

        case "tool_call":
          if (event.name === "Retriever" || event.name === "Planner") {
            setCurrentAgent(event.name);
          }
          appendLog(event.agent || currentAgent, `Called ${event.name} tool`);
          return;

        case "tool_result":
          appendLog(event.agent || currentAgent, `Completed ${event.name} tool`);
          if (event.name === "Retriever" && event.payload && typeof event.payload === "object") {
            setActiveTopic(event.payload as RetrievalTopic);
          }
          if (event.name === "Planner" && event.payload && typeof event.payload === "object") {
            setActivePlan(event.payload as Plan);
          }
          return;

        case "assistant_text": {
          setCurrentAgent("Assistant");
          setHasStreamingStarted(true);
          const assistantId = currentAssistantIdRef.current;
          if (!assistantId) return;

          setMessages((prev) => {
            const existingIndex = prev.findIndex((message) => message.id === assistantId);
            const nextMessage: Message = {
              id: assistantId,
              role: "assistant",
              content: event.text,
              logs: currentLogs,
              source: currentAgent,
            };

            if (existingIndex === -1) {
              return [...prev, nextMessage];
            }

            return prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: event.text,
                    logs: currentLogs,
                    source: currentAgent,
                  }
                : message,
            );
          });
          return;
        }

        case "assistant_thought": {
          // Thought chunks are intentionally hidden from the main chat UI.
          // Do not mark visible streaming as started until assistant text arrives.
          return;
        }

        case "done": {
          setActiveTopic(event.active_topic ?? null);
          setActivePlan(event.active_plan ?? null);
          const assistantId = currentAssistantIdRef.current;
          if (assistantId) {
            setMessages((prev) => {
              const existingIndex = prev.findIndex((message) => message.id === assistantId);
              const retrievalResult = event.active_topic
                ? { tool: "Retriever", result: event.active_topic }
                : undefined;
              const planContext = buildPlanContext(event.active_plan);

              if (existingIndex === -1) {
                return [
                  ...prev,
                  {
                    id: assistantId,
                    role: "assistant",
                    content: event.reply || "",
                    thoughtContent: event.thought || undefined,
                    logs: currentLogs,
                    source: currentAgent,
                    retrievalResult,
                    planContext,
                  },
                ];
              }

              return prev.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: event.reply || message.content,
                      thoughtContent: event.thought || message.thoughtContent,
                      logs: currentLogs,
                      source: currentAgent,
                      retrievalResult: retrievalResult ?? message.retrievalResult,
                      planContext: planContext ?? message.planContext,
                    }
                  : message,
              );
            });
          }
          setIsLoading(false);
          setHasStreamingStarted(false);
          setCurrentLogs([]);
          currentAssistantIdRef.current = null;
          return;
        }

        case "error": {
          const assistantId = currentAssistantIdRef.current ?? crypto.randomUUID();
          currentAssistantIdRef.current = assistantId;
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: "assistant",
              content: event.message,
              source: "Assistant",
            },
          ]);
          setIsLoading(false);
          setHasStreamingStarted(false);
          setCurrentLogs([]);
        }
      }
    },
    [appendLog, currentAgent, currentLogs],
  );

  const handleSubmit = useCallback(
    async (text?: string) => {
      const messageText = (text ?? question).trim();
      if (!messageText || !sessionId || isLoading) return;

      const traceId = crypto.randomUUID();
      currentAssistantIdRef.current = traceId;
      logCounterRef.current = 0;
      setLockTraceId(traceId);
      setIsLoading(true);
      setHasStreamingStarted(false);
      setCurrentLogs([]);
      setCurrentAgent("Assistant");
      setQuickReplies([]);
      setMessages((prev) => [
        ...prev,
        {
          id: `${traceId}-user`,
          role: "user",
          content: messageText,
        },
      ]);
      setFocusMsgId(`${traceId}-user`);
      setQuestion("");

      try {
        for await (const event of streamChat(sessionId, messageText)) {
          applyStreamEvent(event);
        }
      } catch (error) {
        applyStreamEvent({
          type: "error",
          message: error instanceof Error ? error.message : "Chat request failed",
        });
      }
    },
    [applyStreamEvent, isLoading, question, sessionId],
  );

  return (
    <div className="flex h-dvh min-w-0 app-shell">
      <SessionSidebar planContext={latestPlanContext} retrievalTopics={retrievalTopics} />

      <div ref={contentAreaRef} className="relative flex h-full min-w-0 flex-1 flex-col transition-all duration-300">
        {messages.length > 0 && <div className="pt-4 md:pt-6" />}

        <div
          ref={containerRef}
          data-chat-container
          className={clsx(
            "hide-scrollbar flex min-w-0 flex-1 flex-col overflow-y-auto transition-opacity duration-100",
            messages.length > 0 && "chat-fade-edges gap-6 pt-4 pb-8",
          )}
          style={{ scrollBehavior: "auto" }}
        >
          {messages.length === 0 ? (
            <Overview />
          ) : (
            <>
              {messages.map((message) => {
                const isStreaming = message.id === currentAssistantIdRef.current && hasStreamingStarted;
                const isNewMessage =
                  message.id === currentAssistantIdRef.current ||
                  message.id === `${currentAssistantIdRef.current}-user`;

                return (
                  <div key={message.id} data-mid={message.id}>
                    <PreviewMessage
                      message={message}
                      source={message.source}
                      logs={message.logs || []}
                      isStreaming={isStreaming}
                      isToolCallActive={isStreaming && isToolCallActive}
                      isNew={isNewMessage}
                      activeSource={isStreaming ? currentAgent : undefined}
                    />
                    {lockTraceId &&
                      message.id === lockTraceId &&
                      (isStreaming || !isLoading) && (
                        <div aria-hidden style={{ height: spacerHeight }} />
                      )}
                  </div>
                );
              })}

              {isLoading && !hasStreamingStarted && (
                <div data-thinking={currentAssistantIdRef.current || undefined}>
                  <ThinkingMessage
                    logs={currentLogs}
                    source={currentAgent}
                  />
                  {lockTraceId && <div aria-hidden style={{ height: spacerHeight }} />}
                </div>
              )}
            </>
          )}
        </div>

        {quickReplies.length > 0 && (
          <div ref={quickRepliesRef} className="mx-auto w-full px-4 pt-2 md:max-w-3xl">
            <QuickReplies options={quickReplies} onSelect={handleSubmit} disabled={isLoading} />
          </div>
        )}

        {showJumpToLatest && (
          <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: `${jumpButtonBottomPx}px` }}>
            <div className="mx-auto flex w-full justify-end px-4 md:max-w-3xl">
              <button
                type="button"
                onClick={jumpToLatest}
                title="Jump to latest message"
                className={clsx(
                  "pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card/95 text-ink-soft shadow-sm transition-colors",
                  "hover:border-border hover:bg-card/95",
                )}
              >
                <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}

        <div ref={composerRef} className="mx-auto flex w-full gap-2 bg-transparent px-4 pt-3 pb-4 md:max-w-3xl md:pb-6">
          <ChatInput
            question={question}
            setQuestion={setQuestion}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
