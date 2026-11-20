import { normalize } from "../../lib/siri.mjs";

// MTA has used both hosts for the API; try the configured one first, then fall back.
const HOSTS = [process.env.BUSTIME_HOST, "https://bustime.mta.info", "https://bustime-classic.mta.info"].filter(Boolean);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  const stop = new URL(req.url).searchParams.get("stop") ?? "";
  if (!/^\d{6}$/.test(stop)) return json({ error: "Stop code must be 6 digits" }, 400);

  const key = process.env.MTA_BUSTIME_KEY;
  if (!key) return json({ error: "MTA_BUSTIME_KEY is not set in Netlify" }, 500);

  const qs = new URLSearchParams({
    key,
    version: "2",
    OperatorRef: "MTA",
    MonitoringRef: stop,
    StopMonitoringDetailLevel: "normal",
    MaximumStopVisits: "12",
  });

  let lastErr = "No response";
  for (const host of HOSTS) {
    try {
      const r = await fetch(`${host}/api/siri/stop-monitoring.json?${qs}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) { lastErr = `MTA returned ${r.status}`; continue; }
      const data = normalize(await r.json());
      if (data.error) return json(data, 502);
      return json(data);
    } catch (e) {
      lastErr = e.message;
    }
  }
  return json({ error: lastErr }, 502);
};

export const config = { path: "/api/arrivals" };
