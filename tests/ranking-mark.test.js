// ランキングの棒の印（Q-511、yorozu-plans の QUEUE 2026-11-18 夕方）
// 印を引く・← → で「時間/日」が変わる。範囲と刻みは画面の時間の欄の属性（main.js の hoursField: min 0・max 24・step 0.25）を渡す。
// ここでは calc.js の rankFrac・stepHours・hoursAtFrac を確かめる（画面の動きは Playwright で確かめ、BUILDLOG に）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../calc.js');

const MIN = 0, MAX = 24, STEP = 0.25;

test('時間の欄の属性は min 0・max 24・step 0.25（印の範囲と刻みはここから取る）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(src, /field\('時間\/日', it\.hours, \{ min: 0, max: 24, step: 0\.25,/);
});

test('棒の長さ ＝ 月の額 ÷ 物差しの額。物差し 0 なら 0、cap で止める', () => {
  assert.equal(C.rankFrac(500, 1000), 0.5);
  assert.equal(C.rankFrac(1000, 1000), 1);
  assert.equal(C.rankFrac(1500, 1000), 1.5);
  assert.equal(C.rankFrac(1500, 1000, 1.2), 1.2);
  assert.equal(C.rankFrac(10, 0), 0);
  assert.equal(C.rankFrac(0, 1000), 0);
});

test('← → は 0.25 時間、Shift は 1 時間。0 と 24 で止まる', () => {
  assert.equal(C.stepHours(5, STEP, MIN, MAX, STEP), 5.25);
  assert.equal(C.stepHours(5, -STEP, MIN, MAX, STEP), 4.75);
  assert.equal(C.stepHours(5, 1, MIN, MAX, STEP), 6);
  assert.equal(C.stepHours(0, -STEP, MIN, MAX, STEP), 0);
  assert.equal(C.stepHours(0.1, -1, MIN, MAX, STEP), 0);
  assert.equal(C.stepHours(24, STEP, MIN, MAX, STEP), 24);
  assert.equal(C.stepHours(23.5, 1, MIN, MAX, STEP), 24);
  assert.equal(C.stepHours('', STEP, MIN, MAX, STEP), 0.25);
  // 刻みに乗っていない値（電子レンジの 0.2 時間）は、動かした向きの刻みにそろう
  assert.equal(C.stepHours(0.2, STEP, MIN, MAX, STEP), 0.5);
  assert.equal(C.stepHours(0.2, -STEP, MIN, MAX, STEP), 0);
  // 0.25 を 96 回足すと 24 で止まり、端数が出ない
  let h = 0;
  for (let k = 0; k < 100; k++) h = C.stepHours(h, STEP, MIN, MAX, STEP);
  assert.equal(h, 24);
});

test('引いた位置の時間: 棒の長さから時間に戻すと、元の時間（額は summarize から）', () => {
  const item = { name: 'テレビ', method: 'wh', watt: 79, hours: 5, days: 30, standbyW: 0.5, qty: 1 };
  const yenAt = (v) => C.summarize([Object.assign({}, item, { hours: v })], 31).rows[0].yenMonth;
  const max = yenAt(10);
  for (const h of [0, 0.25, 3, 5, 9.75, 10]) {
    assert.equal(C.hoursAtFrac(C.rankFrac(yenAt(h), max), yenAt, max, MIN, MAX, STEP, 5), h);
  }
  // 右の外まで引くと 24、左の外まで引くと 0
  assert.equal(C.hoursAtFrac(99, yenAt, max, MIN, MAX, STEP, 5), 24);
  assert.equal(C.hoursAtFrac(-1, yenAt, max, MIN, MAX, STEP, 5), 0);
});

test('額が時間で変わらない家電（W ＝ 待機 W）は、今の時間のまま', () => {
  const item = { method: 'wh', watt: 2, hours: 3, days: 30, standbyW: 2, qty: 1 };
  const yenAt = (v) => C.summarize([Object.assign({}, item, { hours: v })], 31).rows[0].yenMonth;
  // 使う分が増えたぶん待機が減り、額はどの時間でも同じ（どれも同じ近さ）
  const max = yenAt(3);
  assert.equal(C.hoursAtFrac(1, yenAt, max, MIN, MAX, STEP, 3), 3);
});
