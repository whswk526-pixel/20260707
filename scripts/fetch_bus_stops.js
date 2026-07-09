// 역삼동 버스 정류장 위치 수집 스크립트
//
// 출처: OpenStreetMap (Overpass API), ODbL 라이선스. 실시간 도착 정보를 주는
// data.go.kr/서울 열린데이터광장 버스도착정보 API는 발급형 인증키가 필요해 이
// 저장소엔 키가 없다 — 그래서 "버스 도우미" 패널은 정류장 위치/이름은 실측 데이터를
// 쓰고, 배차 간격(도착까지 남은 시간)은 여전히 추정치라는 걸 UI에 명시한다.
//
// 실행: node scripts/fetch_bus_stops.js
// 결과: data/yeoksam_busstops.json (커밋되는 정적 파일)

const fs = require('fs');
const path = require('path');

const OVERPASS_URL = 'https://z.overpass-api.de/api/interpreter';
const BBOX = { south: 37.488, west: 127.020, north: 37.514, east: 127.056 };

const QUERY = `
[out:json][timeout:60];
node["highway"="bus_stop"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
out body;
`.trim();

function haversine(a, b) {
  const R = 6378137;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function main() {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': 'waypick-data-build/1.0' },
    body: QUERY,
  });
  if (!res.ok) throw new Error(`Overpass 요청 실패: ${res.status}`);
  const data = await res.json();

  // 이름 없는 정류장(무명 표지판 등)은 안내 가치가 낮아 제외, 같은 이름이 30m 안에
  // 중복으로 찍힌 경우(정류장 양방향 표지판 등)는 하나로 합친다.
  const stops = [];
  for (const el of data.elements) {
    if (el.type !== 'node' || !el.tags || !el.tags.name) continue;
    const stop = { id: el.id, name: el.tags.name, lat: el.lat, lng: el.lon };
    const dup = stops.find((s) => s.name === stop.name && haversine(s, stop) < 30);
    if (!dup) stops.push(stop);
  }

  const outPath = path.join(__dirname, '..', 'data', 'yeoksam_busstops.json');
  fs.writeFileSync(outPath, JSON.stringify(stops));
  console.log(`정류장 ${stops.length}개 저장 완료 → ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
