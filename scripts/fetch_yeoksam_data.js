// 역삼동 보행 경로 데이터 수집 스크립트
//
// 출처: OpenStreetMap (Overpass API), ODbL 라이선스.
// SGIS(sgis.kostat.go.kr) Open API는 발급형 consumer key가 필요해 이 저장소에는
// 키가 없으므로, 인증 없이 접근 가능한 공개 정적 데이터인 OSM 건물 높이(height /
// building:levels)와 보행로(footway/pedestrian/path/living_street) 태그를 대신 사용한다.
//
// 실행: node scripts/fetch_yeoksam_data.js
// 결과: data/yeoksam_buildings.json, data/yeoksam_graph.json (커밋되는 정적 파일)
//
// 참고: overpass-api.de(메인), overpass.kumi.systems 는 이 실행 환경에서 접속이
// 막혀 있어 z.overpass-api.de 미러를 사용한다.

const fs = require('fs');
const path = require('path');

const OVERPASS_URL = 'https://z.overpass-api.de/api/interpreter';
// 강남역~역삼~선릉 방향 테헤란로 일대로 범위 확장 (기존 역삼동 단독 bbox 대비 약 3배 면적)
const BBOX = { south: 37.488, west: 127.020, north: 37.514, east: 127.056 };

// 한국 OSM은 보도를 별도 way로 잘 매핑하지 않고 차도 속성(sidewalk=*)으로만
// 표시하는 경우가 많아, footway류만 쓰면 그래프가 수십 개 조각으로 끊긴다.
// foot=no로 명시된 것만 제외하고 보행 가능한 도로 전반(생활도로~간선도로)을 포함해
// 실제로 이어지는 보행 네트워크를 구성한다.
const WALKABLE_HIGHWAY = 'footway|pedestrian|path|living_street|residential|unclassified|tertiary|secondary|primary|service|steps';

const QUERY = `
[out:json][timeout:90];
(
  way["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way["highway"~"^(${WALKABLE_HIGHWAY})$"]["foot"!~"^(no|private)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["railway"="subway_entrance"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["public_transport"="station"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["highway"="crossing"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out body;
>;
out skel qt;
`.trim();

function haversine(a, b) {
  const R = 6378137;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 역삼동 OSM 건물의 84%가 height/building:levels 태그가 없어서, 그 경우엔 최소한
// building=* 유형 태그로 층수를 추정한다 (전부 12m로 뭉개는 것보다 정밀함).
// 값은 강남 지역 실제 건물 규모에 대한 대략적인 가정이며, 정확한 실측치는 아니다.
const TYPE_DEFAULT_HEIGHT_M = {
  house: 6, detached: 6, bungalow: 6, semidetached_house: 6, terrace: 8,
  garage: 3, garages: 3, shed: 3, hut: 3, roof: 3, greenhouse: 3, carport: 3,
  residential: 9,
  apartments: 30,
  office: 15, commercial: 15, retail: 12, industrial: 8, warehouse: 8,
  school: 12, hospital: 15, government: 12, civic: 12, university: 15,
  hotel: 20,
  yes: 10, // OSM에서 가장 흔한 무정보 태그 — 일반 도심 저층 건물 기본값
};
function parseHeightMeters(tags) {
  if (tags.height) {
    const m = parseFloat(String(tags.height).replace(/[^0-9.]/g, ''));
    if (!isNaN(m) && m > 0) return m;
  }
  if (tags['building:levels']) {
    const lv = parseFloat(tags['building:levels']);
    if (!isNaN(lv) && lv > 0) return lv * 3;
  }
  return TYPE_DEFAULT_HEIGHT_M[tags.building] || 10;
}

async function main() {
  console.log('Overpass 쿼리 전송 중...', OVERPASS_URL);
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': 'waypick-data-build/1.0' },
    body: QUERY,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();
  const elements = data.elements || [];
  console.log(`요소 ${elements.length}개 수신`);

  const nodesById = new Map();
  const ways = [];
  const namedPoints = [];

  for (const el of elements) {
    if (el.type === 'node') {
      const crossing = !!(el.tags && el.tags.highway === 'crossing');
      nodesById.set(el.id, { lat: el.lat, lng: el.lon, crossing });
      if (el.tags && el.tags.name && (el.tags.railway === 'subway_entrance' || el.tags.public_transport === 'station')) {
        namedPoints.push({ name: el.tags.name, lat: el.lat, lng: el.lon, kind: 'station' });
      }
    } else if (el.type === 'way') {
      ways.push(el);
    }
  }

  const buildings = [];
  const graphNodes = new Map(); // id -> {lat,lng}
  const edges = [];

  for (const way of ways) {
    const tags = way.tags || {};
    const coords = (way.nodes || [])
      .map((id) => nodesById.get(id))
      .filter(Boolean)
      .map((p) => [p.lat, p.lng]);

    if (tags.building && coords.length >= 3) {
      buildings.push({
        id: way.id,
        name: tags.name || null,
        footprint: coords,
        heightM: parseHeightMeters(tags),
      });
      if (tags.name) {
        const c = coords[Math.floor(coords.length / 2)];
        namedPoints.push({ name: tags.name, lat: c[0], lng: c[1], kind: 'building' });
      }
      continue;
    }

    if (tags.highway && new RegExp(`^(${WALKABLE_HIGHWAY})$`).test(tags.highway)) {
      const wayIsCrossing = tags.footway === 'crossing' || !!tags.crossing;
      const ids = way.nodes || [];
      for (let i = 0; i < ids.length - 1; i++) {
        const a = nodesById.get(ids[i]);
        const b = nodesById.get(ids[i + 1]);
        if (!a || !b) continue;
        graphNodes.set(ids[i], a);
        graphNodes.set(ids[i + 1], b);
        edges.push({
          from: ids[i],
          to: ids[i + 1],
          distanceM: Math.round(haversine(a, b) * 100) / 100,
          tunnel: tags.tunnel === 'yes',
          covered: tags.covered === 'yes',
          // 횡단보도: 별도 crossing way이거나 양 끝 노드가 도로 위 crossing 지점인 경우
          crossing: wayIsCrossing || a.crossing || b.crossing,
          // 계단: 경사·계단 회피 조건에 사용 (실측 태그, 추정 아님)
          steps: tags.highway === 'steps',
        });
      }
    }
  }

  const nodesOut = {};
  for (const [id, p] of graphNodes.entries()) nodesOut[id] = p;

  const graph = { nodes: nodesOut, edges };

  // 대표 지점 프리셋: 이름 있는 지점 중 서로 40m 이상 떨어진 것 위주로, 같은 이름 중복도 제거
  const seenNames = new Set();
  const uniquePoints = [];
  for (const p of namedPoints) {
    if (seenNames.has(p.name)) continue;
    if (uniquePoints.some((u) => haversine(u, p) < 40)) continue;
    seenNames.add(p.name);
    uniquePoints.push(p);
  }
  uniquePoints.sort((a, b) => (b.kind === 'station') - (a.kind === 'station'));
  const presets = uniquePoints.slice(0, 24);

  fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'yeoksam_buildings.json'),
    JSON.stringify(buildings)
  );
  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'yeoksam_graph.json'),
    JSON.stringify(graph)
  );
  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'yeoksam_presets.json'),
    JSON.stringify(presets, null, 2)
  );

  console.log(`건물 ${buildings.length}개, 그래프 노드 ${Object.keys(nodesOut).length}개, 엣지 ${edges.length}개, 프리셋 ${presets.length}개 저장 완료`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
