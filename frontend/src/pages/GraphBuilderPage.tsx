import { Square } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";

import { ChatInput } from "@/features/chat/ChatInput";
import { NetworkAnimation } from "@/components/visuals/NetworkAnimation";
import { GraphCanvas } from "@/features/graph/GraphCanvas";
import { Overview } from "@/features/welcome/WelcomeOverview";
import { ApiError, createSession, fetchSampleGraph, streamGraphBuild } from "@/lib/api";
import { writeStoredSessionId } from "@/lib/session";
import type {
    GraphConcept,
    GraphDocument,
    GraphKnowledgeSpace,
    GraphStreamEvent,
    GraphTopicEdge,
    GraphTopic,
} from "@/types";

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        return error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return fallback;
}

function appendUniqueTopic(
    topics: GraphTopic[],
    topic: GraphTopic,
): GraphTopic[] {
    return topics.some((item) => item.id === topic.id)
        ? topics
        : [...topics, topic];
}

function appendUniqueConcept(
    concepts: GraphConcept[],
    concept: GraphConcept,
): GraphConcept[] {
    return concepts.some((item) => item.id === concept.id)
        ? concepts
        : [...concepts, concept];
}

function buildTopicEdges(topics: GraphTopic[]): GraphTopicEdge[] {
    return topics.slice(1).map((topic, index) => ({
        source_topic_id: topics[index].id,
        target_topic_id: topic.id,
        type: "sequence",
    }));
}

function UploadAction({
    isBuilding,
    label,
    onChooseFile,
    onStop,
}: {
    isBuilding: boolean;
    label: string;
    onChooseFile: () => void;
    onStop: () => void;
}) {
    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={onChooseFile}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/70 bg-transparent px-5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                title={label}
            >
                {isBuilding ? (
                    <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
                    />
                ) : null}
                {isBuilding ? "Building graph" : label}
            </button>

            {isBuilding ? (
                <button
                    type="button"
                    onClick={onStop}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/70 px-5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop
                </button>
            ) : null}
        </div>
    );
}

function StartUploadPanel({
    onChooseFile,
    onUseSampleGraph,
    isLoadingSampleGraph,
}: {
    onChooseFile: () => void;
    onUseSampleGraph: () => void;
    isLoadingSampleGraph: boolean;
}) {
    return (
        <div className="relative h-[420px] w-full max-w-[390px] text-left">
            <div className="absolute left-0 top-[72px]">
                <h2 className="max-w-sm text-[1.65rem] leading-tight tracking-tight text-ink-strong">
                    Choose today’s theme.
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">
                    Upload notes, slides, screenshots, or textbook pages.
                    <br />
                    The agent identifies key concepts and builds a step-by-step learning path through the material.
                </p>
            </div>

            <div className="absolute left-0 top-[248px] flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={onChooseFile}
                    className="hard-shadow-button inline-flex h-11 items-center justify-center rounded-md border border-foreground bg-background px-5 text-sm text-foreground transition-[box-shadow,transform]"
                >
                    Choose a source
                </button>
                <button
                    type="button"
                    onClick={onUseSampleGraph}
                    disabled={isLoadingSampleGraph}
                    className="hard-shadow-button inline-flex h-11 items-center justify-center rounded-md border border-foreground bg-background px-5 text-sm text-foreground transition-[box-shadow,transform]"
                >
                    {isLoadingSampleGraph ? "Loading sample" : "Use sample graph"}
                </button>
            </div>
        </div>
    );
}

