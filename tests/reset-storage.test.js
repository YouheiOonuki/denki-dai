// 「保存した内容をすべて消す（初期状態に戻す）」ボタン（reset-storage.js。yorozu-plans ROADMAP K123）のテスト
// このファイルは repo の値を持たない。接頭辞と旧キーはページのボタン（data-reset-storage / data-reset-legacy）から読む（yorozu-plans D668・Q-858）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../reset-storage.js');

// reset-storage.js を <script src> ではなく、ページの中に埋め込んでいるページ（1 ファイルにビルドするもの）は、この印で見分ける
const INLINE_MARK = 'root.ResetStorage = api;';
const INLINE_SRC = "reset-storage.js";
const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set(['node_modules', 'tests', 'test', '.git', '.github', 'tools']);

function resetButton(html) {
  const btn = /<button\b[^>]*\bdata-reset-storage="([^"]*)"[^>]*>([\s\S]*?)<\/button>/.exec(html);
  if (!btn) return null;
  const legacy = /\bdata-reset-legacy="([^"]*)"/.exec(btn[0]);
  return { prefixes: R.splitList(btn[1]), legacy: legacy ? R.splitList(legacy[1]) : [], label: btn[2].replace(/<[^>]+>/g, '').trim() };
}

// このツールの接頭辞と、接頭辞の無い旧キー: 最上位のページ（index.html）のボタンの値。画面ごとに消す範囲を分けるページは、この接頭辞で始まる別の値を持つ
const TOP = fs.existsSync(path.join(ROOT, 'index.html')) ? resetButton(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) : null;
const PREFIXES = TOP ? TOP.prefixes : [];
const LEGACY = TOP ? TOP.legacy : [];

function fakeStorage(init) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    keys() { return [...m.keys()].sort(); },
  };
}

test('消すのはこのツールの接頭辞のキー（と旧キー）だけで、ほかのツールのキーは残す', () => {
  assert.ok(PREFIXES.length > 0, 'index.html に data-reset-storage のボタンが無い');
  const init = { 'zz-other-tool_x': '1', 'zzother_theme': 'dark', 'unrelated': 'u' };
  for (const p of PREFIXES) { init[p + 'a'] = '1'; init[p + 'b'] = '2'; }
  for (const k of LEGACY) init[k] = 'old';
  const expectedLeft = Object.keys(init).filter((k) => !PREFIXES.some((p) => k.startsWith(p)) && !LEGACY.includes(k)).sort();
  const s = fakeStorage(init);
  const gone = R.clear(s, PREFIXES, LEGACY);
  assert.equal(gone.length, PREFIXES.length * 2 + LEGACY.length);
  assert.deepEqual(s.keys(), expectedLeft);
  assert.ok(expectedLeft.length > 0);
});

test('空の接頭辞では何も消さない', () => {
  assert.deepEqual(R.keysToRemove(['a', 'b'], [''], []), []);
  assert.deepEqual(R.keysToRemove(['a', 'b'], R.splitList(' , '), R.splitList('')), []);
});

function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...htmlFiles(path.join(dir, e.name))); }
    else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
  }
  return out;
}

/** ページのスクリプト（インラインと、リポジトリ内の src）が localStorage / indexedDB を使うか */
function usesStorage(file, html) {
  let code = '';
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    if (!src) { code += m[2]; continue; }
    if (/^(https?:)?\/\//.test(src[1]) || /reset-storage\.js/.test(src[1])) continue;
    const p = path.join(path.dirname(file), src[1].split(/[?#]/)[0]);
    if (fs.existsSync(p)) code += fs.readFileSync(p, 'utf8');
  }
  code = code.replace(/(^|[^:\\'"])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');   // コメントの中の語は数えない（行のコメントが先。「topics/*.js」のような文字を /* と読まないように）
  return /\blocalStorage\b|\bindexedDB\b/.test(code);
}

test('localStorage を使うページには、消すボタンと reset-storage.js がある', () => {
  const pages = htmlFiles(ROOT).filter((f) => usesStorage(f, fs.readFileSync(f, 'utf8')));
  assert.ok(pages.length > 0, 'localStorage を使うページが見つからない');
  for (const f of pages) {
    const html = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    const btn = resetButton(html);
    assert.ok(btn, rel + ' に data-reset-storage のボタンが無い');
    assert.ok(btn.prefixes.length > 0, rel + ' の接頭辞が空');
    for (const p of btn.prefixes) assert.ok(PREFIXES.some((q) => p.startsWith(q)), rel + ' の ' + p + ' はこのツールの接頭辞（index.html のボタン）で始まらない');
    assert.ok(btn.label === '保存した内容をすべて消す（初期状態に戻す）' || btn.label === 'Delete everything saved (reset)', rel + ' の文言: ' + btn.label);
    if (html.includes(INLINE_MARK)) {
      assert.ok(fs.readFileSync(path.join(ROOT, INLINE_SRC), 'utf8').includes(INLINE_MARK));
      continue;
    }
    const src = /<script\b[^>]*\bsrc="([^"]*reset-storage\.js)"/.exec(html);
    assert.ok(src, rel + ' に reset-storage.js が無い');
    assert.ok(fs.existsSync(path.join(path.dirname(f), src[1].split(/[?#]/)[0])), rel + ' の reset-storage.js のパス');
  }
});
