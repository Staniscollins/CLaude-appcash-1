import { addDays, type DayKey } from "../dates";
import { SESSIONS, type SessionId } from "./catalog";

interface ZonedParts {
  day: DayKey;
  /** Minutes since local midnight (fractional). */
  minutes: number;
  weekday: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(epochMs: number, tz: string): ZonedParts {
  const parts = formatterFor(tz).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")) + Number(get("second")) / 60,
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** Epoch ms of a wall-clock time (`minutes` after midnight of `day`) in timezone `tz`. */
export function zonedTimeToEpoch(day: DayKey, minutes: number, tz: string): number {
  const [y, m, d] = [Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))];
  const naive = Date.UTC(y, m, d) + minutes * 60_000;
  let guess = naive;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, tz);
    const wallAsUtc = Date.UTC(Number(p.day.slice(0, 4)), Number(p.day.slice(5, 7)) - 1, Number(p.day.slice(8, 10))) + p.minutes * 60_000;
    const delta = wallAsUtc - naive;
    if (Math.abs(delta) < 1000) break;
    guess -= delta;
  }
  return guess;
}

export function isTradingDay(sessionId: SessionId, day: DayKey): boolean {
  if (SESSIONS[sessionId].everyDay) return true;
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return wd !== 0 && wd !== 6;
}

export function previousTradingDay(sessionId: SessionId, day: DayKey): DayKey {
  let d = addDays(day, -1);
  while (!isTradingDay(sessionId, d)) d = addDays(d, -1);
  return d;
}

export interface SessionState {
  state: "PRE" | "REGULAR" | "POST" | "CLOSED";
  /** Exchange-local calendar date. */
  localDay: DayKey;
  /** Most recent session that has opened. */
  lastSessionDay: DayKey;
  /** 0..1 progress of the last session (1 when finished). */
  progress: number;
}

export function sessionState(sessionId: SessionId, now: number): SessionState {
  const session = SESSIONS[sessionId];
  const { day, minutes } = zonedParts(now, session.tz);
  const trading = isTradingDay(sessionId, day);
  if (trading && minutes >= session.open) {
    const progress = Math.min(1, (minutes - session.open) / (session.close - session.open));
    const state = progress < 1 ? "REGULAR" : minutes < session.close + 4 * 60 ? "POST" : "CLOSED";
    return { state, localDay: day, lastSessionDay: day, progress };
  }
  return {
    state: trading ? "PRE" : "CLOSED",
    localDay: day,
    lastSessionDay: previousTradingDay(sessionId, day),
    progress: 1,
  };
}
