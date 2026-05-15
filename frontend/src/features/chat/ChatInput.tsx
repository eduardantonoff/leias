import { ArrowUp } from "lucide-react";
import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { clsx } from "clsx";

interface ChatInputProps {
  question: string;
  setQuestion: (question: string) => void;
  onSubmit: (text?: string) => void;
  isLoading: boolean;
  placeholder?: string;
  submitTitle?: string;
  submitLabel?: string;
  allowEmptySubmit?: boolean;
}

export const ChatInput = ({
  question,
  setQuestion,
  onSubmit,
  isLoading,
  placeholder = "Ask a question",
  submitTitle = "Send message",
  submitLabel,
  allowEmptySubmit = false,
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const computed = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const baseHeight = Math.ceil(lineHeight + paddingTop + paddingBottom);

    textarea.style.height = `${baseHeight}px`;
    const newHeight = Math.min(Math.max(baseHeight, textarea.scrollHeight), 240);
    textarea.style.height = `${newHeight}px`;
  }, [question]);

  const submit = () => {
    if (!isLoading && (allowEmptySubmit || question.trim())) {
      onSubmit();
    }
  };

  return (
    <div className="w-full rounded-2xl border border-border/70 bg-card/85 transition-colors focus-within:border-border">
      <textarea
        ref={textareaRef}
        placeholder={placeholder}
        aria-label="Message input"
        rows={1}
        className="hide-scrollbar flex max-h-[240px] w-full resize-none overflow-y-auto bg-transparent px-3 pt-2.5 pb-0.5 text-sm leading-5 placeholder:text-muted-foreground/90 transition-colors focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
        value={question}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setQuestion(e.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        autoFocus
        disabled={isLoading}
      />

      <div className="flex h-8 items-center justify-end px-2 pb-1">
        <button
          type="button"
          onClick={submit}
          disabled={isLoading || (!allowEmptySubmit && !question.trim())}
          className={clsx(
            submitLabel
              ? "inline-flex h-7 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              : "flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            (allowEmptySubmit || question.trim()) && !isLoading
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-transparent text-muted-foreground hover:bg-muted",
          )}
          title={submitTitle}
        >
          {submitLabel ? (
            <span>{submitLabel}</span>
          ) : (
            <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
};
