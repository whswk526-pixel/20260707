// 정류장별로 어떤 버스 노선(번호)이 지나가는지 수집한다.
//
// 출처: OpenStreetMap (Overpass API), ODbL 라이선스. 서울시 버스도착정보 API(실시간
// 도착 예정 시간)는 발급형 인증키가 필요해 이 저장소엔 없다 — 그래서 "이 정류장에
// 어떤 버스가 오는지"는 실제 노선 데이터로 보여주고, "몇 분 후 도착"은 여전히 추정치다.
//
// data/yeoksam_busstops.json(정류장 목록, fetch_bus_stops.js 결과물)이 먼저 있어야 함.
// 실행: node scripts/fetch_bus_routes.js
// 결과: data/yeoksam_busstops.json을 routes 필드 추가해서 덮어씀

const fs = require('fs');
const path = require('path');

const OVERPASS_URL = 'https://z.overpass-api.de/api/interpreter';
const BBOX = { south: 37.488, west: 127.020, north: 37.514, east: 127.056 };

const QUERY = `
[out:json][timeout:60];
node["highway"="bus_stop"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east})->.stops;
(
  rel["type"="route"]["route"="bus"](bn.stops);
);
out body;
`.trim();

async function main() {
  const stopsPath = path.join(__dirname, '..', 'data', 'yeoksam_busstops.json');
  const stops = JSON.parse(fs.readFileSync(stopsPath, 'utf8'));
  const stopIds = new Set(stops.map((s) => s.id));

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': 'waypick-data-build/1.0' },
    body: QUERY,
  });
  if (!res.ok) throw new Error(`Overpass 요청 실패: ${res.status}`);
  const data = await res.json();

  const routesByStop = new Map(); // stopId -> Set<ref>
  for (const rel of data.elements) {
    if (rel.type !== 'relation' || !rel.tags || !rel.tags.ref) continue;
    const ref = rel.tags.ref;
    for (const m of rel.members) {
      if (m.type !== 'node' || !stopIds.has(m.ref)) continue;
      if (!routesByStop.has(m.ref)) routesByStop.set(m.ref, new Set());
      routesByStop.get(m.ref).add(ref);
    }
  }

  const merged = stops.map((s) => ({
    ...s,
    routes: routesByStop.has(s.id) ? [...routesByStop.get(s.id)].sort() : [],
  }));

  fs.writeFileSync(stopsPath, JSON.stringify(merged));
  const withRoutes = merged.filter((s) => s.routes.length).length;
  console.log(`정류장 ${merged.length}개 중 ${withRoutes}개에 노선 정보 추가 완료 → ${stopsPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
