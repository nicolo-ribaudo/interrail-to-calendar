import { describe, expect, it } from "vitest";
import type { Leg, Trip } from "../lib/interrail.ts";
import { findContinuations, mergeLegs } from "../lib/merge.ts";
import { buildIcs } from "../lib/ics.ts";

const station = (name: string, country = "Switzerland") => ({
  name,
  country,
  timeZone: country === "Italy" ? "Europe/Rome" : "Europe/Zurich",
});

function leg(key: string, title: string, from: string, to: string, depart: string, arrive: string, extra: Partial<Leg> = {}): Leg {
  const local = (iso: string) => Temporal.Instant.from(iso).toZonedDateTimeISO("Europe/Zurich").toPlainTime().toString().slice(0, 5);
  return {
    key,
    kind: "train",
    title,
    from: station(from),
    to: station(to, to.startsWith("Milano") ? "Italy" : "Switzerland"),
    depart,
    arrive,
    departLocal: local(depart),
    arriveLocal: local(arrive),
    departDate: depart.slice(0, 10),
    separateTicket: false,
    ...extra,
  };
}

// Modeled on a real trip: EC 11 Arth-Goldau → Chiasso and Chiasso → Milano Centrale, planned as two travels.
const ec11a = leg("t1-0", "EC 11", "Arth-Goldau", "Chiasso", "2026-12-04T06:18:00Z", "2026-12-04T07:55:00Z", { departureTrack: "3", arrivalTrack: "1" });
const ec11b = leg("t2-0", "EC 11", "Chiasso", "Milano Centrale", "2026-12-04T08:02:00Z", "2026-12-04T08:50:00Z", { departureTrack: "1" });
const re = leg("t3-0", "RE 25510", "Milano Centrale", "Chiasso", "2026-12-05T08:00:00Z", "2026-12-05T08:50:00Z");
// Same train number, but a different day: not a continuation.
const ec11c = leg("t4-0", "EC 11", "Chiasso", "Milano Centrale", "2026-12-06T08:02:00Z", "2026-12-06T08:50:00Z");

const trip: Trip = {
  id: "X",
  name: "Merge test",
  brand: "interrail",
  travels: [
    { id: "t1", date: "2026-12-04", from: "Arth-Goldau", to: "Chiasso", legs: [ec11a] },
    { id: "t2", date: "2026-12-04", from: "Chiasso", to: "Milano Centrale", legs: [ec11b] },
    { id: "t3", date: "2026-12-05", from: "Milano Centrale", to: "Chiasso", legs: [re] },
    { id: "t4", date: "2026-12-06", from: "Chiasso", to: "Milano Centrale", legs: [ec11c] },
  ],
};

describe("findContinuations", () => {
  it("finds the same train continuing from where the previous leg arrived", () => {
    const c = findContinuations(trip);
    expect([...c].map(([k, prev]) => [k, prev.key])).toEqual([["t2-0", "t1-0"]]);
  });

  it("ignores the same train name with a long gap or at another station", () => {
    const late = { ...ec11b, key: "late", depart: "2026-12-04T09:30:00Z" };
    const elsewhere = { ...ec11b, key: "elsewhere", from: station("Lugano") };
    for (const l of [late, elsewhere]) {
      const t = { ...trip, travels: [trip.travels[0], { ...trip.travels[1], legs: [l] }] };
      expect(findContinuations(t).size).toBe(0);
    }
  });
});

describe("mergeLegs", () => {
  const c = findContinuations(trip);
  const all = [ec11b, ec11a, re, ec11c];

  it("keeps legs separate unless merging is turned on", () => {
    expect(mergeLegs(all, new Set(), c).map((l) => l.key)).toEqual(["t1-0", "t2-0", "t3-0", "t4-0"]);
  });

  it("merges a continuation into the previous leg", () => {
    const out = mergeLegs(all, new Set(["t2-0"]), c);
    expect(out.map((l) => l.key)).toEqual(["t1-0+t2-0", "t3-0", "t4-0"]);
    expect(out[0]).toMatchObject({
      title: "EC 11",
      from: { name: "Arth-Goldau" },
      to: { name: "Milano Centrale" },
      depart: "2026-12-04T06:18:00Z",
      arrive: "2026-12-04T08:50:00Z",
      departureTrack: "3",
      arrivalTrack: undefined,
    });
    const ics = buildIcs(trip, out, Temporal.Instant.from("2026-11-21T12:00:00Z"));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("SUMMARY:🚆 EC 11 Arth-Goldau → Milano Centrale");
    expect(ics).toContain("DTSTART:20261204T061800Z\r\nDTEND:20261204T085000Z");
  });

  it("doesn't merge when the previous leg isn't selected", () => {
    expect(mergeLegs([ec11b, re], new Set(["t2-0"]), c).map((l) => l.key)).toEqual(["t2-0", "t3-0"]);
  });

  it("merges chains into a single leg", () => {
    const ec11d = leg("t2-1", "EC 11", "Milano Centrale", "Milano Rogoredo", "2026-12-04T08:55:00Z", "2026-12-04T09:05:00Z");
    const t = { ...trip, travels: [...trip.travels, { id: "t5", date: "2026-12-04", from: "Milano Centrale", to: "Milano Rogoredo", legs: [ec11d] }] };
    const out = mergeLegs([ec11a, ec11b, ec11d], new Set(["t2-0", "t2-1"]), findContinuations(t));
    expect(out.map((l) => [l.key, l.from.name, l.to.name])).toEqual([["t1-0+t2-0+t2-1", "Arth-Goldau", "Milano Rogoredo"]]);
  });
});
