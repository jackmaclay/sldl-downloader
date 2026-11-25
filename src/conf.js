'use strict';
// Reads and writes sldl's own config file, keeping every line it doesn't know about.
const fs = require('fs');
const os = require('os');
const path = require('path');

const confPath = () => process.env.SLDL_CONF || path.join(os.homedir(), '.config', 'sldl', 'sldl.conf');

const KEYS = ['user', 'pass', 'path', 'pref-format', 'name-format'];

function parse(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function read(file = confPath()) {
  try { return parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

// Sets only the keys in `values`; other lines and comments stay where they were.
function write(values, file = confPath()) {
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { /* new file */ }
  const left = { ...values };
  // sldl refuses "key =" with no value, so an empty value removes the key instead of writing it.
  lines = lines.map((raw) => {
    const m = raw.match(/^\s*([^#=\s][^=]*?)\s*=/);
    if (m && Object.prototype.hasOwnProperty.call(left, m[1])) {
      const v = left[m[1]]; delete left[m[1]];
      return String(v).trim() === '' ? null : `${m[1]} = ${v}`;
    }
    return raw;
  }).filter((l) => l !== null);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [k, v] of Object.entries(left)) if (String(v).trim() !== '') lines.push(`${k} = ${v}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
}

// What the UI and CLI may show: never the password itself.
const redact = (conf) => ({ ...conf, pass: conf.pass ? '********' : '' });

module.exports = { confPath, parse, read, write, redact, KEYS };
