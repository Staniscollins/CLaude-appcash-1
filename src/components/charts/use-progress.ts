"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-resolved-theme";

/** Linear 0→1 progress restarted whenever `signature` changes (1 with reduced motion). */
export function useProgress(signature: string, duration = 800) {
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState({ sig: "", t: 0 });
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      setState({ sig: signature, t });
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [signature, duration, reduced]);
  if (reduced) return 1;
  return state.sig === signature ? state.t : 0;
}
