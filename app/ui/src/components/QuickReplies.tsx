import { clsx } from "clsx";
import { useEffect } from "react";

interface QuickRepliesProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export const QuickReplies = ({ options, onSelect, disabled }: QuickRepliesProps) => {
  useEffect(() => {
    if (disabled || options.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= options.length) {
        event.preventDefault();
        onSelect(options[num - 1]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options, onSelect, disabled]);

  if (options.length === 0) return null;

  const colsClass =
    options.length === 1
      ? "grid-cols-1"
      : options.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-3";

  return (
    <div
      className={clsx(
        "grid w-full min-w-0 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300",
        colsClass,
      )}
    >
      {options.map((option, index) => (
        <button
          key={`${option}-${index}`}
          type="button"
          onClick={() => onSelect(option)}
          disabled={disabled}
          className={clsx(
            "inline-flex h-11 w-full min-w-0 items-center justify-center rounded-2xl border border-border/70 bg-transparent px-4 text-[13px] font-normal",
            "transition-colors duration-150",
            "hover:border-border hover:bg-muted/35",
            "focus-visible:border-border focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span className="block w-full min-w-0 truncate text-center">{option}</span>
        </button>
      ))}
    </div>
  );
};
