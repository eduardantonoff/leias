import { type FC } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

import type { Plan, PlanContext, RetrievalTopic } from "@/types";
import { MiniCard } from "@/components/ui/MiniCard";
import { SectionHeader } from "@/components/ui/SectionHeader";

interface RetrievalTopicMeta {
  id: string;
  title?: string;
  itemsCount?: number;
  mediaCount?: number;
}

interface SessionSidebarProps {
  planContext: PlanContext | null;
  retrievalTopics?: RetrievalTopicMeta[];
}

const extractMeta = (topic: RetrievalTopic): RetrievalTopicMeta => ({
  id: topic.id,
  title: topic.title,
  itemsCount: topic.materials?.length,
  mediaCount: undefined,
});

export const SessionSidebar: FC<SessionSidebarProps> = ({
  planContext,
  retrievalTopics = [],
}) => {
  const plan: Plan | null = planContext?.plan ?? null;
  const completed = planContext?.completed ?? false;
  const completedCheckpoints = new Set(planContext?.completed_checkpoints || []);
  const unitStatus: "done" | "active" = completed ? "done" : "active";

  if (!plan && retrievalTopics.length === 0) {
    return null;
  }

  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col overflow-y-auto bg-gradient-to-b from-background/90 to-background/60 pt-6 pb-2 backdrop-blur-sm md:flex">
      {retrievalTopics.length > 0 && (
        <div className="space-y-2 border-b border-transparent px-3 pb-3">
          <SectionHeader title="Source" variant="plain" />
          {retrievalTopics.map((topic) => (
            <div key={topic.id} className="group">
              <MiniCard status="active">
                <div className="relative">
                  <span className="block pr-8 text-[13px] leading-tight line-clamp-2">
                    {topic.title || "Untitled"}
                  </span>
                  <span className="absolute top-0 right-0 text-[10px] tabular-nums tracking-wide text-ink-soft">
                    {topic.id}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 pt-1 text-[11px] leading-snug text-ink-soft">
                  {topic.itemsCount !== undefined && <span>Items: {topic.itemsCount}</span>}
                  {topic.mediaCount !== undefined && <span>Resources: {topic.mediaCount}</span>}
                </div>
              </MiniCard>
            </div>
          ))}
        </div>
      )}

      {plan && (
        <div className="space-y-2 px-3 pb-4">
          <SectionHeader title="Current Plan" variant="plain" />
          <MiniCard status={unitStatus}>
            <div className="flex items-center justify-between gap-2">
              <span
                className={clsx(
                  "block text-[13px] leading-tight line-clamp-2",
                  completed && "text-ink-soft",
                )}
              >
                {plan.title}
              </span>
              {completed ? (
                <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              ) : null}
            </div>

            {completed ? (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 text-[12px] text-emerald-600">
                  <span>Section completed</span>
                </div>
                {plan.next_topic_ids.length > 0 && (
                  <div className="space-y-1 border-t border-border/40 pt-1">
                    <span className="text-[9px] uppercase tracking-widest text-ink-soft">
                      Next
                    </span>
                    {plan.next_topic_ids.map((topicId) => (
                      <div
                        key={topicId}
                        className="flex items-center gap-2 py-1.5 text-left text-[12px] text-ink-medium"
                      >
                        <ArrowRight size={12} className="shrink-0 text-ink-soft" />
                        <span className="truncate">{topicId}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                <p className="pb-0.5 text-[11px] leading-snug text-ink-medium">
                  {plan.learning_objective}
                </p>

                {plan.checkpoints.length > 0 && (
                  <div className="space-y-1">
                    {plan.checkpoints.map((checkpoint, index) => {
                      const passed = completedCheckpoints.has(index);
                      return (
                        <div
                          key={`${checkpoint.target_skill}-${index}`}
                          className={clsx(
                            "border-l-2 pl-3 transition-colors duration-300",
                            passed ? "border-border/30" : "border-ink-soft",
                          )}
                        >
                          <p
                            className={clsx(
                              "text-[11px] leading-snug transition-colors duration-300",
                              passed ? "text-ink-soft/40" : "text-ink-medium",
                            )}
                          >
                            {checkpoint.target_skill}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="pt-0.5 text-[10px] leading-snug text-ink-medium">
                  {plan.completion_criteria}
                </p>

                {plan.resources.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {plan.resources.map((resource, index) => (
                      <span
                        key={`${resource.url}-${index}`}
                        className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[10px] text-ink-soft"
                      >
                        <span className="text-[8px] uppercase tracking-wide text-ink-soft/70">
                          {resource.type}
                        </span>
                        {resource.caption}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </MiniCard>
        </div>
      )}
    </aside>
  );
};

export const buildRetrievalTopics = (activeTopic: RetrievalTopic | null | undefined) =>
  activeTopic ? [extractMeta(activeTopic)] : [];
