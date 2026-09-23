// 計算ロジックのテスト: node --test tests/*.test.js
// （.github/workflows/test.yml で push・PR のたびに自動実行される）
// 受け入れテストは企画書（yorozu-plans 02_電気代節約.md の 6 章）の値
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');
const K = require('../constants.js');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≒ ${b}`);

test('受け入れ: 1000W × 1 時間 × 30 日、単価 31 円 → 30kWh、930 円/月', () => {
  const k = C.monthlyKwh({ method: 'wh', watt: 1000, hours: 1, days: 30 });
  near(k.total, 30);
  near(C.cost(k.total, 31), 930);
});

test('受け入れ: 年間 300kWh、単価 31 円 → 月 775 円、年 9,300 円', () => {
  const s = C.summarize([{ method: 'annual', annualKwh: 300 }], 31);
  near(s.rows[0].yenMonth, 775);
  near(s.rows[0].yenYear, 9300);
});

test('受け入れ: 年間の差額 5,000 円・購入価格 100,000 円 → 20 年。差額が 0 以下なら元は取れない（null）', () => {
  assert.equal(C.paybackYears(100000, 5000), 20);
  assert.equal(C.paybackYears(100000, 0), null);
  assert.equal(C.paybackYears(100000, -100), null);
});

test('受け入れ: 単価を変えると、すべての結果が変わる', () => {
  const items = [{ method: 'wh', watt: 1000, hours: 1, days: 30 }, { method: 'annual', annualKwh: 300 }];
  const a = C.summarize(items, 31), b = C.summarize(items, 40);
  near(b.total.yenMonth / a.total.yenMonth, 40 / 31);
  const ra = C.replacement({ method: 'annual', oldAnnualKwh: 500, newAnnualKwh: 300, price: 100000, unitPrice: 31 });
  const rb = C.replacement({ method: 'annual', oldAnnualKwh: 500, newAnnualKwh: 300, price: 100000, unitPrice: 40 });
  assert.ok(rb.savingYear > ra.savingYear && rb.years < ra.years);
  const ua = C.usageChanges(items, 31, {}), ub = C.usageChanges(items, 40, {});
  near(ub[0].yenYear / ua[0].yenYear, 40 / 31);
});

test('待機電力は、使っていない時間ぶん（1 か月 = 365/12 日）を数える。台数を掛ける', () => {
  const k = C.monthlyKwh({ method: 'wh', watt: 100, hours: 2, days: 30, standbyW: 1, qty: 3 });
  near(k.use, 100 * 2 * 30 / 1000 * 3);
  near(k.standby, 1 * (24 * 365 / 12 - 60) / 1000 * 3);
  near(k.total, k.use + k.standby);
  // 年間方式は待機電力をカタログの値に含むので足さない
  assert.equal(C.monthlyKwh({ method: 'annual', annualKwh: 120, standbyW: 5 }).standby, 0);
});

test('入力の不正値（空・負・文字）は 0 として扱う。時間は 24、日数は 31 まで', () => {
  near(C.monthlyKwh({ method: 'wh', watt: '', hours: 1, days: 30 }).total, 0);
  near(C.monthlyKwh({ method: 'wh', watt: -5, hours: 1, days: 30 }).total, 0);
  near(C.monthlyKwh({ method: 'wh', watt: 1000, hours: 30, days: 40 }).total, 1000 * 24 * 31 / 1000);
});

test('ランキングは金額の多い順', () => {
  const s = C.summarize([
    { name: 'A', method: 'annual', annualKwh: 100 },
    { name: 'B', method: 'annual', annualKwh: 400 },
    { name: 'C', method: 'wh', watt: 50, hours: 1, days: 30 },
  ], 31);
  assert.deepEqual(s.ranking.map((r) => r.name), ['B', 'A', 'C']);
});

test('買い替え（W × 時間方式）: 年間の差額と元が取れる年数', () => {
  const r = C.replacement({ method: 'wh', oldWatt: 1000, newWatt: 500, hours: 1, days: 30, price: 18600, unitPrice: 31 });
  near(r.kwhSavingYear, 500 * 30 * 12 / 1000);
  near(r.savingYear, 180 * 31);
  near(r.years, 18600 / 5580);
  assert.equal(C.replacement({ method: 'wh', oldWatt: 500, newWatt: 600, hours: 1, days: 30, price: 1, unitPrice: 31 }).years, null);
});

test('使い方の変更: 使用時間の短縮・待機電力・品目別の施策を、節約額の大きい順に並べる', () => {
  const tips = { aircon: [{ label: '冷房の設定温度を 1℃上げる', kwhYear: 30, condition: '例', source: 'x' }] };
  const items = [
    { name: 'テレビ', method: 'wh', watt: 100, hours: 5, days: 30, standbyW: 0.5 },
    { name: 'エアコン', kind: 'aircon', method: 'annual', annualKwh: 800 },
  ];
  const u = C.usageChanges(items, 31, tips, { cutHours: 1 });
  assert.deepEqual(u.map((x) => x.kind), ['hours', 'tip', 'standby']);
  near(u[0].kwhYear, 100 * 1 * 30 * 12 / 1000);
  for (let i = 1; i < u.length; i++) assert.ok(u[i - 1].yenYear >= u[i].yenYear);
});

test('constants: 単価・プリセット・施策に出典と確認日がある', () => {
  assert.match(K.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(K.UNIT_PRICE.value > 0);
  assert.match(K.UNIT_PRICE.url, /^https:\/\//);
  for (const p of K.PRESETS) {
    assert.ok(p.name && (p.method === 'wh' || p.method === 'annual'), p.name);
    assert.ok(K.SOURCES[p.source], p.name + ' の出典キー ' + p.source);
  }
  for (const list of Object.values(K.TIPS)) for (const t of list) assert.ok(t.kwhYear > 0 && K.SOURCES[t.source], t.label);
  for (const s of Object.values(K.SOURCES)) assert.match(s.url, /^https:\/\//);
});
