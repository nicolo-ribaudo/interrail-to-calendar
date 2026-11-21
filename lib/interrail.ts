import { countryToTimeZone, offsetZoneFrom, toInstant } from "./timezones.ts";

// ---------- Normalized, serializable types (passed to islands) ----------

export interface Station {
  name: string;
  country: string;
  timeZone: string;
  lat?: number;
  lon?: number;
}

export type LegKind = "train" | "transfer" | "checkin";

export interface Leg {
  /** Stable key: `${travelId}-${index}` */
  key: string;
  kind: LegKind;
  /** e.g. "ICE 121" */
  title: string;
  operator?: string;
  from: Station;
  to: Station;
  /** UTC instants, ISO strings */
  depart: string;
  arrive: string;
  /** Local wall-clock "HH:MM" for display */
  departLocal: string;
  arriveLocal: string;
  /** Local departure date "YYYY-MM-DD" */
  departDate: string;
  departureTrack?: string;
  arrivalTrack?: string;
  direction?: string;
  separateTicket: boolean;
}

export interface Travel {
  id: string;
  /** Local date "YYYY-MM-DD" */
  date: string;
  from: string;
  to: string;
  legs: Leg[];
}

export interface Trip {
  id: string;
  name: string;
  brand: string;
  travels: Travel[];
}

// ---------- Raw payload types ----------

interface RawTime {
  hours: number;
  minutes: number;
  offset?: number;
}
interface RawStation {
  name: string;
  country: string;
  stationId?: number;
  coordinates?: { latitude: number; longitude: number };
}
interface RawLegInfo {
  /** Missing on trains the user inserted manually in the app (those have `dataSource: 0`). */
  type?: string;
  trainName?: string;
  transportType?: string;
  startTime: RawTime;
  endTime: RawTime;
  departureTrack?: string;
  arrivalTrack?: string;
  directionStation?: string;
  operator?: { admin?: string; adminName?: string };
  trainStopStations?: RawStation[];
  isSeparateTicket?: boolean;
}
interface RawTravel {
  id: string;
  date: string;
  from: string;
  to: string;
  infoJson: string;
  optionsJson: string;
  legs: { sortOrder: number; infoJson: string }[];
}
interface RawPayload {
  name: string;
  brand?: string;
  travels: RawTravel[];
}

// ---------- Share URL handling ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_HOSTS = new Set(["eurailapp.com", "www.eurailapp.com", "share.eurailapp.com"]);

export class ShareLinkError extends Error {}

