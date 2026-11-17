// 世帯の人数ごとの電気代の図（Q-315、yorozu-plans の QUEUE 2026-11-17。K215 の 1 本目）
// 値は constants.js の HOUSEHOLD の 1 か所。図（calc.js の householdChart）と guide の根拠の行はそこから出す。
// ここでは (1) 値が原文から写した額のままか、(2) 図と guide の行が同じ値か、(3) 縦の線の位置（0 円・棒の間・軸の外・家電 0 件）を確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../calc.js');
const K = require('../constants.js');

const ROOT = path.join(__dirname, '..');
const H = K.HOUSEHOLD;

test('値: 家計調査 2025 年平均の 1 か月の電気代（区切りは表のまま。2026-11-17 に e-Stat で読んだ額）', () => {
  assert.equal(H.year, 2025);
  assert.match(H.checked, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(H.checked <= new Date().toISOString().slice(0, 10));
  assert.deepEqual(H.rows.map((r) => [r.label, r.yen]), [
    ['1 人', 7337], ['2 人', 12144], ['3 人', 13915], ['4 人', 13928], ['5 人', 15665], ['6 人以上', 17322],
  ]);
  assert.equal(H.rows[0].source, 'kakei1p');
  for (const r of H.rows.slice(1)) assert.equal(r.source, 'kakei2p');
  for (const k of ['kakei1p', 'kakei2p']) {
    assert.match(K.SOURCES[k].url, /^https:\/\/www\.e-stat\.go\.jp\/dbview\?sid=\d+$/);
    assert.match(K.SOURCES[k].label, /家計調査.*2025年/);
  }
});

test('図の棒は値のファイルと同じ額で、区切りの数だけ並ぶ', () => {
  const ch = C.householdChart(H.rows, 9000, true);
  assert.deepEqual(ch.bars.map((b) => [b.label, b.yen]), H.rows.map((r) => [r.label, r.yen]));
  assert.equal(ch.axisMax, 20000);
  for (const b of ch.bars) assert.equal(b.frac, b.yen / ch.axisMax);
});

// guide の script を最小の DOM で動かす（tests/guide-date.test.js と同じ形）
function runGuideScript() {
  const html = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  const body = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('K.CHECKED'));
  const el = () => ({ children: [], dataset: {}, style: {}, textContent: '', appendChild(c) { this.children.push(c); return c; }, setAttribute() {} });
  const byId = {};
  const document = { getElementById: (id) => (byId[id] ||= el()), querySelector: () => el(), createElement: el, createTextNode: (t) => ({ textContent: t }) };
  const window = {};
  const ctx = vm.createContext({ window, document });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'constants.js'), 'utf8'), Object.assign(ctx, { module: undefined }));
  window.Constants = ctx.Constants;
  vm.runInContext(body, ctx);
  return { html, byId };
}

test('guide の根拠の行は値のファイルと同じ額・年・確認日（HTML に額の控えを持たない）', () => {
  const { html, byId } = runGuideScript();
  assert.match(html, /<p id="household-basis"><\/p>/);
  const t = byId['household-basis'].textContent;
  for (const r of H.rows) assert.ok(t.includes(r.label + ' ' + r.yen.toLocaleString('ja-JP') + ' 円'), `${r.label} の額が guide に無い: ${t}`);
  const [y, m, d] = H.checked.split('-').map(Number);
  assert.ok(t.includes(`${H.year} 年平均`) && t.includes(`${y}年${m}月${d}日`), t);
});

test('画面: 図の下の 1 文と出典の置き場がある。額を HTML に書かない', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('家計調査の額は世帯の電気代の全部です。この画面の額は、入れた家電の分だけです。'));
  assert.match(html, /<div id="household" class="ranking household"><\/div>/);
  assert.match(html, /<span id="household-src"><\/span>/);
  for (const r of H.rows) assert.ok(!html.includes(r.yen.toLocaleString('ja-JP')), `${r.yen} が index.html に直書きされている`);
});

test('線: 家電が 0 件なら線を出さない（棒だけ）', () => {
  const ch = C.householdChart(H.rows, 0, false);
  assert.equal(ch.line, null);
  assert.equal(ch.bars.length, 6);
});

test('線: 0 円（家電はあるが値が空など）は左端', () => {
  const ch = C.householdChart(H.rows, 0, true);
  assert.deepEqual(ch.line, { yen: 0, frac: 0, clamped: false });
});

test('線: 棒の間の額は、その 2 本の棒の端の間に引く', () => {
  const ch = C.householdChart(H.rows, 13000, true);
  assert.equal(ch.line.frac, 13000 / 20000);
  assert.equal(ch.line.clamped, false);
  const two = ch.bars[1].frac, three = ch.bars[2].frac;
  assert.ok(two < ch.line.frac && ch.line.frac < three, `${two} < ${ch.line.frac} < ${three}`);
});

test('線: 軸を超えた額は右端に止める', () => {
  const ch = C.householdChart(H.rows, 25000, true);
  assert.equal(ch.line.frac, 1);
  assert.equal(ch.line.clamped, true);
  assert.equal(ch.line.yen, 25000);
  assert.deepEqual(C.householdChart(H.rows, 20000, true).line, { yen: 20000, frac: 1, clamped: false });
});

test('fetch 0: 図の値は埋め込みで、画面のスクリプトは外へ取りに行かない', () => {
  for (const f of ['main.js', 'calc.js', 'constants.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(src), `${f} に通信がある`);
  }
});
