import { type ReactNode, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NetworkAnimation } from '@/components/visuals/NetworkAnimation';

type OverviewItem = {
    title: string;
    line: string;
};

const OVERVIEW_ITEMS: OverviewItem[] = [
    {
        title: 'Assistant',
        line: 'Keeps the conversation focused and adapts explanations to the learner.',
    },
    {
        title: 'Retriever',
        line: 'Grounds each turn in valid course topics, excerpts, and supporting materials.',
    },
    {
        title: 'Planner',
        line: 'Builds compact next-step learning paths with checkpoints and clear teaching goals.',
    },
];

export function Overview({
    visual,
}: {
    visual?: ReactNode;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const activeItem = OVERVIEW_ITEMS[activeIndex];

    useEffect(() => {
        const interval = window.setInterval(() => {
            setActiveIndex((current) => (current + 1) % OVERVIEW_ITEMS.length);
        }, 4400);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-center px-6 py-8">
            <div className="empty-chat-shell grid w-full max-w-[960px] items-stretch gap-10 py-6 md:grid-cols-[minmax(0,1fr)_1px_430px] md:py-10">
                <div className="grid h-[420px] min-w-0 max-w-xl grid-rows-[auto_minmax(0,1fr)] text-left">
                    <div>
                        <h1 className="leias-wordmark max-w-xl text-4xl leading-tight tracking-tight text-ink-strong md:text-6xl">
              leias.
                        </h1>
                    </div>

                    <div className="mt-5 max-w-xl overflow-hidden">
                        <>
                            <p className="max-w-xl text-base leading-7 text-ink-soft md:text-lg">
                An interactive AI system for adaptive learning paths.
                            </p>
                            <div className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground/65">
                                Powered by Gemma 4 31B
                            </div>
                            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground/55">
                                Built with Google Agent Development Kit
                            </div>

                            <div className="mt-10">
                                <div className="min-h-[7.75rem] max-w-xl">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={activeItem.title}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            transition={{ duration: 0.32, ease: 'easeOut' }}
                                        >
                                            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground/65">
                                                {activeItem.title}
                                            </div>
                                            <p className="mt-3 max-w-xl text-base leading-7 text-ink-soft md:text-lg">
                                                {activeItem.line}
                                            </p>
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                                <div className="mt-5 flex items-center gap-2">
                                    {OVERVIEW_ITEMS.map((item, index) => (
                                        <button
                                            key={item.title}
                                            type="button"
                                            onClick={() => setActiveIndex(index)}
                                            aria-label={`Show ${item.title}`}
                                            className={`h-2 rounded-full transition-all ${index === activeIndex
                                                    ? 'w-6 bg-foreground'
                                                    : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </>
                    </div>
                </div>

                <div className="hidden h-[420px] w-px bg-border/55 md:block" />

                <div className="relative flex h-[420px] items-center justify-center">
                    {visual === undefined ? <NetworkAnimation /> : visual}
                </div>
            </div>
        </div>
    );
}