export function parseShareUrl(input: string): { id: string; brand: string } {
  const trimmed = input.trim();
  if (UUID_RE.test(trimmed)) return { id: trimmed.toUpperCase(), brand: "interrail" };

  // The app shares text like "Check out my European rail trip: https://..." — pick out the URL.
  const match = trimmed.match(/https?:\/\/[^\s<>"']+/);
  let url: URL;
  try {
    url = new URL(match ? match[0] : trimmed);
  } catch {
    throw new ShareLinkError("That doesn't look like a link.");
  }
  if (!ALLOWED_HOSTS.has(url.hostname) || !url.pathname.startsWith("/share/trip")) {
    throw new ShareLinkError("Expected a https://eurailapp.com/share/trip?id=… link.");
  }
  const id = url.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) throw new ShareLinkError("The link has no valid trip id.");
  const brand = url.searchParams.get("brand") === "eurail" ? "eurail" : "interrail";
  return { id: id.toUpperCase(), brand };
}

export function shareUrlFor(id: string, brand: string): string {
  const u = new URL("https://eurailapp.com/share/trip");
  u.searchParams.set("id", id);
  u.searchParams.set("type", "list");
  u.searchParams.set("brand", brand);
  return u.href;
}

// ---------- Fetch + parse ----------

const cache = new Map<string, { at: number; trip: Trip }>();
const CACHE_TTL_MS = 5 * 60_000;

export async function fetchTrip(id: string, brand: string): Promise<Trip> {
  const hit = cache.get(id);
  if (hit && Temporal.Now.instant().epochMilliseconds - hit.at < CACHE_TTL_MS) return hit.trip;

  const res = await fetch(shareUrlFor(id, brand), {
    headers: { "Accept": "text/html" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new ShareLinkError(`Rail Planner returned HTTP ${res.status}.`);
  const trip = parseSharePage(await res.text(), id);
  cache.set(id, { at: Temporal.Now.instant().epochMilliseconds, trip });
  return trip;
}

export function extractPayload(html: string): RawPayload {
  const m = html.match(/\bpayload\s*=\s*(\{.*?\})\s*;?\s*\n/s);
  if (!m) throw new ShareLinkError("Couldn't find trip data in the shared page (is the trip still shared?).");
  try {
    return JSON.parse(m[1]);
  } catch {
    throw new ShareLinkError("The shared page contained malformed trip data.");
  }
}

export function parseSharePage(html: string, id: string): Trip {
  return normalizePayload(extractPayload(html), id);
}

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (t: RawTime) => `${pad(t.hours)}:${pad(t.minutes)}`;

function legKind(type: string | undefined): LegKind {
  // Manually inserted trains have no `type` at all.
  if (type === undefined || type === "TRAIN_TRAVEL") return "train";
  if (type === "CHKI") return "checkin";
  return "transfer";
}

export function normalizePayload(payload: RawPayload, id: string): Trip {
  const travels = payload.travels.map(normalizeTravel);
  travels.sort((a, b) => a.date.localeCompare(b.date) || (a.legs[0]?.depart ?? "").localeCompare(b.legs[0]?.depart ?? ""));
  return { id, name: payload.name || "Interrail trip", brand: payload.brand ?? "interrail", travels };
}

function normalizeTravel(raw: RawTravel): Travel {
  const info = JSON.parse(raw.infoJson) as { date?: { day: number; month: number; year: number }; departureTime?: RawTime };
  const options = JSON.parse(raw.optionsJson) as { dateSince1970?: number };

  const startDate = info.date
    ? Temporal.PlainDate.from({ year: info.date.year, month: info.date.month, day: info.date.day })
    : Temporal.PlainDate.from(raw.date.slice(0, 10));

  // Fallback zone for unknown countries: offset implied by the first departure.
  let fallbackZone = "UTC";
  if (options.dateSince1970 && info.departureTime) {
    fallbackZone = offsetZoneFrom(options.dateSince1970, {
      year: startDate.year,
      month: startDate.month,
      day: startDate.day,
      hour: info.departureTime.hours,
      minute: info.departureTime.minutes,
    });
  }
  const zoneFor = (s: RawStation | undefined) => {
    const z = s && countryToTimeZone(s.country);
    if (!z && s) console.warn(`[interrail] unknown country "${s.country}", using ${fallbackZone}`);
    return z ?? fallbackZone;
  };
  const station = (s: RawStation | undefined, fallbackName: string): Station => ({
    name: s?.name ?? fallbackName,
    country: s?.country ?? "",
    timeZone: zoneFor(s),
    lat: s?.coordinates?.latitude,
    lon: s?.coordinates?.longitude,
  });

  const rawLegs = [...raw.legs].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => JSON.parse(l.infoJson) as RawLegInfo);

  // Walk legs chronologically, rolling the date forward when local time goes backwards.
  // We compare in UTC to avoid false rollovers when crossing into an earlier time zone.
  let date = startDate;
  let lastInstant: Temporal.Instant | undefined;

  const legs: Leg[] = rawLegs.map((li, index) => {
    const stops = li.trainStopStations ?? [];
    const from = station(stops[0], raw.from);
    const to = station(stops[stops.length - 1], raw.to);

    let depart = toInstant(date, li.startTime, from.timeZone);
    // Roll over if this departure is clearly before the previous arrival (more than 3h earlier).
    if (lastInstant && Temporal.Instant.compare(depart.add({ hours: 3 }), lastInstant) < 0) {
      date = date.add({ days: 1 });
      depart = toInstant(date, li.startTime, from.timeZone);
    }
    const departDate = date;

    let arrive = toInstant(date, li.endTime, to.timeZone);
    while (Temporal.Instant.compare(arrive, depart) < 0) {
      date = date.add({ days: 1 });
      arrive = toInstant(date, li.endTime, to.timeZone);
    }
    lastInstant = arrive;

    const kind = legKind(li.type);
    const title = li.trainName?.trim() ||
      li.transportType?.trim() ||
      (kind === "checkin" ? "Check-in" : kind === "transfer" ? "Transfer" : "Train");

    return {
      key: `${raw.id}-${index}`,
      kind,
      title,
      operator: li.operator?.adminName || undefined,
      from,
      to,
      depart: depart.toString(),
      arrive: arrive.toString(),
      departLocal: hm(li.startTime),
      arriveLocal: hm(li.endTime),
      departDate: departDate.toString(),
      departureTrack: li.departureTrack || undefined,
      arrivalTrack: li.arrivalTrack || undefined,
      direction: li.directionStation || undefined,
      separateTicket: !!li.isSeparateTicket,
    };
  });

  return { id: raw.id, date: startDate.toString(), from: raw.from, to: raw.to, legs };
}
