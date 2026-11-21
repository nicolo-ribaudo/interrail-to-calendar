import "./temporal.ts";
import type { Leg, Trip } from "./interrail.ts";

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** Instant (or ISO instant string) → iCalendar UTC DATE-TIME, e.g. "20261224T053800Z". */
function icsUtc(instant: Temporal.Instant | string): string {
  const t = Temporal.Instant.from(instant).toZonedDateTimeISO("UTC");
  return `${pad(t.year, 4)}${pad(t.month)}${pad(t.day)}T${pad(t.hour)}${pad(t.minute)}${pad(t.second)}Z`;
}

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold a content line to ≤75 octets (RFC 5545 §3.1), without splitting UTF-8 sequences. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curLen + len > limit) {
      parts.push(cur);
      cur = "";
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

function describe(leg: Leg, trip: Trip): string {
  const lines = [
    `${leg.title}: ${leg.from.name} ${leg.departLocal} → ${leg.to.name} ${leg.arriveLocal}`,
  ];
  if (leg.direction) lines.push(`Direction: ${leg.direction}`);
  if (leg.departureTrack) lines.push(`Departure platform: ${leg.departureTrack}`);
  if (leg.arrivalTrack) lines.push(`Arrival platform: ${leg.arrivalTrack}`);
  if (leg.operator) lines.push(`Operator: ${leg.operator}`);
  if (leg.separateTicket) lines.push("⚠️ Separate ticket required");
  lines.push("", `Trip: ${trip.name}`);
  return lines.join("\n");
}

export function buildIcs(trip: Trip, legs: Leg[], now: Temporal.Instant = Temporal.Now.instant()): string {
  const stamp = icsUtc(now);
  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//interrail-to-calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(trip.name)}`,
  ];
  for (const leg of legs) {
    const location = leg.departureTrack ? `${leg.from.name}, platform ${leg.departureTrack}` : leg.from.name;
    out.push(
      "BEGIN:VEVENT",
      `UID:${leg.key}@interrail-to-calendar`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsUtc(leg.depart)}`,
      `DTEND:${icsUtc(leg.arrive)}`,
      `SUMMARY:${escapeText(`🚆 ${leg.title} ${leg.from.name} → ${leg.to.name}`)}`,
      `LOCATION:${escapeText(location)}`,
      `DESCRIPTION:${escapeText(describe(leg, trip))}`,
    );
    if (leg.from.lat != null && leg.from.lon != null) out.push(`GEO:${leg.from.lat};${leg.from.lon}`);
    out.push("TRANSP:OPAQUE", "END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.map(foldLine).join("\r\n") + "\r\n";
}
