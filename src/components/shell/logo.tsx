import { cn } from "@/lib/utils";

export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id="lumen-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a397ff" />
          <stop offset="55%" stopColor="#6a5cf0" />
          <stop offset="100%" stopColor="#3987e5" />
        </linearGradient>
        <radialGradient id="lumen-r" cx="0.75" cy="0.25" r="0.6">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lumen-g)" />
      <rect width="32" height="32" rx="9" fill="url(#lumen-r)" />
      <path
        d="M7 21.5 L12.5 16 L16.5 19 L24.5 10.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.5" cy="10.5" r="2.4" fill="#fff" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && <span className="text-[17px] font-semibold tracking-tight text-fg">Lumen</span>}
    </span>
  );
}
