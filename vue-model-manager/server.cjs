const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const DIST = __dirname;
const ROOT = path.join(__dirname, '..');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function isPathSafe(base, target) {
  const resolved = path.resolve(base, target);
  return resolved.startsWith(path.resolve(base) + path.sep) || resolved === path.resolve(base);
}

function serveFile(res, filePath, contentType, isHead) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    if (isHead) {
      res.end();
    } else {
      res.end(data);
    }
  });
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  const isHead = req.method === 'HEAD';
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = parsed.pathname;

  // Serve available-models.json from the project root (single source of truth)
  if (pathname === '/available-models.json') {
    const filePath = path.join(ROOT, 'available-models.json');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
    return;
  }

  // Static files from dist/
  if (pathname === '/') pathname = '/index.html';

  // Path traversal protection
  if (!isPathSafe(DIST, pathname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const filePath = path.join(DIST, pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: only for paths without a file extension (routes, not missing assets)
      if (!ext) {
        const indexPath = path.join(DIST, 'index.html');
        serveFile(res, indexPath, 'text/html', isHead);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    if (isHead) {
      res.end();
    } else {
      res.end(data);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
