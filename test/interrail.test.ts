import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSharePage, parseShareUrl, ShareLinkError } from "../lib/interrail.ts";
import { buildIcs, escapeText, foldLine } from "../lib/ics.ts";

const html = readFileSync(new URL("./fixtures/share-trip.html", import.meta.url), "utf8");
const trip = parseSharePage(html, "CD6B5770-E5A3-11F1-BCA5-63D0A5D6E0F7");

describe("parseShareUrl", () => {
  it("accepts share links, with or without surrounding text", () => {
    const id = "CD6B5770-E5A3-11F1-BCA5-63D0A5D6E0F7";
    expect(parseShareUrl(`https://eurailapp.com/share/trip?id=${id}&type=list&brand=interrail`)).toEqual({ id, brand: "interrail" });
    expect(parseShareUrl(`Look at my trip! https://eurailapp.com/share/trip?id=${id.toLowerCase()}&brand=eurail`)).toEqual({ id, brand: "eurail" });
    expect(parseShareUrl(id)).toEqual({ id, brand: "interrail" });
  });
  describe("text shared by the app", () => {
    const id = "CD6B5770-E5A3-11F1-BCA5-63D0A5D6E0F7";
    const url = `https://eurailapp.com/share/trip?id=${id}&type=list&brand=interrail`;
    const cases: Record<string, string> = {
      "as shared": `Check out my European rail trip: ${url}`,
      "with surrounding whitespace": `  Check out my European rail trip: ${url}\n`,
      "in angle brackets": `<${url}>`,
    };
    for (const [name, text] of Object.entries(cases)) {
      it(name, () => expect(parseShareUrl(text)).toEqual({ id, brand: "interrail" }));
    }
  });

  it("rejects other hosts and bad ids", () => {
    expect(() => parseShareUrl("https://evil.example/share/trip?id=CD6B5770-E5A3-11F1-BCA5-63D0A5D6E0F7")).toThrow(ShareLinkError);
    expect(() => parseShareUrl("https://eurailapp.com/share/trip?id=../../x")).toThrow(ShareLinkError);
    expect(() => parseShareUrl("hello")).toThrow(ShareLinkError);
  });
});

describe("parseSharePage", () => {
  it("extracts travels and legs", () => {
    expect(trip.name).toBe("Test trip");
    expect(trip.travels.map((t) => [t.date, t.from, t.to])).toEqual([
      ["2026-12-24", "Amsterdam Centraal", "Milano Centrale"],
      ["2027-01-06", "Lyon Perrache", "Edinburgh"],
    ]);
    expect(trip.travels[0].legs.map((l) => [l.kind, l.title])).toEqual([
      ["train", "ICE 121"],
      ["train", "ICE 915"],
      ["train", "IC 187"],
      ["train", "EC 29"],
    ]);
    expect(trip.travels[1].legs.map((l) => l.kind)).toEqual(["train", "transfer", "checkin", "train", "transfer", "train"]);
  });

  it("converts station-local times to UTC", () => {
    const ice = trip.travels[0].legs[0];
    expect(ice.depart).toBe("2026-12-24T05:38:00Z");
    expect(ice.from.timeZone).toBe("Europe/Amsterdam");
    expect(ice.departureTrack).toBe("7b");

    const eurostar = trip.travels[1].legs[3];
    expect(eurostar.title).toBe("ES 9133");
    expect(eurostar.depart).toBe("2027-01-06T12:35:00Z"); // 13:35 Lille (CET)
    expect(eurostar.arrive).toBe("2027-01-06T13:57:00Z"); // 13:57 London (GMT)
  });

  it("rolls over midnight for overnight legs", () => {
    const night = structuredClone(JSON.parse(html.match(/payload = (\{.*?\});?\s*\n/s)![1]));
    const leg = JSON.parse(night.travels[0].legs[3].infoJson);
    leg.startTime = { hours: 23, minutes: 30, offset: 0 };
    leg.endTime = { hours: 7, minutes: 10, offset: 0 };
    night.travels[0].legs[3].infoJson = JSON.stringify(leg);
    const page = html.replace(/payload = \{.*?\};?\s*\n/s, `payload = ${JSON.stringify(night)}\n`);
    const ec = parseSharePage(page, "x").travels[0].legs[3];
    expect(ec.depart).toBe("2026-12-24T22:30:00Z");
    expect(ec.arrive).toBe("2026-12-25T06:10:00Z");
  });
});

describe("ics", () => {
  it("escapes and folds", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const folded = foldLine("X".repeat(80) + "€".repeat(30));
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join("")).toBe("X".repeat(80) + "€".repeat(30));
  });

  it("builds a calendar for train legs", () => {
    const legs = trip.travels.flatMap((t) => t.legs).filter((l) => l.kind === "train");
    const ics = buildIcs(trip, legs, Temporal.Instant.from("2026-11-21T12:00:00Z"));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(7);
    expect(ics).toContain("DTSTART:20261224T053800Z");
    expect(ics).toContain("DTEND:20270106T135700Z");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics).toMatchSnapshot();
  });
});
