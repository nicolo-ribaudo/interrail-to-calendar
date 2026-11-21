import { handler, page } from "./$trip.ts";
import { fetchTrip, parseShareUrl, ShareLinkError, type Trip } from "../lib/interrail.ts";
import { LinkForm } from "../components/LinkForm.tsx";
import { TripSelector } from "../islands/TripSelector.tsx";

type Data = { input: string; trip?: Trip; error?: string };

export const handlers = handler({
  async GET(ctx): Promise<{ data: Data } | Response> {
    const input = ctx.url.searchParams.get("url") ?? "";
    if (!input.trim()) return Response.redirect(new URL("/", ctx.url), 303);
    try {
      const { id, brand } = parseShareUrl(input);
      return { data: { input, trip: await fetchTrip(id, brand) } };
    } catch (err) {
      const message = err instanceof ShareLinkError ? err.message : "Couldn't load the trip. Please try again.";
      if (!(err instanceof ShareLinkError)) console.error(err);
      return { data: { input, error: message } };
    }
  },
});

function formatRange(trip: Trip): string {
  const dates = trip.travels.map((t) => t.date).sort();
  if (dates.length === 0) return "";
  const fmt = (d: string) =>
    Temporal.PlainDate.from(d).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const first = fmt(dates[0]);
  const last = fmt(dates[dates.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

export default page(function TripPage({ data }) {
  const { input, trip, error } = data as Data;
  return (
    <main>
      <p class="back"><a href="/">← Another trip</a></p>
      {error || !trip
        ? (
          <>
            <h1>Couldn't load trip</h1>
            <p class="error">{error}</p>
            <LinkForm value={input} />
          </>
        )
        : (
          <>
            <h1>{trip.name}</h1>
            <p class="muted">{formatRange(trip)} · {trip.travels.length} travel{trip.travels.length === 1 ? "" : "s"}</p>
            <TripSelector trip={trip} />
          </>
        )}
    </main>
  );
});
