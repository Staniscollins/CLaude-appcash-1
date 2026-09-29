"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Tooltip } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { PortfolioProvider } from "@/components/portfolio/portfolio-provider";
import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import { useAppStore } from "@/lib/store";

function resolveTheme(pref: string): "dark" | "light" {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Mirrors theme, privacy and colour settings onto <html> data attributes. */
function DocumentSettings() {
  const theme = useAppStore((s) => s.settings.theme);
  const privacy = useAppStore((s) => s.settings.privacy);
  const colorblind = useAppStore((s) => s.settings.colorblind);
  const hydrated = useAppStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    const apply = () => root.setAttribute("data-theme", resolveTheme(theme));
    apply();
    root.setAttribute("data-privacy", privacy ? "on" : "off");
    root.setAttribute("data-cvd", colorblind ? "on" : "off");
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, privacy, colorblind, hydrated]);

  return null;
}

function ThemedToaster() {
  const resolved = useResolvedTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          background: "var(--surface-3)",
          color: "var(--fg)",
          border: "1px solid var(--border-strong)",
          borderRadius: "14px",
          boxShadow: "var(--shadow-pop)",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 30_000 },
        },
      }),
  );

  useEffect(() => {
    void useAppStore.persist.rehydrate();
  }, []);

  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 34 }}>
        <Tooltip.Provider delayDuration={250} skipDelayDuration={150}>
          <DocumentSettings />
          <PortfolioProvider>{children}</PortfolioProvider>
          <ThemedToaster />
        </Tooltip.Provider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
