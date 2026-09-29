"use client";

import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "subtle";
type Size = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-solid text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_8px_24px_-8px_var(--accent-glow)] hover:brightness-110 active:brightness-95",
  secondary: "bg-surface-2 text-fg ring-1 ring-border hover:bg-surface-3 hover:ring-border-strong",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  outline: "text-fg ring-1 ring-border-strong hover:bg-surface-2",
  danger: "bg-loss/12 text-loss ring-1 ring-loss/25 hover:bg-loss/18",
  subtle: "bg-accent-soft text-accent hover:bg-accent/20",
};

const sizes: Record<Size, string> = {
  xs: "h-7 gap-1 rounded-lg px-2 text-xs",
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-xl px-5 text-[15px]",
  icon: "size-10 rounded-xl",
  "icon-sm": "size-8 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", asChild, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap transition-[background-color,box-shadow,color,filter,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
