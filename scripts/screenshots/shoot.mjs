// Takes the screenshots of the extension for the README and the image label.
//
// Docker Desktop cannot be driven by a script, so this serves the built UI
// (ui/dist) in Chromium with a stand-in for ddClient. The stand-in runs the
// openarch-dd helper of the installed extension, so the screens show real
// data. Passwords are masked, and the home folder is shown as /Users/demo.
//
// Run `node themes.mjs` first for the real Docker Desktop look.
// Needs: the extension installed, the UI built (cd ui && npm run build), and
// the workspace with the demo, stopped (the Setup shot checks port 8080).
// The script starts the stack for the other shots.
//
//   cd scripts/screenshots && npm install && node shoot.mjs

import { chromium } from 'playwright-chromium';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DIST = join(ROOT, 'ui/dist');
const OUT = join(ROOT, 'docs/screenshots');
const HOME = homedir();
const HELPER = join(HOME, 'Library/Containers/com.docker.docker/Data/extensions/angelborroy_openarch-extension/host/openarch-dd');
// 1200x800 at scale 2 gives the 2400x1600 pixels that Docker asks for.
const VIEW = { width: 1200, height: 800 };
// The real Docker Desktop themes, read by themes.mjs; without them, standIn uses close colors.
const THEMES_FILE = join(import.meta.dirname, '.docker-themes.json');
const THEMES = existsSync(THEMES_FILE) ? JSON.parse(readFileSync(THEMES_FILE, 'utf8')) : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function mask(s) {
  return s.replaceAll(HOME, '/Users/demo').replace(/("password":\s*")[^"]*"/g, '$1********"');
}

function runHelper(args) {
  return new Promise((done) => {
    execFile(HELPER, args, { maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      done({ code, stdout: mask(stdout), stderr: mask(stderr) });
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/exec') {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(await runHelper(JSON.parse(body))));
    return;
  }
  const path = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try {
    const data = await readFile(join(DIST, path));
    res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/`;

// The stand-in for ddClient. Like Docker Desktop, exec rejects on a non-zero exit code.
// window.__noWorkspace makes 'status' answer as if no workspace existed, for the Setup shot.
function standIn(realThemes) {
  const decode = (s) => {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  };
  const exec = async (_cmd, args) => {
    if (window.__noWorkspace && decode(args[0])[0] === 'status') {
      const error = { code: 'usage', message: '/Users/demo/.openarch/openarch-desktop/openarch.yaml not found' };
      return Promise.reject({ code: 2, stdout: JSON.stringify({ error }), stderr: '' });
    }
    const r = await (await fetch('/exec', { method: 'POST', body: JSON.stringify(args) })).json();
    return r.code === 0 ? r : Promise.reject(r);
  };
  // Docker Desktop also injects its MUI themes: the real ones from themes.mjs, or close colors.
  const font = 'Roboto, "Helvetica Neue", Arial, sans-serif';
  const themes = realThemes ?? {
    light: { palette: { mode: 'light', primary: { main: '#1d63ed' }, background: { default: '#ffffff', paper: '#ffffff' } }, typography: { fontFamily: font } },
    dark: { palette: { mode: 'dark', primary: { main: '#4d8af0' }, background: { default: '#1f2730', paper: '#27313c' } }, typography: { fontFamily: font } },
  };
  window.__ddMuiV5Themes = themes;
  window.__ddMuiV6Themes = themes;
  window.ddClient = {
    extension: { host: { cli: { exec } } },
    host: { openExternal: () => {}, platform: 'darwin' },
    desktopUI: { toast: { success: () => {}, warning: () => {}, error: () => {} } },
  };
}

async function shoot(scheme, noWorkspace, name, steps) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.addInitScript(standIn, THEMES);
  await ctx.addInitScript((v) => (window.__noWorkspace = v), noWorkspace);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(URL);
  // 90% zoom fits a full screen, such as Setup with its Start button.
  await page.evaluate(() => (document.body.style.zoom = '0.9'));
  await steps(page);
  await page.waitForTimeout(500);
  const file = join(OUT, `${name}-${scheme}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
  await ctx.close();
}

const browser = await chromium.launch();
const schemes = ['light', 'dark'];
const helper = (...args) => runHelper([Buffer.from(JSON.stringify([...args, '--output', 'json', '--non-interactive'])).toString('base64url')]);

for (const s of schemes) {
  await shoot(s, true, 'setup', async (p) => {
    await p.getByText('Access to ghcr.io').waitFor({ timeout: 60000 });
    await p.getByLabel(/OpenArch \+ demo/).check();
  });
}

console.log('starting the stack...');
const up = await helper('up');
if (up.code !== 0) {
  throw new Error('openarch up failed: ' + up.stdout + up.stderr);
}
// With vectors, so the question shot has results. This needs Docker Model Runner
// with host TCP access and ai/mxbai-embed-large. Vectors reach the index a few
// seconds after the load.
await helper('demo', 'load', '--force', '--embeddings');
await new Promise((r) => setTimeout(r, 8000));

for (const s of schemes) {
  await shoot(s, false, 'dashboard', async (p) => {
    await p.getByText('healthy', { exact: true }).first().waitFor({ timeout: 60000 });
  });
  await shoot(s, false, 'try-it', async (p) => {
    await p.getByRole('tab', { name: 'Try it' }).click();
    // Every column has run: the admin sees 10 documents and carol 2.
    await p.getByText('10 documents').waitFor({ timeout: 60000 });
    await p.getByText('2 documents').waitFor({ timeout: 60000 });
  });
  await shoot(s, false, 'try-it-question', async (p) => {
    await p.getByRole('tab', { name: 'Try it' }).click();
    await p.getByText('10 documents').waitFor({ timeout: 60000 });
    await p.getByRole('button', { name: 'Ask' }).click();
    await p.getByText('2 nearest documents').waitFor({ timeout: 60000 });
  });
  await shoot(s, false, 'connect-ai', async (p) => {
    await p.getByRole('tab', { name: 'Connect AI' }).click();
    await p.getByText('Claude Code').waitFor();
  });
}

await browser.close();
server.close();
