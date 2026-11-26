// バックアップファイル（書き出し・読み込み）の形のテスト（README「ツールを追加するとき」20・決定 D31。yorozu-plans ROADMAP 7.256・7.271）。
// 正本は youheioonuki.github.io の tools/common/backup.test.js。このファイルは repo の値を持たない。
// repo の値は、同じフォルダの backup.values.json だけが持つ:
//   module   … backupFileName・buildBackup・parseBackup を出すファイル（repo の最上位から）
//   tool     … ツール名（ファイルの名前と、ファイルの中の tool）
//   data     … 書き出す中身の見本
//   required … 読み込むとき data に無ければ断る名前
//   errors   … 断ったときの返し方。"message"（既定。r.error に画面の文）か "code"（r.code に理由の名前。画面の文は text.js が作る）
// 正規化（normalize〜）など repo だけの確かめは、同じフォルダの別のテストに置く。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup.values.json'), 'utf8'));
const KEYS = ['module', 'tool', 'data', 'required', 'errors'];
const { backupFileName, buildBackup, parseBackup } = require(path.join(ROOT, V.module));
const TOOL = V.tool;
const DATA = V.data;
const REQUIRED = V.required;
const BY_CODE = V.errors === 'code';

// 断ったか。message は画面の文の型、code は理由の名前（どちらも省けば、空でない何かがあればよい）
function refused(r, message, code, label) {
  assert.equal(r.ok, false, label);
  if (BY_CODE) {
    if (code) assert.equal(r.code, code, label);
    else assert.ok(typeof r.code === 'string' && r.code.length > 0, label);
  } else if (message) assert.match(r.error, message, label);
  else assert.ok(typeof r.error === 'string' && r.error.length > 0, label);
}

test('値のファイルは決まった名前だけを、決まった形で持つ', () => {
  for (const k of Object.keys(V)) assert.ok(KEYS.includes(k), `backup.values.json の名前 ${k}`);
  assert.ok(typeof V.module === 'string' && V.module, 'module');
  assert.ok(typeof TOOL === 'string' && TOOL, 'tool');
  assert.ok(DATA && typeof DATA === 'object' && !Array.isArray(DATA), 'data');
  assert.ok(Array.isArray(REQUIRED) && REQUIRED.length && REQUIRED.every((k) => k in DATA), 'required は data の名前');
  assert.ok(V.errors === undefined || ['message', 'code'].includes(V.errors), 'errors');
});

test('backupFileName: <ツール名>-backup-YYYYMMDD.json（端末の日付）', () => {
  assert.equal(backupFileName(TOOL, new Date(2026, 8, 24, 23, 59)), TOOL + '-backup-20260924.json');
  assert.equal(backupFileName(TOOL, new Date(2027, 0, 5)), TOOL + '-backup-20270105.json');
});

test('buildBackup: tool・version・exportedAt・data の形', () => {
  const b = buildBackup(TOOL, DATA, new Date('2026-09-24T01:02:03Z'));
  assert.deepEqual(Object.keys(b), ['tool', 'version', 'exportedAt', 'data']);
  assert.equal(b.tool, TOOL);
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, '2026-09-24T01:02:03.000Z');
  assert.deepEqual(b.data, DATA);
});

test('parseBackup: 書き出したファイルはそのまま読める', () => {
  const r = parseBackup(JSON.stringify(buildBackup(TOOL, DATA)), TOOL, REQUIRED);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, DATA);
});

test('parseBackup: ほかのツールのファイルは断る', () => {
  const r = parseBackup(JSON.stringify(buildBackup('other-tool', DATA)), TOOL, REQUIRED);
  refused(r, /ほかのツール（other-tool）/, 'otherTool');
  if (BY_CODE) assert.equal(r.tool, 'other-tool');
});

test('parseBackup: 壊れた JSON・JSON でないものは断る', () => {
  for (const text of ['{"tool": "' + TOOL, '', 'こんにちは', 'null', '[]', '123']) {
    refused(parseBackup(text, TOOL, REQUIRED), /読み取れませんでした/, 'unreadable', text);
  }
});

test('parseBackup: 項目が欠けている・形が違うものは断る', () => {
  const ok = buildBackup(TOOL, DATA);
  const cases = [
    Object.assign({}, ok, { tool: undefined }),
    Object.assign({}, ok, { version: undefined }),
    Object.assign({}, ok, { version: '1' }),
    Object.assign({}, ok, { data: undefined }),
    Object.assign({}, ok, { data: [] }),
    Object.assign({}, ok, { data: 'x' }),
  ];
  REQUIRED.forEach((k) => {
    const data = Object.assign({}, DATA);
    delete data[k];
    cases.push(Object.assign({}, ok, { data }));
  });
  cases.forEach((c, i) => refused(parseBackup(JSON.stringify(c), TOOL, REQUIRED), null, null, 'case ' + i));
});

test('parseBackup: 新しい版の形式は、その旨を伝えて断る', () => {
  const r = parseBackup(JSON.stringify(Object.assign(buildBackup(TOOL, DATA), { version: 2 })), TOOL, REQUIRED);
  refused(r, /新しい版/, 'newer');
});
