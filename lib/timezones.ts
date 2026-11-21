/**
 * Map from the English country names used in Rail Planner payloads to IANA
 * time zones. Covers Interrail/Eurail countries plus common neighbours.
 */
const COUNTRY_TIME_ZONES: Record<string, string> = {
  "Albania": "Europe/Tirane",
  "Austria": "Europe/Vienna",
  "Belgium": "Europe/Brussels",
  "Bosnia and Herzegovina": "Europe/Sarajevo",
  "Bosnia-Herzegovina": "Europe/Sarajevo",
  "Bulgaria": "Europe/Sofia",
  "Croatia": "Europe/Zagreb",
  "Czech Republic": "Europe/Prague",
  "Czechia": "Europe/Prague",
  "Denmark": "Europe/Copenhagen",
  "Estonia": "Europe/Tallinn",
  "Finland": "Europe/Helsinki",
  "France": "Europe/Paris",
  "Germany": "Europe/Berlin",
  "Great Britain": "Europe/London",
  "Greece": "Europe/Athens",
  "Hungary": "Europe/Budapest",
  "Ireland": "Europe/Dublin",
  "Republic of Ireland": "Europe/Dublin",
  "Italy": "Europe/Rome",
  "Kosovo": "Europe/Belgrade",
  "Latvia": "Europe/Riga",
  "Liechtenstein": "Europe/Vaduz",
  "Lithuania": "Europe/Vilnius",
  "Luxembourg": "Europe/Luxembourg",
  "Monaco": "Europe/Monaco",
  "Montenegro": "Europe/Podgorica",
  "Netherlands": "Europe/Amsterdam",
  "North Macedonia": "Europe/Skopje",
  "Northern Ireland": "Europe/London",
  "Norway": "Europe/Oslo",
  "Poland": "Europe/Warsaw",
  "Portugal": "Europe/Lisbon",
  "Romania": "Europe/Bucharest",
  "San Marino": "Europe/San_Marino",
  "Serbia": "Europe/Belgrade",
  "Slovakia": "Europe/Bratislava",
  "Slovenia": "Europe/Ljubljana",
  "Spain": "Europe/Madrid",
  "Sweden": "Europe/Stockholm",
  "Switzerland": "Europe/Zurich",
  "Turkey": "Europe/Istanbul",
  "Türkiye": "Europe/Istanbul",
  "Ukraine": "Europe/Kyiv",
  "United Kingdom": "Europe/London",
  "Moldova": "Europe/Chisinau",
  "Andorra": "Europe/Andorra",
};

export function countryToTimeZone(country: string): string | undefined {
  return COUNTRY_TIME_ZONES[country.trim()];
}

/** Fixed-offset zone (e.g. "+01:00") from an epoch ms and the local wall time it represents. */
export function offsetZoneFrom(
  epochMs: number,
  local: { year: number; month: number; day: number; hour: number; minute: number },
): string {
  const asUtc = Temporal.PlainDateTime.from(local).toZonedDateTime("UTC").epochMilliseconds;
  const offsetMin = Math.round((asUtc - epochMs) / 60_000);
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function toInstant(
  date: Temporal.PlainDate,
  time: { hours: number; minutes: number },
  timeZone: string,
): Temporal.Instant {
  return date
    .toPlainDateTime({ hour: time.hours, minute: time.minutes })
    .toZonedDateTime(timeZone, { disambiguation: "compatible" })
    .toInstant();
}