export function GraphBuilderPage({
    onStartSession,
}: {
    onStartSession: (initialQuestion: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const [document, setDocument] = useState<GraphDocument | null>(null);
    const [topics, setTopics] = useState<GraphTopic[]>([]);
    const [topicEdges, setTopicEdges] = useState<GraphTopicEdge[]>([]);
    const [concepts, setConcepts] = useState<GraphConcept[]>([]);
    const [status, setStatus] = useState<"idle" | "building" | "done" | "error">(
        "idle",
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [buildIntent, setBuildIntent] = useState("");
    const [question, setQuestion] = useState("");
    const [isStartingSession, setIsStartingSession] = useState(false);
    const [isLoadingSampleGraph, setIsLoadingSampleGraph] = useState(false);

    const handleEvent = (event: GraphStreamEvent) => {
        switch (event.type) {
            case "overview.created":
                setDocument(event.payload);
                break;
            case "topic.created":
                setTopics((current) => appendUniqueTopic(current, event.payload));
                break;
            case "concept.created":
                setConcepts((current) => appendUniqueConcept(current, event.payload));
                break;
            case "graph.completed":
                setStatus("done");
                break;
            case "error":
                setStatus("error");
                setErrorMessage(event.message);
                break;
            default:
                break;
        }
    };

    const resetGraph = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setDocument(null);
        setTopics([]);
        setTopicEdges([]);
        setConcepts([]);
        setErrorMessage(null);
        setQuestion("");
        setBuildIntent("");
        setSelectedFile(null);
        setStatus("idle");
        setIsStartingSession(false);
    };

    const startBuild = async (file: File, userIntent: string) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        resetGraph();
        setStatus("building");

        try {
            for await (const event of streamGraphBuild(file, {
                signal: controller.signal,
                userIntent,
            })) {
                handleEvent(event);
            }
            setStatus((current) => (current === "building" ? "done" : current));
        } catch (error) {
            if (controller.signal.aborted) {
                setStatus("idle");
                return;
            }
            setErrorMessage(getErrorMessage(error, "Graph build failed"));
            setStatus("error");
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    };

    const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        setSelectedFile(file);
        setErrorMessage(null);
    };

    const stopBuild = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setStatus("idle");
    };

    const useSampleGraph = async () => {
        if (isLoadingSampleGraph) {
            return;
        }

        abortRef.current?.abort();
        abortRef.current = null;
        setIsLoadingSampleGraph(true);
        setSelectedFile(null);
        setBuildIntent("");
        setQuestion("");
        setErrorMessage(null);

        try {
            const sampleGraph = await fetchSampleGraph();
            setDocument(sampleGraph.document ?? null);
            setTopics(sampleGraph.topics);
            setTopicEdges(sampleGraph.topic_edges);
            setConcepts(sampleGraph.concepts);
            setStatus("done");
        } catch (error) {
            setErrorMessage(getErrorMessage(error, "Failed to load sample graph"));
            setStatus("error");
        } finally {
            setIsLoadingSampleGraph(false);
        }
    };

    const startGraphBuild = async () => {
        if (!selectedFile || status === "building") {
            return;
        }
        await startBuild(selectedFile, buildIntent);
    };

    const startChatSession = async (text?: string) => {
        const message = (text ?? question).trim();
        if (!message || !document || topics.length === 0 || isStartingSession) {
            return;
        }

        setIsStartingSession(true);
        setErrorMessage(null);

        try {
            const knowledgeSpace: GraphKnowledgeSpace = {
                document,
                topics,
                topic_edges: effectiveTopicEdges,
                concepts,
            };
            const session = await createSession(knowledgeSpace);
            writeStoredSessionId(session.session_id);
            onStartSession(message);
        } catch (error) {
            setErrorMessage(getErrorMessage(error, "Failed to start session"));
            setIsStartingSession(false);
        }
    };

    const hasGraph = topics.length > 0 || concepts.length > 0;
    const showGraph = hasGraph;
    const canStartSession = status === "done" && document !== null;
    const showInitialUpload = !selectedFile && !canStartSession;
    const showBuildComposer = selectedFile !== null && !canStartSession;
    const showPreGraphAnimation = selectedFile !== null && topics.length === 0 && !canStartSession;
    const effectiveTopicEdges = useMemo(
        () => (topicEdges.length > 0 ? topicEdges : buildTopicEdges(topics)),
        [topicEdges, topics],
    );
    const uploadAction = (
        <UploadAction
            isBuilding={status === "building"}
            label={selectedFile !== null ? "Replace file" : "Upload file"}
            onChooseFile={() => inputRef.current?.click()}
            onStop={stopBuild}
        />
    );

    return (
        <div className="flex h-dvh min-w-0 app-shell">
            <div className="relative flex h-full min-w-0 flex-1 flex-col">
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={onFileChange}
                />

                <div className="min-h-0 flex-1 overflow-hidden">
                    {showPreGraphAnimation ? (
                        <div className="flex h-full w-full items-center justify-center px-6 py-8">
                            <div className="h-[420px] w-[490px] max-w-full">
                                <NetworkAnimation />
                            </div>
                        </div>
                    ) : !showGraph ? (
                        <Overview
                            visual={
                                showInitialUpload ? (
                                    <StartUploadPanel
                                        onChooseFile={() => inputRef.current?.click()}
                                        onUseSampleGraph={useSampleGraph}
                                        isLoadingSampleGraph={isLoadingSampleGraph}
                                    />
                                ) : undefined
                            }
                        />
                    ) : (
                        <GraphCanvas
                            topics={topics}
                            topicEdges={effectiveTopicEdges}
                            concepts={concepts}
                        />
                    )}
                </div>

                <div className="mx-auto w-full px-4 pt-3 pb-4 md:max-w-3xl md:pb-6">
                    <div className="relative min-h-[132px]">
                        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-10 items-center justify-center">
                            <div className="pointer-events-auto">
                                {canStartSession ? (
                                    <button
                                        type="button"
                                        onClick={resetGraph}
                                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        Back to start
                                    </button>
                                ) : showBuildComposer ? (
                                    status === "building" ? (
                                        uploadAction
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => inputRef.current?.click()}
                                            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            Change file
                                        </button>
                                    )
                                ) : null}
                            </div>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 flex justify-center">
                            {showBuildComposer ? (
                                <ChatInput
                                    question={buildIntent}
                                    setQuestion={setBuildIntent}
                                    onSubmit={startGraphBuild}
                                    isLoading={status === "building"}
                                    placeholder="What should we focus on?"
                                    submitTitle="Start graph build"
                                    submitLabel="Start"
                                    allowEmptySubmit
                                />
                            ) : canStartSession ? (
                                <ChatInput
                                    question={question}
                                    setQuestion={setQuestion}
                                    onSubmit={startChatSession}
                                    isLoading={isStartingSession}
                                />
                            ) : null}
                        </div>
                    </div>

                    {errorMessage ? (
                        <div className="flex items-center justify-center pt-2">
                            <div className="text-sm text-rose-700">{errorMessage}</div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
