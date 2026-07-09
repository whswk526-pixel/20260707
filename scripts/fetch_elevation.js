// data/yeoksam_graph.json의 각 노드에 실제 고도(elevation)를 붙여서 경사도를 계산할 수 있게 한다.
// 출처: Open-Elevation (api.open-elevation.com, SRTM 기반 오픈소스 프로젝트, 키 불필요).
// 실행: node scripts/fetch_elevation.js (fetch_yeoksam_data.js를 먼저 실행해서
// data/yeoksam_graph.json이 있어야 함)

const fs = require('fs');
const path = require('path');

const GRAPH_PATH = path.join(__dirname, '..', 'data', 'yeoksam_graph.json');
const ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';
const CHUNK_SIZE = 200;

async function fetchChunk(locations, attempt = 1) {
  try {
    const res = await fetch(ELEVATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results;
  } catch (e) {
    if (attempt >= 3) throw e;
    console.warn(`청크 실패(${attempt}차), 재시도:`, e.message);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return fetchChunk(locations, attempt + 1);
  }
}

async function main() {
  const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const nodeIds = Object.keys(graph.nodes);
  console.log(`노드 ${nodeIds.length}개 고도 조회 시작 (Open-Elevation, ${Math.ceil(nodeIds.length / CHUNK_SIZE)}개 청크)`);

  for (let i = 0; i < nodeIds.length; i += CHUNK_SIZE) {
    const chunkIds = nodeIds.slice(i, i + CHUNK_SIZE);
    const locations = chunkIds.map((id) => ({ latitude: graph.nodes[id].lat, longitude: graph.nodes[id].lng }));
    const results = await fetchChunk(locations);
    results.forEach((r, idx) => {
      graph.nodes[chunkIds[idx]].ele = r.elevation;
    });
    console.log(`  ${Math.min(i + CHUNK_SIZE, nodeIds.length)}/${nodeIds.length} 완료`);
  }

  const missing = nodeIds.filter((id) => typeof graph.nodes[id].ele !== 'number');
  if (missing.length) console.warn('고도 못 받은 노드:', missing.length, '개 (0으로 대체)');
  for (const id of missing) graph.nodes[id].ele = 0;

  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph));
  const eles = nodeIds.map((id) => graph.nodes[id].ele);
  console.log('고도 범위:', Math.min(...eles), '~', Math.max(...eles), 'm');
  console.log('저장 완료:', GRAPH_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
