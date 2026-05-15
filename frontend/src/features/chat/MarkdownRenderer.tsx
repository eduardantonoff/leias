import {
  memo,
  Children,
  isValidElement,
  cloneElement,
  type ReactElement,
  useMemo,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { BadgeInfo } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";

const CodeBlock = ({ inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";

  if (inline || !match) {
    return (
      <code className="text-sm bg-muted py-0.5 px-1 rounded-md text-ink-strong" {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="my-6 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-muted flex items-center">
        <span className="text-xs text-ink-soft">{language}</span>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneLight}
        customStyle={{
          margin: 0,
          padding: "1rem",
          fontSize: "0.85rem",
          lineHeight: 1.5,
        }}
        showLineNumbers={false}
      >
        {String(children).trim()}
      </SyntaxHighlighter>
    </div>
  );
};

type IframeBlock = {
  id: string;
  src: string;
};

type TakeawayBlock = {
  id: string;
  content: string;
};

type ChoiceOption = {
  label: string;
  content: string;
};

type ChoiceBlock = {
  id: string;
  options: ChoiceOption[];
};

const IFRAME_TOKEN_PREFIX = "__IFRAME:";
const TAKEAWAY_TOKEN_PREFIX = "__TAKEAWAY:";
const CHOICE_TOKEN_PREFIX = "__CHOICE:";
const TOKEN_SUFFIX = "__";
const iframeRegex = /<iframe[\s\S]*?<\/iframe>/gi;
const takeawayRegex = /<key-takeaway>([\s\S]*?)<\/key-takeaway>/gi;
const fencedCodeRegex = /```[\s\S]*?```/g;
const inlineCodeRegex = /`[^`\n]+`/g;
const choiceLineRegex = /^(?:\(([A-Z])\)|([A-Z])\.)\s+(.+)$/;
const SAFE_IFRAME_PATHS = new Set([
  "/static/quizzes/multiple-choice.html",
]);
const markdownPlugins = [remarkGfm, remarkBreaks, remarkMath];
const rehypePlugins = [rehypeKatex];

const replaceWithTokens = (
  content: string,
  regex: RegExp,
  prefix: string,
): { content: string; values: string[] } => {
  const values: string[] = [];
  const replaced = content.replace(regex, (match) => {
    const index = values.length;
    values.push(match);
    return `${prefix}${index}${TOKEN_SUFFIX}`;
  });
  return { content: replaced, values };
};

const restoreTokens = (content: string, prefix: string, values: string[]) =>
  content.replace(new RegExp(`${prefix}(\\d+)${TOKEN_SUFFIX}`, "g"), (_match, rawIndex) => {
    const value = values[Number(rawIndex)];
    return value ?? "";
  });

const normalizeMathEscapes = (body: string) =>
  body.replace(/\\\\([A-Za-z]+)/g, (_match, command) => `\\${command}`);

const normalizeInlineMathBody = (body: string) =>
  normalizeMathEscapes(body)
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const normalizeDisplayMathBody = (body: string) =>
  normalizeMathEscapes(body).trim();

const escapeCurrencyAmounts = (content: string) =>
  content
    // Handle cases like `$345,000$` where the model wraps a money value in paired dollars.
    .replace(
      /(?<!\\)\$((?:\d{1,3}(?:,\d{3})+|\d{4,}|\d+\.\d{2,}))\$(?=[\s.,!?;:)]|$)/g,
      (_match, amount) => `\\$${amount}`,
    )
    // Handle normal currency mentions like `$300,000`.
    .replace(
      /(?<!\\)\$((?:\d{1,3}(?:,\d{3})+|\d{4,}|\d+\.\d{2,}))(?=[\s.,!?;:)]|$)/g,
      (_match, amount) => `\\$${amount}`,
    );

const normalizeMarkdownContent = (content: string) => {
  const { content: withoutFencedCode, values: fencedBlocks } = replaceWithTokens(
    content,
    fencedCodeRegex,
    "__FENCED_CODE:",
  );
  const { content: withoutCode, values: inlineBlocks } = replaceWithTokens(
    withoutFencedCode,
    inlineCodeRegex,
    "__INLINE_CODE:",
  );
  const protectedCurrency = escapeCurrencyAmounts(withoutCode);

  const normalized = protectedCurrency
    .replace(/—/g, "-")
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, body) => `\n\n$$\n${normalizeDisplayMathBody(body)}\n$$\n\n`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, body) => `$${normalizeInlineMathBody(body)}$`)
    .replace(/(?<!\$)\$([\s\S]*?)\$(?!\$)/g, (_match, body) => `$${normalizeInlineMathBody(body)}$`);

  return restoreTokens(
    restoreTokens(normalized, "__INLINE_CODE:", inlineBlocks),
    "__FENCED_CODE:",
    fencedBlocks,
  );
};

const isAllowedIframeUrl = (url: URL) =>
  url.origin === window.location.origin && SAFE_IFRAME_PATHS.has(url.pathname);

const normalizeIframeSrc = (src: string) => {
  if (!src) return "";

  try {
    const url = new URL(src, window.location.origin);
    return isAllowedIframeUrl(url) ? url.toString() : "";
  } catch {
    return "";
  }
};

const normalizeImageSrc = (src: string) => {
  if (!src) return src;
  if (src.startsWith("/")) {
    return `${window.location.origin}${src}`;
  }
  return src;
};

const extractIframes = (content: string): { content: string; iframes: IframeBlock[] } => {
  const iframes: IframeBlock[] = [];
  const replaced = content.replace(iframeRegex, (match) => {
    const srcMatch = match.match(/src\s*=\s*["']([^"']+)["']/i);
    const src = normalizeIframeSrc(srcMatch?.[1] || "");
    if (!src) {
      return "\n\n";
    }
    const index = iframes.length;
    iframes.push({ id: `iframe-${index}-${src}`, src });
    return `\n\n${IFRAME_TOKEN_PREFIX}${index}${TOKEN_SUFFIX}\n\n`;
  });
  return { content: replaced, iframes };
};

const extractTakeaways = (content: string): { content: string; takeaways: TakeawayBlock[] } => {
  const takeaways: TakeawayBlock[] = [];
  const replaced = content.replace(takeawayRegex, (_match, inner = "") => {
    const index = takeaways.length;
    takeaways.push({ id: `takeaway-${index}`, content: String(inner).trim() });
    return `\n\n${TAKEAWAY_TOKEN_PREFIX}${index}${TOKEN_SUFFIX}\n\n`;
  });
  return { content: replaced, takeaways };
};

const extractChoiceBlocks = (content: string): { content: string; choices: ChoiceBlock[] } => {
  const choices: ChoiceBlock[] = [];
  const blocks = content.split(/(\n{2,})/);

  const replaced = blocks
    .map((block) => {
      if (/^\n{2,}$/.test(block)) return block;

      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) return block;

      let choiceStartIndex = -1;
      for (let start = 0; start < lines.length - 1; start += 1) {
        const tail = lines.slice(start);
        if (tail.length < 2) continue;
        if (tail.every((line) => choiceLineRegex.test(line))) {
          choiceStartIndex = start;
          break;
        }
      }

      if (choiceStartIndex === -1) return block;

      const introLines = lines.slice(0, choiceStartIndex);
      const options = lines.slice(choiceStartIndex).map((line) => {
        const match = line.match(choiceLineRegex)!;
        return {
          label: match[1] || match[2],
          content: match[3].trim(),
        };
      });

      const index = choices.length;
      choices.push({
        id: `choice-${index}`,
        options: options as ChoiceOption[],
      });

      if (introLines.length === 0) {
        return `${CHOICE_TOKEN_PREFIX}${index}${TOKEN_SUFFIX}`;
      }

      return `${introLines.join("\n")}\n\n${CHOICE_TOKEN_PREFIX}${index}${TOKEN_SUFFIX}`;
    })
    .join("");

  return { content: replaced, choices };
};

const KeyTakeaway = ({ children }: { children: React.ReactNode }) => (
  <div className="my-4 rounded-xl border border-transparent bg-primary/5 dark:bg-primary/10 px-5 py-4 text-sm text-ink-strong [&_code]:bg-transparent [&_code]:text-ink-strong [&_code]:text-[0.85rem] [&_code]:px-0 [&_code]:py-0 [&_code]:rounded-none">
    <div className="mb-2 text-ink-strong">
      <BadgeInfo className="h-4 w-4" strokeWidth={1.5} />
    </div>
    <div className="leading-relaxed">{children}</div>
  </div>
);

const IframeEmbed = memo(({ src }: { src: string }) => {
  return (
    <div className="my-6 overflow-hidden">
      <div
        style={{
          position: "relative",
          paddingBottom: "56.25%",
          minHeight: "clamp(300px, 82vw, 360px)",
          height: 0,
          overflow: "hidden",
        }}
      >
        <iframe
          src={src}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            border: 0,
            overflow: "hidden",
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
});

const InlineMarkdown = ({ children }: { children: string }) => (
  <ReactMarkdown
    remarkPlugins={markdownPlugins}
    rehypePlugins={rehypePlugins}
    components={{
      code: CodeBlock,
      p: ({ children }) => <>{children}</>,
      strong: ({ children, ...props }: any) => (
        <strong className="font-[500]" {...props}>
          {children}
        </strong>
      ),
      a: ({ children, ...props }: any) => (
        <a className="text-info hover:text-info/85 hover:underline" target="_blank" rel="noreferrer" {...props}>
          {children}
        </a>
      ),
    }}
  >
    {children}
  </ReactMarkdown>
);

const ChoiceBlockView = ({ options }: { options: ChoiceOption[] }) => (
  <div className="my-4 space-y-2">
    {options.map((option, index) => (
      <div
        key={`${option.label}-${index}`}
        className="grid grid-cols-[44px_1fr] overflow-hidden rounded-lg border border-border/70 bg-white"
      >
        <div className="flex items-start justify-center bg-muted/45 px-2 py-3 text-sm text-ink-strong">
          {option.label}.
        </div>
        <div className="min-w-0 px-4 py-3 text-sm leading-relaxed text-ink-strong">
          <InlineMarkdown>{option.content}</InlineMarkdown>
        </div>
      </div>
    ))}
  </div>
);

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  const cleanedContent = children
    .replace(/<quick-replies>[\s\S]+?<\/quick-replies>/gi, "")
    .replace(/\[quick-replies\][\s\S]+?\[\/quick-replies\]/gi, "")
    .replace(/<quick-replies>[\s\S]*$/gi, "")
    .replace(/\[quick-replies\][\s\S]*$/gi, "")
    .trim();
  const normalizedContent = useMemo(() => normalizeMarkdownContent(cleanedContent), [cleanedContent]);
  const { content: contentWithIframeTokens, iframes } = useMemo(
    () => extractIframes(normalizedContent),
    [normalizedContent],
  );
  const { content: contentWithTakeawayTokens, takeaways } = useMemo(
    () => extractTakeaways(contentWithIframeTokens),
    [contentWithIframeTokens],
  );
  const { content: contentWithTokens, choices } = useMemo(
    () => extractChoiceBlocks(contentWithTakeawayTokens),
    [contentWithTakeawayTokens],
  );
  const parts = useMemo(() => contentWithTokens.split(/__(IFRAME|TAKEAWAY|CHOICE):(\d+)__/g), [contentWithTokens]);

  const components: Components = {
    code: CodeBlock as any,
    img: ({ ...props }: any) => {
      const alt = props.alt || "";
      const src = normalizeImageSrc(String(props.src || ""));
      return (
        <figure className="my-6 w-full overflow-hidden rounded-2xl">
          <div className="relative">
            <img {...props} src={src} alt={alt} loading="lazy" className="w-full h-auto object-contain" />
          </div>
          {alt && (
            <figcaption className="px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground">
              <span className="block w-[70%] mx-auto text-xs text-ink-medium">{alt}</span>
            </figcaption>
          )}
        </figure>
      );
    },
    p: ({ children, ...props }: any) => {
      let hasMediaElement = false;

      Children.forEach(children, (child) => {
        if (isValidElement(child) && child.props) {
          if (
            typeof child.type === "string" &&
            ["img", "div", "figure", "table", "blockquote", "pre"].includes(child.type)
          ) {
            hasMediaElement = true;
            return;
          }

          const childProps = child.props as any;
          if (childProps.node && childProps.node.tagName) {
            const tagName = childProps.node.tagName;
            if (["img", "div", "figure", "table", "blockquote", "pre"].includes(tagName)) {
              hasMediaElement = true;
            }
          }
        }
      });

      if (hasMediaElement) {
        return <div className="my-4" {...props}>{children}</div>;
      }

      return <p {...props}>{children}</p>;
    },
    ol: ({ children, ...props }: any) => (
      <ol className="list-none ml-3 my-3 space-y-1.5 [&_ol]:mt-2 [&_ul]:mt-2 [&_ol]:mb-2 [&_ul]:mb-2" {...props}>
        {(() => {
          let visibleIndex = 0;
          return Children.map(children, (child: any) => {
            if (!isValidElement(child)) return child;
            visibleIndex += 1;
            const existing = (child.props as any)?.className || "";
            const originalChildren = (child.props as any)?.children;
            return cloneElement(child as ReactElement, {
              className: `${existing} pl-5 relative leading-[1.48]`.trim(),
              children: (
                <>
                  <span className="absolute left-0 top-0 w-4 text-right text-inherit">
                    {visibleIndex}.
                  </span>
                  {originalChildren}
                </>
              ),
            });
          });
        })()}
      </ol>
    ),
    ul: ({ children, ...props }: any) => (
      <ul className="list-none ml-3 my-3 space-y-1 [&_ol]:mt-1 [&_ul]:mt-1 [&_ol]:mb-2 [&_ul]:mb-2" {...props}>
        {Children.map(children, (child: any) => {
          if (!isValidElement(child)) return child;
          const existing = (child.props as any)?.className || "";
          return cloneElement(child as ReactElement, {
            className: `${existing} pl-3 relative leading-[1.48] before:content-['-'] before:absolute before:left-0 before:text-inherit`,
          });
        })}
      </ul>
    ),
    strong: ({ children, ...props }: any) => (
      <strong className="font-[500]" {...props}>
        {children}
      </strong>
    ),
    a: ({ children, ...props }: any) => (
      <a className="text-info hover:text-info/85 hover:underline" target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    ),
    h1: ({ children, ...props }: any) => (
      <h1 className="text-2xl font-semibold mt-6 mb-3" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: any) => (
      <h2 className="text-xl font-semibold mt-5 mb-2" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: any) => (
      <h3 className="text-lg font-medium mt-4 mb-2" {...props}>
        {children}
      </h3>
    ),
    blockquote: ({ children, ...props }: any) => (
      <blockquote className="my-4 ml-3 border-l-2 border-primary/70 pl-4 text-ink-strong" {...props}>
        {children}
      </blockquote>
    ),
    table: ({ children, ...props }: any) => (
      <div className="my-6 overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full divide-y divide-border" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }: any) => (
      <thead className="bg-muted/60" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }: any) => (
      <tbody className="bg-card/80 divide-y divide-border" {...props}>
        {children}
      </tbody>
    ),
    tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
    th: ({ children, ...props }: any) => (
      <th className="px-4 py-3 text-left text-xs font-semibold text-ink-medium uppercase tracking-wider border-r border-border last:border-r-0" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td className="px-4 py-3 text-sm text-ink-soft border-r border-border last:border-r-0" {...props}>
        {children}
      </td>
    ),
    hr: ({ ...props }: any) => <div className="my-3 w-[90%] mx-auto h-px bg-border/70" {...props} />,
  };

  return (
    <div className="flex flex-col gap-3 text-ink-strong">
      {parts.map((part, index) => {
        if (index % 3 === 1) {
          const tokenType = part;
          const tokenIndex = Number(parts[index + 1]);

          if (tokenType === "IFRAME") {
            const iframe = iframes[tokenIndex];
            if (!iframe || !iframe.src) return null;
            return <IframeEmbed key={iframe.id} src={iframe.src} />;
          }

          if (tokenType === "TAKEAWAY") {
            const takeaway = takeaways[tokenIndex];
            if (!takeaway) return null;
            return (
              <KeyTakeaway key={takeaway.id}>
                <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={rehypePlugins} components={components}>
                  {takeaway.content}
                </ReactMarkdown>
              </KeyTakeaway>
            );
          }

          if (tokenType === "CHOICE") {
            const choice = choices[tokenIndex];
            if (!choice) return null;
            return <ChoiceBlockView key={choice.id} options={choice.options} />;
          }
          return null;
        }

        if (index % 3 === 2) return null;

        const text = part;
        if (!text?.trim()) return null;
        return (
          <ReactMarkdown
            key={`md-${index}`}
            remarkPlugins={markdownPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
          >
            {text}
          </ReactMarkdown>
        );
      })}
    </div>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prev, next) => prev.children === next.children,
);
