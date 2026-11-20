// Turns a raw MTA Bus Time SIRI StopMonitoring response (v1 or v2) into a small, flat shape.
const first = (v) => (Array.isArray(v) ? v[0] : v);
const text = (v) => {
  v = first(v);
  if (v == null) return null;
  if (typeof v === "object") return v.value ?? v._ ?? null;
  return String(v);
};

const clean = (s) =>
  s == null ? null : s.replace(/<\/p>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[\u200b-\u200d]/g, "").replace(/\n{3,}/g, "\n\n").trim();

export function normalize(raw, now = Date.now()) {
  const sd = raw?.Siri?.ServiceDelivery ?? {};
  const smd = first(sd.StopMonitoringDelivery) ?? {};
  const error = smd.ErrorCondition?.Description || smd.ErrorCondition?.OtherError?.ErrorText || null;
  const visits = smd.MonitoredStopVisit ?? [];

  let stopName = null;
  const buses = visits.map((v) => {
    const j = v.MonitoredVehicleJourney ?? {};
    const c = j.MonitoredCall ?? {};
    const d = c.Extensions?.Distances ?? {};
    stopName ??= text(c.StopPointName);
    const expected = c.ExpectedArrivalTime || c.ExpectedDepartureTime || null;
    const minutes = expected ? Math.max(0, Math.round((Date.parse(expected) - now) / 60000)) : null;
    const meters = c.DistanceFromStop ?? d.DistanceFromCall ?? null;
    return {
      route: text(j.PublishedLineName),
      destination: text(j.DestinationName),
      minutes,
      proximity: c.ArrivalProximityText ?? d.PresentableDistance ?? null,
      stopsAway: c.NumberOfStopsAway ?? d.StopsFromCall ?? null,
      miles: meters != null ? Math.round((meters / 1609.34) * 10) / 10 : null,
      passengers:
        c.Extensions?.Capacities?.EstimatedPassengerCount ??
        j.MonitoredCall?.Extensions?.Capacities?.EstimatedPassengerCount ?? null,
      atTerminal: /layover/i.test(String(j.ProgressStatus ?? "")),
      prevTrip: !/layover/i.test(String(j.ProgressStatus ?? "")) && /prevTrip/i.test(String(j.ProgressStatus ?? "")),
      vehicle: text(j.VehicleRef)?.replace(/^.*_/, "") ?? null,
    };
  });

  const sx = first(sd.SituationExchangeDelivery);
  const alerts = (sx?.Situations?.PtSituationElement ?? [])
    .map((s) => ({ summary: clean(text(s.Summary)), description: clean(text(s.Description)) }))
    .filter((a) => a.summary || a.description);

  return { stopName, buses, alerts, error, updated: new Date(now).toISOString() };
}
