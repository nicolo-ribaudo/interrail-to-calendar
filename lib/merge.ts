import "./temporal.ts";
import type { Leg, Trip } from "./interrail.ts";

/** Longest stop at the shared station for two legs to still count as the same train. */
const MAX_STOP_MINUTES = 60;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const byDeparture = (a: Leg, b: Leg) => Temporal.Instant.compare(a.depart, b.depart);

/**
 * Finds train legs that continue the train right before them: same train name, departing
 * from the station where the previous leg arrived, shortly after it arrived. This happens
 * e.g. when one train ride is split over two travels (Arth-Goldau → Chiasso → Milano on EC 11).
 *
 * Returns a map from the continuing leg's key to the leg it continues.
 */
export function findContinuations(trip: Trip): Map<string, Leg> {
  const trains = trip.travels.flatMap((t) => t.legs).filter((l) => l.kind === "train").sort(byDeparture);
  const result = new Map<string, Leg>();
  for (let i = 1; i < trains.length; i++) {
    const prev = trains[i - 1];
    const leg = trains[i];
    if (!norm(leg.title) || norm(leg.title) !== norm(prev.title)) continue;
    if (norm(leg.from.name) !== norm(prev.to.name)) continue;
    const stop = Temporal.Instant.from(prev.arrive).until(leg.depart).total("minutes");
    if (stop < 0 || stop > MAX_STOP_MINUTES) continue;
    result.set(leg.key, prev);
  }
  return result;
}

/** One leg covering `a` followed by `b` (same train). */
function combine(a: Leg, b: Leg): Leg {
  return {
    ...a,
    key: `${a.key}+${b.key}`,
    to: b.to,
    arrive: b.arrive,
    arriveLocal: b.arriveLocal,
    arrivalTrack: b.arrivalTrack,
    direction: b.direction ?? a.direction,
    operator: a.operator ?? b.operator,
    separateTicket: a.separateTicket || b.separateTicket,
  };
}

/**
 * Sorts `legs` by departure and folds every leg whose key is in `merged` into the leg it
 * continues (per `continuations`), when that one is selected too. Chains merge into one leg.
 */
export function mergeLegs(legs: Leg[], merged: Set<string>, continuations: Map<string, Leg>): Leg[] {
  const out: Leg[] = [];
  let lastKey: string | undefined; // key of the last original leg folded into out.at(-1)
  for (const leg of [...legs].sort(byDeparture)) {
    if (merged.has(leg.key) && lastKey !== undefined && continuations.get(leg.key)?.key === lastKey) {
      out[out.length - 1] = combine(out[out.length - 1], leg);
    } else {
      out.push(leg);
    }
    lastKey = leg.key;
  }
  return out;
}
