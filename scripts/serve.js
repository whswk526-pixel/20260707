// V-World 3D(WS3D 뷰어)는 발급받은 키를 도메인/URI 단위로 인증한다. file://로 그냥
// 여는 방식은 등록할 도메인 자체가 없어서 항상 막히기 때문에, 이 스크립트로 고정된
// 주소(http://localhost:5500)를 만들고 그 주소를 V-World 사이트에 등록해서 쓴다.
//
// 실행: node scripts/serve.js (또는 start.bat 더블클릭)
// 접속: http://localhost:5500/waypick.html

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 5500;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? '/waypick.html' : urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`WAYPICK 서버 실행 중: http://localhost:${PORT}/waypick.html`);
  console.log('V-World 사이트(vworld.kr) 발급키 관리에서 이 주소(localhost 또는 http://localhost:5500)를 등록해야 3D가 열려요.');
  console.log('종료하려면 이 창을 닫거나 Ctrl+C.');
});
