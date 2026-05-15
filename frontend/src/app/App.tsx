import { lazy, Suspense, useState } from "react";

import { GraphBuilderPage } from "@/pages/GraphBuilderPage";
import { clearStoredSessionId, readStoredSessionId } from "@/lib/session";

const ChatPage = lazy(() =>
  import("@/pages/ChatPage").then((module) => ({ default: module.ChatPage })),
);

export default function App() {
  const [initialQuestion, setInitialQuestion] = useState<string | null>(() =>
    readStoredSessionId() ? "" : null,
  );

  if (initialQuestion === null) {
    return <GraphBuilderPage onStartSession={setInitialQuestion} />;
  }

  const resetSession = () => {
    clearStoredSessionId();
    setInitialQuestion(null);
  };

  return (
    <Suspense fallback={null}>
      <ChatPage initialQuestion={initialQuestion} onResetSession={resetSession} />
    </Suspense>
  );
}
