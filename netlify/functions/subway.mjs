// Minimal protobuf reader for the few GTFS-realtime fields we need (no dependencies).
function* fields(buf, start = 0, end = buf.length) {
  let i = start;
  const varint = () => { let x = 0n, shift = 0n, b; do { b = buf[i++]; x |= BigInt(b & 0x7f) << shift; shift += 7n; } while (b & 0x80); return x; };
  while (i < end) {
    const key = Number(varint()), no = key >>> 3, wt = key & 7;
    if (wt === 0) yield { no, v: varint() };
    else if (wt === 2) { const len = Number(varint()); yield { no, s: i, e: i + len }; i += len; }
    else if (wt === 1) i += 8;
    else if (wt === 5) i += 4;
    else throw new Error("Bad protobuf");
  }
}
const str = (buf, f) => new TextDecoder().decode(buf.subarray(f.s, f.e));
function decodeFeed(buf) {
  const entity = [];
  for (const f of fields(buf)) {
    if (f.no !== 2 || f.s == null) continue; // FeedMessage.entity
    for (const g of fields(buf, f.s, f.e)) {
      if (g.no !== 3 || g.s == null) continue; // FeedEntity.trip_update
      const tu = { trip: {}, stopTimeUpdate: [] };
      for (const h of fields(buf, g.s, g.e)) {
        if (h.no === 1 && h.s != null) for (const k of fields(buf, h.s, h.e)) { if (k.no === 5 && k.s != null) tu.trip.routeId = str(buf, k); }
        if (h.no === 2 && h.s != null) {
          const st = {};
          for (const k of fields(buf, h.s, h.e)) {
            if (k.no === 4 && k.s != null) st.stopId = str(buf, k);
            if ((k.no === 2 || k.no === 3) && k.s != null) for (const m of fields(buf, k.s, k.e)) if (m.no === 2 && m.v != null) st[k.no === 2 ? "arrival" : "departure"] = { time: Number(m.v) };
          }
          tu.stopTimeUpdate.push(st);
        }
      }
      entity.push({ tripUpdate: tu });
    }
  }
  return { entity };
}

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
      const feed = decodeFeed(new Uint8Array(await r.arrayBuffer()));
      runs = runs.concat(runsFromFeed(feed, from, to, routes, now));
    }
    return json({ runs: runs.sort((a, b) => a.dep - b.dep).slice(0, 12), updated: new Date().toISOString() });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
};

export const config = { path: "/api/subway" };
