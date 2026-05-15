import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

const CHAT_TOP_PADDING = 24;

interface UseScrollManagerOptions {
  lockTraceId: string | null;
  isLoading: boolean;
  hasStreamingStarted: boolean;
  messagesLength: number;
}

interface UseScrollManagerReturn {
  containerRef: RefObject<HTMLDivElement>;
  spacerHeight: number;
  setFocusMsgId: Dispatch<SetStateAction<string | null>>;
  smoothScrollMessageToTopById: (id: string) => boolean;
  isHistoryReady: boolean;
  setIsHistoryReady: Dispatch<SetStateAction<boolean>>;
}

export function useScrollManager({
  lockTraceId,
  isLoading,
  hasStreamingStarted,
  messagesLength,
}: UseScrollManagerOptions): UseScrollManagerReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [focusMsgId, setFocusMsgId] = useState<string | null>(null);
  const [isHistoryReady, setIsHistoryReady] = useState(true);

  const scrollMessageToTopById = useCallback((id: string) => {
    const container = containerRef.current;
    if (!container) return false;

    const element = container.querySelector(`[data-mid='${id}']`) as HTMLElement | null;
    if (!element) return false;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    container.scrollTop += elementRect.top - containerRect.top - CHAT_TOP_PADDING;
    return true;
  }, []);

  const smoothScrollMessageToTopById = useCallback((id: string) => {
    const container = containerRef.current;
    if (!container) return false;

    const element = container.querySelector(`[data-mid='${id}']`) as HTMLElement | null;
    if (!element) return false;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const nextTop = container.scrollTop + elementRect.top - containerRect.top - CHAT_TOP_PADDING;
    container.scrollTo({ top: nextTop, behavior: "smooth" });
    return true;
  }, []);

  useEffect(() => {
    if (!focusMsgId) return;
    const timeout = window.setTimeout(() => {
      scrollMessageToTopById(focusMsgId);
      setFocusMsgId(null);
      setIsHistoryReady(true);
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [focusMsgId, scrollMessageToTopById]);

  const recomputeSpacer = useCallback(() => {
    if (!lockTraceId) {
      setSpacerHeight(0);
      return;
    }

    const container = containerRef.current;
    if (!container) {
      setSpacerHeight(0);
      return;
    }

    const isThinking = isLoading && !hasStreamingStarted;
    const assistantSelector = isThinking
      ? `[data-thinking='${lockTraceId}'] > :first-child`
      : `[data-mid='${lockTraceId}'] > :first-child`;
    const assistantElement = container.querySelector(assistantSelector) as HTMLElement | null;

    let userElement = container.querySelector(`[data-mid='${lockTraceId}-user']`) as HTMLElement | null;
    if (!userElement) {
      const assistantWrap = container.querySelector(
        isThinking
          ? `[data-thinking='${lockTraceId}']`
          : `[data-mid='${lockTraceId}']`,
      ) as HTMLElement | null;
      if (assistantWrap?.previousElementSibling instanceof HTMLElement) {
        userElement = assistantWrap.previousElementSibling;
      }
    }
    if (!userElement) {
      const userMessages = container.querySelectorAll("[data-role='user']");
      if (userMessages.length) {
        userElement = userMessages[userMessages.length - 1] as HTMLElement;
      }
    }

    const assistantHeight = assistantElement?.getBoundingClientRect().height ?? 0;
    const userHeight = userElement?.getBoundingClientRect().height ?? 0;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const availableHeight = viewportHeight - container.getBoundingClientRect().top;

    setSpacerHeight(
      Math.max(0, availableHeight - CHAT_TOP_PADDING - userHeight - assistantHeight),
    );
  }, [hasStreamingStarted, isLoading, lockTraceId]);

  useEffect(() => {
    recomputeSpacer();
  }, [recomputeSpacer, isLoading, messagesLength, hasStreamingStarted]);

  useEffect(() => {
    const onResize = recomputeSpacer;
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
  }, [recomputeSpacer]);

  useEffect(() => {
    if (!containerRef.current || !lockTraceId || typeof ResizeObserver === "undefined") {
      return;
    }

    const selector =
      isLoading && !hasStreamingStarted
        ? `[data-thinking='${lockTraceId}'] > :first-child`
        : `[data-mid='${lockTraceId}'] > :first-child`;
    const element = containerRef.current.querySelector(selector) as HTMLElement | null;
    if (!element) return;

    const observer = new ResizeObserver(recomputeSpacer);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasStreamingStarted, isLoading, lockTraceId, recomputeSpacer]);

  return {
    containerRef,
    spacerHeight,
    setFocusMsgId,
    smoothScrollMessageToTopById,
    isHistoryReady,
    setIsHistoryReady,
  };
}
