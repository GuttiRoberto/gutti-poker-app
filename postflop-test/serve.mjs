// Server static minim. Utilizare: node serve.mjs <cale pkg> [port] [--no-isolation]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const pkg = resolve(process.argv[2] ?? '../../wasm-postflop/pkg');
const port = Number(process.argv[3] ?? 8090);
const isolated = !process.argv.includes('--no-isolation');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };

createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p === '/') p = '/index.html';
  const file = p.startsWith('/pkg/') ? join(pkg, p.slice(5)) : join(here, p);
  if (!file.startsWith(pkg) && !file.startsWith(here)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    const h = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
    if (isolated) { h['Cross-Origin-Opener-Policy'] = 'same-origin'; h['Cross-Origin-Embedder-Policy'] = 'require-corp'; }
    res.writeHead(200, h).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(port, () => console.log(`http://localhost:${port} (izolare cross-origin: ${isolated})`));
