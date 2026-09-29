"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useCallback, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLMotionProps<"div"> {
  spotlight?: boolean;
  padded?: boolean;
}

/** Surface card with a cursor-following glow on its border. */
export function Card({ className, spotlight = true, padded = true, children, onPointerMove, ...props }: CardProps) {
  const handleMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (spotlight) {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
      }
      onPointerMove?.(e);
    },
    [spotlight, onPointerMove],
  );
  return (
    <motion.div
      variants={cardVariants}
      className={cn("card relative min-w-0", spotlight && "spotlight", padded && "p-5 sm:p-6", className)}
      onPointerMove={handleMove}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export const cardVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 28 } },
};

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted ring-1 ring-border">{icon}</span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** Container that staggers the entrance of its Card children. */
export function Stagger({ className, children, delay = 0 }: { className?: string; children: ReactNode; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div className={className} variants={cardVariants}>
      {children}
    </motion.div>
  );
}
