// SGIS(통계지리정보서비스)에서 내려받은 행정동 경계 shapefile(bnd_dong_11230_2025_2Q)을
// 파싱해서 역삼동 경계만 위경도(WGS84 근사)로 변환해 data/yeoksam_dong_boundary.json으로 저장.
//
// 좌표계: .prj에 명시된 "Korea_2000_Korea_Unified_Coordinate_System"
// (GRS80 타원체, Transverse Mercator, 중앙자오선 127.5°, 원점위도 38°,
//  축척계수 0.9996, False Easting 1,000,000 / False Northing 2,000,000) — EPSG:5179 상당.
// Snyder의 표준 역-횡메르카토르 공식으로 직접 역변환한다 (외부 GIS 라이브러리 없이).
//
// 실행: node scripts/convert_sgis_boundary.js

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'bnd_dong_11230_2025_2Q');
const SHP = path.join(SRC_DIR, 'bnd_dong_11230_2025_2Q.shp');
const DBF = path.join(SRC_DIR, 'bnd_dong_11230_2025_2Q.dbf');

// ---- Shapefile(.shp) 파싱: Polygon(type 5)만 처리 ----
function readShp(buf) {
  const records = [];
  let offset = 100; // 헤더 100바이트
  while (offset < buf.length) {
    offset += 4; // record number (big-endian, 미사용)
    const contentLenWords = buf.readInt32BE(offset); offset += 4;
    const contentLen = contentLenWords * 2;
    const recStart = offset;
    const shapeType = buf.readInt32LE(offset);
    let rings = [];
    if (shapeType === 5) {
      let o = offset + 4 + 32; // shapeType(4) + box(32)
      const numParts = buf.readInt32LE(o); o += 4;
      const numPoints = buf.readInt32LE(o); o += 4;
      const parts = [];
      for (let i = 0; i < numParts; i++) { parts.push(buf.readInt32LE(o)); o += 4; }
      const points = [];
      for (let i = 0; i < numPoints; i++) {
        const x = buf.readDoubleLE(o); o += 8;
        const y = buf.readDoubleLE(o); o += 8;
        points.push([x, y]);
      }
      for (let i = 0; i < numParts; i++) {
        const start = parts[i];
        const end = i + 1 < numParts ? parts[i + 1] : numPoints;
        rings.push(points.slice(start, end));
      }
    }
    records.push({ rings });
    offset = recStart + contentLen;
  }
  return records;
}

// ---- dBase(.dbf) 파싱 ----
function readDbf(buf) {
  const numRecords = buf.readInt32LE(4);
  const headerSize = buf.readInt16LE(8);
  const recordSize = buf.readInt16LE(10);
  const fields = [];
  let o = 32;
  while (buf[o] !== 0x0d) {
    const name = buf.toString('utf8', o, o + 11).replace(/\0.*$/, '');
    const length = buf[o + 16];
    fields.push({ name, length });
    o += 32;
  }
  const records = [];
  let recOffset = headerSize;
  for (let r = 0; r < numRecords; r++) {
    let fo = recOffset + 1; // 삭제 플래그 1바이트 건너뜀
    const rec = {};
    for (const f of fields) {
      rec[f.name] = buf.toString('utf8', fo, fo + f.length).trim();
      fo += f.length;
    }
    records.push(rec);
    recOffset += recordSize;
  }
  return records;
}

// ---- 역-횡메르카토르 (Snyder 공식), Korea 2000 통일좌표계 파라미터 ----
const a = 6378137.0;
const f = 1 / 298.257222101;
const k0 = 0.9996;
const lon0 = 127.5 * Math.PI / 180;
const lat0 = 38.0 * Math.PI / 180;
const FE = 1000000.0, FN = 2000000.0;
const e2 = f * (2 - f);
const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

function meridianArc(lat) {
  return a * (
    (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * lat
    - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * lat)
    + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * lat)
    - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * lat)
  );
}

function inverseTM(X, Y) {
  const M0 = meridianArc(lat0);
  const x = X - FE;
  const y = Y - FN;
  const M = M0 + y / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

  const phi1 = mu
    + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
    + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
    + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

  const ep2 = e2 / (1 - e2);
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) ** 2, 1.5);
  const D = x / (N1 * k0);

  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
    D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
  );
  const lon = lon0 + (
    D
    - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
  ) / Math.cos(phi1);

  return [lat * 180 / Math.PI, lon * 180 / Math.PI];
}

function main() {
  const shpBuf = fs.readFileSync(SHP);
  const dbfBuf = fs.readFileSync(DBF);
  const shapes = readShp(shpBuf);
  const attrs = readDbf(dbfBuf);

  console.log('레코드 수:', shapes.length, attrs.length);
  console.log('dbf 필드 샘플:', attrs[0]);

  const target = [];
  attrs.forEach((a, i) => {
    const nameField = Object.keys(a).find((k) => /ADM_NM|DONG_NM|NAME/i.test(k));
    const name = nameField ? a[nameField] : JSON.stringify(a);
    if (name && name.includes('역삼')) {
      target.push({ name, attrs: a, shape: shapes[i] });
    }
  });

  console.log('역삼 관련 동:', target.map((t) => t.name));

  const boundaries = target.map((t) => ({
    name: t.name,
    rings: t.shape.rings.map((ring) => ring.map(([x, y]) => inverseTM(x, y))),
  }));

  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'yeoksam_dong_boundary.json'),
    JSON.stringify(boundaries)
  );
  console.log('저장 완료: data/yeoksam_dong_boundary.json');
  if (boundaries[0]) {
    console.log('샘플 좌표(위경도):', boundaries[0].rings[0].slice(0, 3));
  }
}

main();
