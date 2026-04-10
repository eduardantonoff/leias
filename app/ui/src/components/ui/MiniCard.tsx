/**
 * MiniCard - Reusable status card component.
 * 
 * Used for displaying items with status indicators (done/active/pending).
 * Features a left border that changes color based on status.
 */

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

export interface MiniCardProps {
  status?: 'done' | 'active' | 'pending';
  indexEl?: ReactNode;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const MiniCard: FC<MiniCardProps> = ({ 
  status = 'pending', 
  indexEl, 
  children, 
  className = '', 
  onClick 
}) => {
  const isDone = status === 'done';
  
  return (
    <div
      className={clsx(
        'relative w-full pl-4 pr-2 py-2 rounded-r-md rounded-l-none overflow-hidden select-text transition-colors',
        'bg-primary/5 dark:bg-primary/10',
        className
      )}
      data-unit-status={status}
      onClick={onClick}
    >
      <span
        aria-hidden
        className={clsx(
          'absolute left-0 top-0 bottom-0 w-[3px]',
          status === 'active' && 'bg-primary/70',
          status === 'done' && 'bg-zinc-300 dark:bg-zinc-600',
          status === 'pending' && 'bg-transparent'
        )}
      />
      <div className="flex items-baseline gap-2">
        {indexEl && (
          <div className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 w-6 text-right">
            {indexEl}
          </div>
        )}
        <div className={clsx('flex-1 min-w-0 flex flex-col gap-0.5', isDone && 'opacity-60')}>
          {children}
        </div>
      </div>
    </div>
  );
};
