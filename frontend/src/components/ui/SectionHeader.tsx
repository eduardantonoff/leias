import { FC } from 'react';

export interface SectionHeaderProps {
  title: string;
}

export const SectionHeader: FC<SectionHeaderProps> = ({ title }) => {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] uppercase tracking-wide font-light text-ink-soft">
        {title}
      </span>
    </div>
  );
};
