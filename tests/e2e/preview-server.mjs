// Förhandsvisningsserver för designarbete — appen mot den STUBBADE Supabasen
// (fixtures/supabase-stub.js), utan Playwright. Samma statiska server som
// harnessen, men jsdelivr-importen i js/supabase-client.js skrivs om till
// stubben så sidan bootar förbi inloggningsgaten med fixturdata. /api/* svarar
// 404 (ingen generering/dispatch) — det här är bara för att TITTA på vyerna.
//
//   node tests/e2e/preview-server.mjs --port=4173
//
// Aldrig mot riktiga databasen, aldrig mot live-deployen.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, parseArgs } from './harness.mjs';

const args = parseArgs();
const PORT = Number(args.get('port') || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const STUB_PATH = '/tests/e2e/fixtures/supabase-stub.js';

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // POST /dump → scripts/.cache/recipes-live.json (gitignorerad). Används för att
    // få ut window.RECIPES ur en inloggad flik i webbläsarpanelen till dev-skripten
    // (bildhämtningen) utan service-role-nyckel. Bara localhost, bara den filen.
    if (req.method === 'POST' && url.pathname === '/dump') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks).toString('utf8');
      JSON.parse(body);   // måste vara giltig JSON
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync(path.join(ROOT, 'scripts', '.cache'), { recursive: true });
      writeFileSync(path.join(ROOT, 'scripts', '.cache', 'recipes-live.json'), body);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, bytes: body.length }));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
    if (rel.startsWith('/api/')) { res.writeHead(404).end('{}'); return; }
    // Ingen service worker i förhandsvisningen: den cachar CSS stale-while-
    // revalidate och visar annars förra omgångens stilar efter varje ändring.
    // Den här versionen avregistrerar sig själv och tömmer cachen.
    if (rel === '/service-worker.js') {
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' })
        .end("self.addEventListener('install', () => self.skipWaiting());\n"
          + "self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()"
          + ".then(() => caches.keys()).then((ks) => Promise.all(ks.map((k) => caches.delete(k))))));\n");
      return;
    }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('nej'); return; }
    let body = await readFile(file);
    if (rel === '/js/supabase-client.js') {
      body = Buffer.from(body.toString('utf8').replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^'"]+/, STUB_PATH));
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  } catch {
    res.writeHead(404).end('saknas');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Förhandsvisning på http://127.0.0.1:${PORT}/ (stubbad Supabase)`));
