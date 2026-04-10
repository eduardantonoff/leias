/**
 * SectionHeader - Flexible section header with multiple variants.
 * 
 * Variants:
 * - pill: Label in a pill-shaped badge (default)
 * - line: Label with a horizontal line extending to the right
 * - plain: Simple uppercase label
 */

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

export interface SectionHeaderProps {
  title: string;
  icon?: LucideIcon;
  right?: ReactNode;
  variant?: 'pill' | 'line' | 'plain';
  className?: string;
}

export const SectionHeader: FC<SectionHeaderProps> = ({ 
  title, 
  icon: Icon,
  right, 
  variant = 'pill', 
  className = '' 
}) => {
  if (variant === 'line') {
    return (
      <div className={clsx('flex items-center w-full', className)}>
        <span className="shrink-0 pr-3 text-[10px] uppercase tracking-wide font-medium text-ink-soft flex items-center gap-1">
          {Icon && <Icon className="w-3 h-3" strokeWidth={1.5} />}
          {title}
        </span>
        <div className="h-px flex-1 bg-border" />
        {right && (
          <div className="pl-3 text-[10px] tabular-nums text-ink-soft">
            {right}
          </div>
        )}
      </div>
    );
  }
  
  if (variant === 'plain') {
    return (
      <div className={clsx('flex items-center justify-between', className)}>
        <span className="text-[9px] uppercase tracking-wide font-light text-ink-soft">
          {title}
        </span>
        {right && (
          <div className="text-[9px] tabular-nums text-ink-soft pl-2">
            {right}
          </div>
        )}
      </div>
    );
  }
  
  // Default: pill variant
  return (
    <div className={clsx('flex items-center justify-between', className)}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-md px-2 py-0.5 bg-muted/55 text-[10px] font-medium uppercase tracking-wide text-ink-medium gap-1">
          {Icon && <Icon className="w-3 h-3" strokeWidth={1.5} />}
          {title}
        </span>
      </div>
      {right && (
        <div className="text-[10px] tabular-nums text-ink-soft pl-2">
          {right}
        </div>
      )}
    </div>
  );
};
