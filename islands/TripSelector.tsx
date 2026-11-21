import "../lib/temporal.ts";
import { useComputed, useSignal } from "@preact/signals";
import type { Leg, Travel, Trip } from "../lib/interrail.ts";
import { buildIcs } from "../lib/ics.ts";
import { findContinuations, mergeLegs } from "../lib/merge.ts";
import { Button } from "../components/Button.tsx";

const isTrain = (l: Leg) => l.kind === "train";
const trainKeys = (legs: Leg[]) => legs.filter(isTrain).map((l) => l.key);

function formatDay(date: string): string {
  return Temporal.PlainDate.from(date).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function TriCheckbox(props: { keys: string[]; selected: Set<string>; onChange: (checked: boolean) => void; label: string }) {
  const count = props.keys.filter((k) => props.selected.has(k)).length;
  const all = props.keys.length > 0 && count === props.keys.length;
  const some = count > 0 && !all;
  return (
    <input
      // `indeterminate` is a DOM property, not an attribute: set it from the ref
      // callback so it is applied in the same commit as `checked`.
      ref={(el) => {
        if (el) el.indeterminate = some;
      }}
      type="checkbox"
      aria-label={props.label}
      checked={all}
      disabled={props.keys.length === 0}
      onChange={(e) => props.onChange((e.currentTarget as HTMLInputElement).checked)}
    />
  );
}

export function TripSelector({ trip }: { trip: Trip }) {
  const allKeys = trip.travels.flatMap((t) => trainKeys(t.legs));
  const selected = useSignal<Set<string>>(new Set(allKeys));
  /** Legs that continue the same train as the previous leg. */
  const continuations = findContinuations(trip);
  /** Keys of continuing legs the user chose to merge into the previous leg's event. */
  const merged = useSignal<Set<string>>(new Set());
  const setMerged = (key: string, on: boolean) => {
    const next = new Set(merged.value);
    on ? next.add(key) : next.delete(key);
    merged.value = next;
  };

  const days = new Map<string, Travel[]>();
  for (const t of trip.travels) {
    const list = days.get(t.date) ?? [];
    list.push(t);
    days.set(t.date, list);
  }

  const setMany = (keys: string[], checked: boolean) => {
    const next = new Set(selected.value);
    for (const k of keys) checked ? next.add(k) : next.delete(k);
    selected.value = next;
  };

  const selectedLegs = useComputed(() =>
    trip.travels.flatMap((t) => t.legs).filter((l) => selected.value.has(l.key))
  );
  /** What ends up in the .ics: selected legs, with merged continuations folded in. */
  const events = useComputed(() => mergeLegs(selectedLegs.value, merged.value, continuations));

  const selectUpcoming = () => {
    const now = Temporal.Now.instant();
    bulkSelect(new Set(
      trip.travels
        .flatMap((t) => t.legs)
        .filter((l) => isTrain(l) && Temporal.Instant.compare(Temporal.Instant.from(l.depart), now) > 0)
        .map((l) => l.key),
    ));
  };

  const download = () => {
    const ics = buildIcs(trip, events.value);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${trip.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "trip"}.ics`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Days in which no train is selected. */
  const emptyDays = (sel: Set<string>) =>
    new Set([...days].filter(([, ts]) => !ts.some((t) => trainKeys(t.legs).some((k) => sel.has(k)))).map(([d]) => d));

  // Days with nothing selected start collapsed. Bulk selection changes (toolbar
  // buttons, day checkbox) re-apply that rule; toggling single legs doesn't, so a
  // day never snaps shut while you're picking trains inside it.
  const collapsed = useSignal<Set<string>>(emptyDays(selected.value));
  const bulkSelect = (next: Set<string>) => {
    selected.value = next;
    collapsed.value = emptyDays(next);
  };
  /** Day checkbox: deselecting a whole day collapses it, selecting expands it. */
  const selectDay = (date: string, keys: string[], checked: boolean) => {
    setMany(keys, checked);
    const next = new Set(collapsed.value);
    checked ? next.delete(date) : next.add(date);
    collapsed.value = next;
  };
  const toggleDay = (date: string) => {
    const next = new Set(collapsed.value);
    next.has(date) ? next.delete(date) : next.add(date);
    collapsed.value = next;
  };
  const allCollapsed = collapsed.value.size === days.size;

  const sel = selected.value;
  const n = events.value.length;

  return (
    <div class="selector">
      <div class="toolbar">
        <Button variant="secondary" onClick={() => bulkSelect(new Set(allKeys))}>All</Button>
        <Button variant="secondary" onClick={() => bulkSelect(new Set())}>None</Button>
        <Button variant="secondary" onClick={selectUpcoming}>Upcoming only</Button>
        <span class="toolbar-spacer" />
        <Button
          variant="secondary"
          onClick={() => (collapsed.value = allCollapsed ? new Set() : new Set(days.keys()))}
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </Button>
      </div>

      {[...days].map(([date, travels]) => {
        const dayKeys = travels.flatMap((t) => trainKeys(t.legs));
        const isCollapsed = collapsed.value.has(date);
        const bodyId = `day-${date}`;
        const selectedCount = dayKeys.filter((k) => sel.has(k)).length;
        return (
          <section class={`day${isCollapsed ? " collapsed" : ""}`} key={date}>
            <div class="day-header">
              <h2>
                <label>
                  <TriCheckbox keys={dayKeys} selected={sel} onChange={(c) => selectDay(date, dayKeys, c)} label={`Select ${date}`} />
                  {formatDay(date)}
                </label>
              </h2>
              <button
                type="button"
                class="collapse-toggle"
                aria-expanded={!isCollapsed}
                aria-controls={bodyId}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${formatDay(date)}`}
                onClick={() => toggleDay(date)}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
            {isCollapsed && (
              <p class="day-summary">
                {travels.map((t) => `${t.from} → ${t.to}`).join(", ")} · {selectedCount}/{dayKeys.length}{" "}
                train{dayKeys.length === 1 ? "" : "s"} selected
              </p>
            )}
            <div id={bodyId} hidden={isCollapsed}>
            {travels.map((travel) => {
              const keys = trainKeys(travel.legs);
              return (
                <div class="travel" key={travel.id}>
                  <h3>
                    <label>
                      <TriCheckbox keys={keys} selected={sel} onChange={(c) => setMany(keys, c)} label={`Select ${travel.from} to ${travel.to}`} />
                      {travel.from} → {travel.to}
                    </label>
                  </h3>
                  <ul class="legs">
                    {travel.legs.map((leg) => (
                      <li key={leg.key} class={`leg leg-${leg.kind}`}>
                        <label>
                          {isTrain(leg)
                            ? (
                              <input
                                type="checkbox"
                                checked={sel.has(leg.key)}
                                onChange={(e) => setMany([leg.key], (e.currentTarget as HTMLInputElement).checked)}
                              />
                            )
                            : <span class="leg-spacer" />}
                          <span class="leg-time">{leg.departLocal}–{leg.arriveLocal}</span>
                          <span class="leg-body">
                            <strong>{leg.title}</strong>{" "}
                            {leg.kind === "checkin" ? leg.from.name : `${leg.from.name} → ${leg.to.name}`}
                            {(leg.departureTrack || leg.operator || leg.separateTicket) && (
                              <span class="leg-meta">
                                {leg.departureTrack && `Platform ${leg.departureTrack}`}
                                {leg.departureTrack && leg.operator && " · "}
                                {leg.operator}
                                {leg.separateTicket && " · separate ticket"}
                              </span>
                            )}
                          </span>
                        </label>
                        {continuations.has(leg.key) && (() => {
                          const prev = continuations.get(leg.key)!;
                          const enabled = sel.has(leg.key) && sel.has(prev.key);
                          return (
                            <label
                              class="merge-toggle"
                              title={enabled ? undefined : "Select both legs to merge them"}
                            >
                              <input
                                type="checkbox"
                                checked={enabled && merged.value.has(leg.key)}
                                disabled={!enabled}
                                onChange={(e) => setMerged(leg.key, (e.currentTarget as HTMLInputElement).checked)}
                              />
                              Same event as {prev.title} from {prev.from.name} ({prev.departLocal})
                            </label>
                          );
                        })()}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            </div>
          </section>
        );
      })}

      <div class="download-bar">
        <Button onClick={download} disabled={n === 0}>
          Download .ics ({n} event{n === 1 ? "" : "s"})
        </Button>
      </div>
    </div>
  );
}
