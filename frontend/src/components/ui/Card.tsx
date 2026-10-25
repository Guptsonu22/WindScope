import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  glow?: 'cyan' | 'emerald' | 'rose' | 'none';
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  glow = 'none',
  ...props
}) => {
  const glowStyles = {
    cyan: 'shadow-glow-cyan border-cyan-500/30',
    emerald: 'shadow-glow-emerald border-emerald-500/30',
    rose: 'shadow-glow-rose border-rose-500/30',
    none: 'border-slate-800/80',
  };

  return (
    <div
      className={twMerge(
        clsx(
          'bg-slate-900/90 rounded-xl border backdrop-blur-md transition-all duration-200',
          glowStyles[glow],
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, badge, action, icon, className }) => {
  return (
    <div className={twMerge(clsx('flex items-center justify-between p-4 border-b border-slate-800/60', className))}>
      <div className="flex items-center gap-2.5">
        {icon && <div className="text-slate-400 p-1.5 rounded-lg bg-slate-800/70">{icon}</div>}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-100 text-sm tracking-wide">{title}</h3>
            {badge}
          </div>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
};
