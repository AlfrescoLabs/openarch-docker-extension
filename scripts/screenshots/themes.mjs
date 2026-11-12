// Reads the MUI themes that Docker Desktop gives to extensions, from the
// Docker Desktop installed on this machine, into .docker-themes.json (git-ignored:
// the themes belong to Docker Desktop). shoot.mjs uses them when the file exists.
//
//   node themes.mjs [path to app.asar]

import { extractFile } from '@electron/asar';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ASAR = process.argv[2] ?? '/Applications/Docker.app/Contents/MacOS/Docker Desktop.app/Contents/Resources/app.asar';
const src = extractFile(ASAR, 'build/extension-preload.js').toString();

// The preload exposes the same object as __ddMuiV5Themes and __ddMuiV6Themes:
// si = {dark: B0, light: S0}, where each is a JSON.parse('...') literal.
function json(name) {
  const m = new RegExp(`[,; ]${name}=JSON\\.parse\\('`).exec(src);
  if (!m) throw new Error(`${name} not found in the preload`);
  const end = src.indexOf("')", m.index + m[0].length);
  // Undo the escapes of the single-quoted JavaScript string, without running it.
  const literal = src.slice(m.index + m[0].length, end).replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (_, u, c) =>
    u ? String.fromCharCode(parseInt(u, 16)) : ({ n: '\n', t: '\t', r: '\r' })[c] ?? c);
  return JSON.parse(literal);
}
const names = /[,; ]si=\{dark:(\w+),light:(\w+)\}/.exec(src);
if (!names) throw new Error('theme object not found in the preload');
const themes = { dark: json(names[1]), light: json(names[2]) };
const out = join(import.meta.dirname, '.docker-themes.json');
writeFileSync(out, JSON.stringify(themes));
console.log('wrote', out, 'dark background', themes.dark.palette.background.default);
