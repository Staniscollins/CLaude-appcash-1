"use client";

import { Info } from "lucide-react";
import { Switch as RadixSwitch, Tooltip } from "radix-ui";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "gain" | "loss" | "warning";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-muted ring-border",
    accent: "bg-accent-soft text-accent ring-accent/20",
    gain: "bg-gain/12 text-gain ring-gain/20",
    loss: "bg-loss/12 text-loss ring-loss/20",
    warning: "bg-warning/12 text-warning ring-warning/25",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Hint({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-72 rounded-xl bg-surface-3 px-3 py-2 text-xs leading-relaxed text-fg shadow-[var(--shadow-pop)] data-[state=delayed-open]:animate-[fade-in_0.15s_ease-out]"
        >
          {content}
          <Tooltip.Arrow className="fill-[var(--surface-3)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Small (i) icon that explains a metric. */
export function InfoTip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Hint content={children}>
      <button
        type="button"
        aria-label="Explication"
        className={cn("inline-grid size-4 place-items-center rounded-full text-subtle hover:text-fg", className)}
      >
        <Info className="size-3.5" />
      </button>
    </Hint>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl bg-surface-2 px-3 text-sm text-fg ring-1 ring-border outline-none transition placeholder:text-subtle hover:ring-border-strong focus:ring-2 focus:ring-accent disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-20 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg ring-1 ring-border outline-none transition placeholder:text-subtle hover:ring-border-strong focus:ring-2 focus:ring-accent",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full appearance-none rounded-xl bg-surface-2 bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 pl-3 text-sm text-fg ring-1 ring-border outline-none transition hover:ring-border-strong focus:ring-2 focus:ring-accent",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa1ad' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-loss">{error}</span> : hint ? <span className="text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
  id?: string;
}) {
  return (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-surface-3 ring-1 ring-border-strong transition-colors data-[state=checked]:bg-accent-solid"
    >
      <RadixSwitch.Thumb className="block size-[18px] translate-x-[3px] rounded-full bg-white shadow-md transition-transform duration-200 ease-[cubic-bezier(.3,1.4,.6,1)] data-[state=checked]:translate-x-[19px]" />
    </RadixSwitch.Root>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      {icon && (
        <div className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted ring-1 ring-border [&_svg]:size-5">{icon}</div>
      )}
      <div>
        <p className="font-medium text-fg">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-balance">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  info,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  info?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1 text-xs text-muted">
        <span className="truncate">{label}</span>
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div className="mt-1 truncate text-lg font-semibold tracking-tight text-fg">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs">{sub}</div>}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-surface-3 px-1 font-mono text-[10px] text-muted ring-1 ring-border",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
