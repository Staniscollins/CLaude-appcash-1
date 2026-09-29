"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/** Animated modal: bottom sheet on phones, centered card on larger screens. */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md", className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[6px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </RadixDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
              <RadixDialog.Content asChild forceMount>
                <motion.div
                  className={cn(
                    "pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-[var(--shadow-pop)] ring-1 ring-border-strong sm:rounded-3xl",
                    widths[size],
                    className,
                  )}
                  initial={{ opacity: 0, y: 40, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                >
                  <div className="flex items-start justify-between gap-4 border-b border-border px-5 pt-5 pb-4 sm:px-6">
                    <div className="min-w-0">
                      <RadixDialog.Title className="text-base font-semibold tracking-tight text-fg">{title}</RadixDialog.Title>
                      {description ? (
                        <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
                      ) : (
                        <RadixDialog.Description className="sr-only">
                          {typeof title === "string" ? title : "Boîte de dialogue"}
                        </RadixDialog.Description>
                      )}
                    </div>
                    <RadixDialog.Close
                      className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg"
                      aria-label="Fermer"
                    >
                      <X className="size-4" />
                    </RadixDialog.Close>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin sm:px-6">{children}</div>
                  {footer && (
                    <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-elev/60 px-5 py-4 sm:px-6">
                      {footer}
                    </div>
                  )}
                </motion.div>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
