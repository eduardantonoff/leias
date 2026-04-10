import { FC, memo, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Markdown } from './MarkdownRenderer';
import type { LogMessage, Message, PlanContext, RetrievalResult } from '@/types';

// --- Motion configs & shared styles ---
const messageAnimation = {
  initial: { y: 5, opacity: 0 },
  animate: { y: 0, opacity: 1 },
};

const messageContainerClass = 'w-full mx-auto px-4 md:max-w-3xl group/message';
const messageWrapperClass  = 'flex gap-4 rounded-xl w-full';
const logChipClass = 'inline-flex h-5 items-center gap-1 rounded-full border border-border/70 bg-transparent px-2 py-0.5 text-[10px] leading-none text-muted-foreground';

const pluralEn = (n: number, singular: string, plural: string) =>
  n === 1 ? singular : plural;

// --- MessageLogs ---
interface MessageLogsProps {
  logs: LogMessage[];
  isThinking?: boolean;
  source?: string;
  retrievalResult?: RetrievalResult;
  planContext?: PlanContext;
}

const MessageLogs: FC<MessageLogsProps> = memo(
  ({ logs, isThinking = false, source = 'Assistant', retrievalResult, planContext }) => {
    const [dotCount, setDotCount] = useState(0);

    useEffect(() => {
      if (!isThinking) return;
      const interval = setInterval(() => {
        setDotCount((count) => (count === 3 ? 0 : count + 1));
      }, 500);
      return () => clearInterval(interval);
    }, [isThinking]);

    const dotString = dotCount > 0 ? '.'.repeat(dotCount) : '';

    /* elapsed time */
    const timeTakenSeconds =
      !isThinking && logs.length >= 2
        ? (logs[logs.length - 1].timestamp.getTime() -
           logs[0].timestamp.getTime()) / 1000
        : undefined;

    const agentVerb =
      {
        Planner: 'Planning',
        Retriever: 'Retrieving',
        Assistant: 'Thinking',
      }[source || 'Assistant'] || 'Thinking';

    const toolCallCount = logs.reduce(
      (count, log) => (/\bcalled\b.+\btool\b/i.test(log.message) ? count + 1 : count),
      0
    );

    return (
      <div className="w-full mt-2">
        {/* status and inline retrieval/plan indicators */}
        <div className="flex items-center gap-2 flex-wrap">
          {isThinking && (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-muted-foreground">
                {`${agentVerb}${dotString}`}
              </span>
              {toolCallCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {`${toolCallCount} ${pluralEn(toolCallCount, 'tool', 'tools')}`}
                </span>
              )}
            </div>
          )}

          {!isThinking && timeTakenSeconds != null && (
            <div className={logChipClass}>
              <span>{timeTakenSeconds.toFixed(1)} s</span>
            </div>
          )}

          {!isThinking && toolCallCount > 0 && (
            <div className={logChipClass}>
              <span>{`${toolCallCount} ${pluralEn(toolCallCount, 'tool', 'tools')}`}</span>
            </div>
          )}

          {/* Inline retrieval result indicator */}
          {retrievalResult && (
            <div className={logChipClass}>
              <span className="text-[10px]">Knowledge retrieved</span>
            </div>
          )}

          {/* Inline plan context indicator */}
          {planContext && (
            <div className={logChipClass}>
              <span className="text-[10px]">
                {(() => {
                  if (planContext.completion_message) return planContext.completion_message;
                  if (planContext.creation_message) return 'Learning plan created';
                  if (planContext.update_message) {
                    return 'Plan updated';
                  }
                  return 'Learning plan created';
                })()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
);
MessageLogs.displayName = 'MessageLogs';

// --- PreviewMessage ---
interface PreviewMessageProps {
  message: Message;
  logs?: LogMessage[];
  source?: string;
  isStreaming?: boolean;
  isToolCallActive?: boolean;
  isNew?: boolean;
  activeSource?: string;
}

export const PreviewMessage: FC<PreviewMessageProps> = memo(
  ({ message, logs = [], source, isStreaming = false, isToolCallActive = false, isNew = false, activeSource }) => {
    const isUserMessage = message.role === 'user';
    const shouldEnableCollapse = useMemo(() => {
      if (!isUserMessage || !message.content) return false;
      const text = message.content.trim();
      const newlineCount = (text.match(/\n/g) || []).length;
      return text.length > 120 || newlineCount >= 3;
    }, [isUserMessage, message.content]);
    const [isCollapsed, setIsCollapsed] = useState(shouldEnableCollapse);

    // Use live logs or fall back to persisted logs from history
    const effectiveLogs: LogMessage[] = !isUserMessage && logs.length === 0 && Array.isArray(message.logs)
      ? message.logs
      : logs;

    useEffect(() => {
      setIsCollapsed(shouldEnableCollapse);
    }, [shouldEnableCollapse, message.id]);

    return (
      <motion.div
        className={messageContainerClass}
        initial={isNew ? messageAnimation.initial : false}
        animate={messageAnimation.animate}
        transition={isNew ? { duration: 0.3, delay: 0.1 } : undefined}
        data-role={message.role}
      >
        <div
          className={cn(
            messageWrapperClass,
            isUserMessage && 'justify-end'
          )}
        >
          <div
            className={cn(
              'flex flex-col',
              isUserMessage
                ? 'bg-primary/5 dark:bg-primary/10 px-3 py-2 rounded-xl max-w-2xl w-fit'
                : 'w-full'
            )}
          >
            {message.content && (
              <div className="flex flex-col gap-2 text-left text-sm leading-[1.58] font-[350]">
                <div
                  onClick={isUserMessage && shouldEnableCollapse ? () => setIsCollapsed((prev) => !prev) : undefined}
                  className={cn(
                    isUserMessage && shouldEnableCollapse && 'cursor-pointer'
                  )}
                >
                  {isUserMessage && shouldEnableCollapse && isCollapsed ? (
                    <p className="line-clamp-3">{message.content}</p>
                  ) : (
                    <Markdown>{message.content}</Markdown>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isUserMessage && isStreaming && isToolCallActive && (
          <MessageLogs
            logs={effectiveLogs}
            isThinking
            source={activeSource || source}
          />
        )}

        {!isUserMessage && !isStreaming && (
          <MessageLogs
            logs={effectiveLogs}
            source={source}
            retrievalResult={message.retrievalResult}
            planContext={message.planContext}
          />
        )}
      </motion.div>
    );
  }
);
PreviewMessage.displayName = 'PreviewMessage';

// --- ThinkingMessage ---
interface ThinkingMessageProps {
  logs?: LogMessage[];
  source?: string;
}

export const ThinkingMessage: FC<ThinkingMessageProps> = memo(
  ({ logs = [], source = 'Assistant' }) => (
    <motion.div
      className={messageContainerClass}
      initial={messageAnimation.initial}
      animate={messageAnimation.animate}
      transition={{ duration: 0.3, delay: 0.2 }}
      data-role="assistant"
    >
      <div className="w-full">
        <MessageLogs logs={logs} isThinking source={source} />
      </div>
    </motion.div>
  )
);
ThinkingMessage.displayName = 'ThinkingMessage';
