import GtfsRealtimeBindings from "gtfs-realtime-bindings";

// Live subway trips from MTA's GTFS-realtime feed (no key needed). For each train on the given lines
// that stops at `from` and later at `to`, return when it leaves `from` and reaches `to`.
const FEEDS = {
  "1": "nyct%2Fgtfs", "2": "nyct%2Fgtfs", "3": "nyct%2Fgtfs", "4": "nyct%2Fgtfs", "5": "nyct%2Fgtfs", "6": "nyct%2Fgtfs", "7": "nyct%2Fgtfs-7",
  A: "nyct%2Fgtfs-ace", C: "nyct%2Fgtfs-ace", E: "nyct%2Fgtfs-ace", B: "nyct%2Fgtfs-bdfm", D: "nyct%2Fgtfs-bdfm", F: "nyct%2Fgtfs-bdfm", M: "nyct%2Fgtfs-bdfm",
  N: "nyct%2Fgtfs-nqrw", Q: "nyct%2Fgtfs-nqrw", R: "nyct%2Fgtfs-nqrw", W: "nyct%2Fgtfs-nqrw", L: "nyct%2Fgtfs-l", G: "nyct%2Fgtfs-g", J: "nyct%2Fgtfs-jz", Z: "nyct%2Fgtfs-jz",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const num = (t) => (t == null ? null : typeof t === "object" && "toNumber" in t ? t.toNumber() : Number(t));

export function runsFromFeed(feed, from, to, routes, nowSec) {
  const runs = [];
  for (const e of feed.entity || []) {
    const tu = e.tripUpdate;
    if (!tu || !routes.includes(String(tu.trip?.routeId).replace(/X$/, ""))) continue;
    const stus = tu.stopTimeUpdate || [];
    const i = stus.findIndex((s) => s.stopId === from);
    const j = stus.findIndex((s) => s.stopId === to);
    if (i < 0 || j <= i) continue;
    const dep = num(stus[i].departure?.time) || num(stus[i].arrival?.time);
    const arr = num(stus[j].arrival?.time) || num(stus[j].departure?.time);
    if (!dep || !arr || arr <= dep || dep < nowSec - 60) continue;
    runs.push({ route: String(tu.trip.routeId).replace(/X$/, ""), dep: dep * 1000, arr: arr * 1000 });
  }
  return runs.sort((a, b) => a.dep - b.dep).slice(0, 12);
}

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const from = q.get("from") || "", to = q.get("to") || "";
  const routes = (q.get("routes") || "").split(",").filter(Boolean);
  if (!/^[A-Z0-9]{3}[NS]$/.test(from) || !/^[A-Z0-9]{3}[NS]$/.test(to) || !routes.length) return json({ error: "Bad stop or routes" }, 400);
  const feeds = [...new Set(routes.map((r) => FEEDS[r]).filter(Boolean))];
  if (!feeds.length) return json({ error: "Unknown line" }, 400);
  try {
    const now = Math.floor(Date.now() / 1000);
    let runs = [];
    for (const f of feeds) {
      const r = await fetch(`https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/${f}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return json({ error: `MTA subway feed returned ${r.status}` }, 502);
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await r.arrayBuffer()));
      runs = runs.concat(runsFromFeed(feed, from, to, routes, now));
    }
    return json({ runs: runs.sort((a, b) => a.dep - b.dep).slice(0, 12), updated: new Date().toISOString() });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
};

export const config = { path: "/api/subway" };
