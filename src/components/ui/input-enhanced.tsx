import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  variant?: 'default' | 'professional';
}

const InputEnhanced = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, variant = 'default', ...props }, ref) => {
    if (variant === 'professional') {
      return (
        <div className="relative">
          <input
            type={type}
            className={cn(
              'peer h-12 w-full rounded-xl bg-white/10 p-4 pt-6 text-foreground placeholder-transparent transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50',
              className
            )}
            placeholder={label || ''}
            ref={ref}
            {...props}
          />
          <label
            className="pointer-events-none absolute left-4 top-1.5 text-xs text-muted-foreground transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm sm:peer-placeholder-shown:text-base peer-focus:top-1.5 peer-focus:text-xs truncate max-w-[calc(100%-2rem)]"
          >
            {label}
          </label>
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
InputEnhanced.displayName = 'InputEnhanced';

export { InputEnhanced };
