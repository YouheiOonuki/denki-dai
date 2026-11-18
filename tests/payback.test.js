// 買い替えの「元が取れるまで」の図（Q-600、yorozu-plans の QUEUE 2026-11-19 朝 (2) の大きめ）
// 線の値と交わる年は calc.js の replacement・paybackYears の返り。payback.js は形（端・目盛り・年ごとの点）だけを決める。
// 画面の動き（印を引く・↑ ↓・欄と保存と結果）は Playwright で確かめ、BUILDLOG に
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../calc.js');
const P = require('../payback.js');
const K = require('../constants.js');

const UNIT = 31;
const PRICES = [50000, 120000];
const HOURS = [4, 8];
const PAIRS = [[1000, 600], [200, 120], [80, 30]];   // 今の W・買い替える W
const CASES = [];
for (const price of PRICES) for (const hours of HOURS) for (const [o, n] of PAIRS) CASES.push({ price, hours, o, n });

function rep(c) {
  return C.replacement({ method: 'wh', oldWatt: c.o, newWatt: c.n, hours: c.hours, days: 30, qty: 1, price: c.price, unitPrice: UNIT });
}
// 1 年の電気代を、ランキングと同じ summarize の道から取る（replacement とは別の呼び方）
function yenYear(w, hours) {
  return C.summarize([{ method: 'wh', watt: w, hours, days: 30, qty: 1 }], UNIT).rows[0].yenYear;
}

test('横の端の範囲は constants.js の PAYBACK_YEARS（10〜30 年）', () => {
  assert.deepEqual(K.PAYBACK_YEARS, { min: 10, max: 30 });
});

test('価格の欄は min 0・step 1000（印の範囲と歩幅はここから取る）', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<input type="number" id="rep-price" inputmode="numeric" min="0" step="1000">/);
});

test('交わる年 ＝ paybackYears の返り（価格 × 使用時間 × 2 つの製品の 12 通り）', () => {
  assert.equal(CASES.length, 12);
  for (const c of CASES) {
    const r = rep(c);
    const want = C.paybackYears(c.price, r.oldYenYear - r.newYenYear);
    const ch = P.chart(r, c.price, K.PAYBACK_YEARS);
    // 横の端（最大 30 年）の外なら交わる点を描かない
    assert.equal(ch.cross, want <= ch.years ? want : null, JSON.stringify(c));
    assert.equal(r.years, want);
  }
});

test('線の高さ ＝ 年 × 1 年の電気代（買い替える線は ＋ 価格）、差 0（12 通り × 3 つの年）', () => {
  for (const c of CASES) {
    const r = rep(c);
    const ch = P.chart(r, c.price, K.PAYBACK_YEARS);
    const oy = yenYear(c.o, c.hours), ny = yenYear(c.n, c.hours);
    for (const t of [0, 1, ch.years]) {
      assert.equal(ch.old[t][0], t);
      assert.equal(ch.old[t][1] - t * oy, 0, JSON.stringify([c, t]));
      assert.equal(ch.neu[t][1] - (c.price + t * ny), 0, JSON.stringify([c, t]));
    }
    // 縦の端は、どちらの線も入る高さ
    assert.ok(ch.top >= ch.old[ch.years][1] && ch.top >= ch.neu[ch.years][1]);
  }
});

test('横の端 ＝ 元が取れる年数の 2 倍を切り上げた年。下は 10 年、上は 30 年', () => {
  const S = K.PAYBACK_YEARS;
  assert.equal(P.spanYears(2.1, S), 10);
  assert.equal(P.spanYears(5.01, S), 11);
  assert.equal(P.spanYears(7.3, S), 15);
  assert.equal(P.spanYears(14.6, S), 30);
  assert.equal(P.spanYears(40, S), 30);
  assert.equal(P.spanYears(null, S), 10);
  assert.equal(P.spanYears(0, S), 10);
});

test('交わらない時（差が 0 以下）と価格 0 の時は、交わる点が無い', () => {
  const same = C.replacement({ method: 'annual', oldAnnualKwh: 300, newAnnualKwh: 300, qty: 1, price: 80000, unitPrice: UNIT });
  assert.equal(P.chart(same, 80000, K.PAYBACK_YEARS).cross, null);
  const worse = C.replacement({ method: 'annual', oldAnnualKwh: 250, newAnnualKwh: 300, qty: 1, price: 80000, unitPrice: UNIT });
  const ch = P.chart(worse, 80000, K.PAYBACK_YEARS);
  assert.equal(ch.cross, null);
  assert.equal(ch.years, 10);
  const free = C.replacement({ method: 'annual', oldAnnualKwh: 450, newAnnualKwh: 250, qty: 1, price: 0, unitPrice: UNIT });
  assert.equal(P.chart(free, 0, K.PAYBACK_YEARS).cross, null);
});

test('軸の端を持っている間（hold）は、価格を変えても端と目盛りが変わらない', () => {
  const r0 = rep(CASES[0]);
  const c0 = P.chart(r0, 50000, K.PAYBACK_YEARS);
  const hold = { years: c0.years, top: c0.top, step: c0.step };
  for (let k = 1; k <= 5; k++) {
    const p = 50000 + k * 1000;
    const r = C.replacement({ method: 'wh', oldWatt: 1000, newWatt: 600, hours: 4, days: 30, qty: 1, price: p, unitPrice: UNIT });
    const ch = P.chart(r, p, K.PAYBACK_YEARS, hold);
    assert.deepEqual(ch.ticks, c0.ticks);
    assert.deepEqual(ch.xTicks, c0.xTicks);
    assert.equal(ch.neu[0][1], p);
  }
});

test('目盛り: 縦は 0 から端まで刻みごと、横は 0 年と端の年を含む', () => {
  for (const c of CASES) {
    const ch = P.chart(rep(c), c.price, K.PAYBACK_YEARS);
    assert.equal(ch.ticks[0], 0);
    assert.equal(ch.ticks[ch.ticks.length - 1], ch.top);
    assert.ok(ch.ticks.length >= 3 && ch.ticks.length <= 6, String(ch.ticks));
    assert.equal(ch.xTicks[0], 0);
    assert.equal(ch.xTicks[ch.xTicks.length - 1], ch.years);
  }
});
