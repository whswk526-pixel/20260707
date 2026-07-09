// data/*.json을 file:// 로 직접 열어도 fetch 없이 쓸 수 있게 <script> 로 로딩 가능한
// data/*.js (전역 변수 할당) 로 변환한다. fetch/XHR는 file:// 오리진에서 CORS로 막히지만
// <script src="로컬파일.js">는 막히지 않기 때문.
// 실행: node scripts/embed_data.js (fetch_yeoksam_data.js, fetch_elevation.js,
// convert_sgis_boundary.js를 먼저 실행해서 data/*.json이 있어야 함)

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = {
  'yeoksam_graph.json': 'WAYPICK_GRAPH',
  'yeoksam_buildings.json': 'WAYPICK_BUILDINGS',
  'yeoksam_presets.json': 'WAYPICK_PRESETS',
  'yeoksam_dong_boundary.json': 'WAYPICK_DONG_BOUNDARY',
  'yeoksam_busstops.json': 'WAYPICK_BUSSTOPS',
};

for (const [jsonFile, varName] of Object.entries(FILES)) {
  const jsonPath = path.join(DATA_DIR, jsonFile);
  const data = fs.readFileSync(jsonPath, 'utf8'); // 이미 유효한 JSON 텍스트이므로 그대로 재사용
  const outPath = path.join(DATA_DIR, jsonFile.replace(/\.json$/, '.js'));
  fs.writeFileSync(outPath, `window.${varName} = ${data};\n`);
  console.log(`${jsonFile} -> ${path.basename(outPath)} (${varName}, ${(data.length / 1024).toFixed(0)}KB)`);
}
