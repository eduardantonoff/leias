import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';

export interface MiniCardProps {
  status?: 'done' | 'active' | 'pending';
  children: ReactNode;
}

export const MiniCard: FC<MiniCardProps> = ({ 
  status = 'pending', 
  children, 
}) => {
  const isDone = status === 'done';
  
  return (
    <div
      className={clsx(
        'relative w-full pl-4 pr-2 py-2 rounded-r-md rounded-l-none overflow-hidden select-text transition-colors',
        'bg-primary/5 dark:bg-primary/10'
      )}
      data-unit-status={status}
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
        <div className={clsx('flex-1 min-w-0 flex flex-col gap-0.5', isDone && 'opacity-60')}>
          {children}
        </div>
      </div>
    </div>
  );
};
