// 月ごとの電気代の平均の図（Q-405、yorozu-plans の QUEUE 2026-11-18。Q-385 の続き）
// 値は constants.js の HOUSEHOLD_MONTHLY の 1 か所（家計調査 月次 004 用途分類（世帯人員別）sid 0002070008）。
// ここでは (1) 値が原文から写した額のままか、(2) 棒と今日の月の印（月の境・値なし・系列の切り替え・1 人が無い）、
// (3) 線の位置、(4) 画面の置き場と押す所を確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../calc.js');
const K = require('../constants.js');

const ROOT = path.join(__dirname, '..');
const M = K.HOUSEHOLD_MONTHLY;

test('値: 家計調査 月次の電気代（2025年10月〜2026年9月、2026-11-18 に e-Stat で読んだ額）', () => {
  assert.equal(M.checked, '2026-11-18');
  assert.deepEqual(M.months, ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  assert.deepEqual(M.series.map((s) => [s.label, s.yen]), [
    ['平均', [12913, 11138, 11497, 14378, 15633, 14989, 12840, 11011, 9948, 9591, 11339, 11886]],
    ['2 人', [11615, 9897, 10666, 12995, 14380, 13756, 11764, 10163, 9134, 8737, 10251, 10770]],
    ['3 人', [14201, 11831, 11680, 14897, 16443, 15997, 13599, 11265, 10588, 10198, 11939, 12569]],
    ['4 人', [13795, 12221, 12549, 16058, 16670, 15635, 14098, 12159, 10481, 10244, 12427, 13103]],
    ['5 人', [14728, 13971, 13314, 16919, 17988, 17198, 13908, 12516, 11495, 11339, 13130, 13639]],
    ['6 人以上', [14557, 14856, 14913, 19106, 19939, 21204, 15058, 14468, 13332, 12375, 17296, 15185]],
  ]);
  const src = K.SOURCES[M.source];
  assert.equal(src.url, 'https://www.e-stat.go.jp/dbview?sid=0002070008');
  assert.match(src.label, /家計調査.*004 用途分類（世帯人員別）/);
});

test('系列の名前は Q-315 の図の棒の名前と同じ語。1 人は無い', () => {
  const q315 = K.HOUSEHOLD.rows.map((r) => r.label);
  for (const s of M.series.slice(1)) assert.ok(q315.includes(s.label), s.label);
  assert.ok(!M.series.some((s) => s.label === '1 人'));
});

test('既定は平均。1 人や無い名前を渡しても平均になる（1 人の値を作らない）', () => {
  assert.equal(C.monthlyChart(M, undefined, 1, 0, false).label, '平均');
  const one = C.monthlyChart(M, '1 人', 1, 0, false);
  assert.equal(one.label, '平均');
  assert.deepEqual(one.bars.map((b) => b.yen), C.monthlyChart(M, '平均', 1, 0, false).bars.map((b) => b.yen));
});

test('棒: 横は 1〜12 月の順。月の数字で表の月に当たる（10〜12 月は 2025 年、1〜9 月は 2026 年）', () => {
  const ch = C.monthlyChart(M, '平均', 5, 0, false);
  assert.deepEqual(ch.bars.map((b) => b.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(ch.bars.map((b) => b.ym), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2025-10', '2025-11', '2025-12']);
  assert.deepEqual(ch.bars.map((b) => b.yen), [14378, 15633, 14989, 12840, 11011, 9948, 9591, 11339, 11886, 12913, 11138, 11497]);
  assert.equal(ch.axisMax, 25000);
  for (const b of ch.bars) assert.equal(b.frac, b.yen / 25000);
});

test('系列の切り替え: 棒の額が替わり、軸は動かない', () => {
  const a = C.monthlyChart(M, '平均', 1, 13000, true);
  const six = C.monthlyChart(M, '6 人以上', 1, 13000, true);
  assert.equal(six.label, '6 人以上');
  assert.equal(six.bars[2].yen, 21204);
  assert.equal(a.axisMax, six.axisMax);
  assert.deepEqual(a.line, six.line);
  const two = C.monthlyChart(M, '2 人', 1, 0, false);
  assert.deepEqual(two.bars.map((b) => b.yen), [12995, 14380, 13756, 11764, 10163, 9134, 8737, 10251, 10770, 11615, 9897, 10666]);
});

test('印: 今日の月の棒 1 本だけ。月の境（1 月・12 月）でも 1 本', () => {
  for (const m of [1, 9, 10, 12]) {
    const ch = C.monthlyChart(M, '平均', m, 0, false);
    const cur = ch.bars.filter((b) => b.current);
    assert.equal(cur.length, 1);
    assert.equal(cur[0].month, m);
  }
  // 月の境: 12 月 31 日と 1 月 1 日（端末の時刻の月をそのまま使う）
  assert.equal(new Date(2026, 11, 31, 23, 59).getMonth() + 1, 12);
  assert.equal(new Date(2027, 0, 1, 0, 0).getMonth() + 1, 1);
});

test('値なし: 月の値が無ければ棒は yen null・frac 0。印は月に立つ', () => {
  const holes = { months: M.months.slice(0, 11), series: [{ label: '平均', yen: M.series[0].yen.slice(0, 11) }] };
  const ch = C.monthlyChart(holes, '平均', 9, 0, false);
  const sep = ch.bars[8];
  assert.equal(sep.month, 9);
  assert.equal(sep.yen, null);
  assert.equal(sep.ym, null);
  assert.equal(sep.frac, 0);
  assert.equal(sep.current, true);
  const nan = { months: M.months, series: [{ label: '平均', yen: M.series[0].yen.map((v, i) => (i === 0 ? null : v)) }] };
  assert.equal(C.monthlyChart(nan, '平均', 1, 0, false).bars[9].yen, null);
});

test('線: Q-315 の線と同じ数（家電 0 件なら無し、0 円は下端、軸の外は上端に止める）', () => {
  assert.equal(C.monthlyChart(M, '平均', 1, 9000, false).line, null);
  assert.deepEqual(C.monthlyChart(M, '平均', 1, 0, true).line, { yen: 0, frac: 0, clamped: false });
  assert.deepEqual(C.monthlyChart(M, '平均', 1, 12500, true).line, { yen: 12500, frac: 0.5, clamped: false });
  assert.deepEqual(C.monthlyChart(M, '平均', 1, 30000, true).line, { yen: 30000, frac: 1, clamped: true });
});

test('画面: 押す所の置き場と図の置き場。数え方の文は 1 つだけで、2 本の図の後ろ。額を HTML に書かない', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<div class="chips monthly-pick" id="monthly-pick" role="group" aria-label="世帯の人数"><\/div>/);
  assert.match(html, /<div id="monthly" class="ranking household monthly"><\/div>/);
  const note = '家計調査の額は世帯の電気代の全部です。';
  assert.equal(html.split(note).length - 1, 1);
  assert.ok(html.indexOf('id="household"') < html.indexOf('id="monthly"') && html.indexOf('id="monthly"') < html.indexOf(note));
  for (const s of M.series) for (const v of s.yen) assert.ok(!html.includes(v.toLocaleString('ja-JP')), `${v} が index.html に直書きされている`);
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.match(main, /aria-pressed/);
  assert.ok(!/monthlyLabel[^\n]*(localStorage|save\()/.test(main), '選んだ系列を保存しない');
});

test('使い方: 文と更新履歴が 1 行ずつ', () => {
  const g = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  assert.equal(g.split('図の上の人数を押すと、その人数の世帯の月ごとの平均に切り替わります。').length - 1, 1);
  assert.equal(g.split('月ごとの電気代の平均の図を足しました').length - 1, 1);
});

// Q-412: 月ごとの図の出典は月次の表。期間は値のファイルの最初と最後の月から作る（数を手で書かない）
test('出典の期間: 値のファイルの最初と最後の月', () => {
  assert.equal(C.monthlyPeriod(M.months), '2025年10月〜2026年9月');
  const first = M.months[0].split('-'), last = M.months[M.months.length - 1].split('-');
  assert.equal(C.monthlyPeriod(M.months), `${first[0]}年${+first[1]}月〜${last[0]}年${+last[1]}月`);
  // 値のファイルの月が替われば、期間も替わる
  assert.equal(C.monthlyPeriod(['2026-01', '2026-12']), '2026年1月〜2026年12月');
  assert.equal(C.monthlyPeriod(['2025-11', '2026-10']), '2025年11月〜2026年10月');
});

test('出典の文: 月次の出典は月ごとの図の下、年平均の出典は人数ごとの図の下', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<div id="monthly" class="ranking household monthly"><\/div>\n\s*<p class="small" id="monthly-src"><\/p>/);
  assert.match(html, /<div id="household" class="ranking household"><\/div>\n\s*<p class="small" id="household-src"><\/p>/);
  assert.ok(html.indexOf('id="household-src"') < html.indexOf('id="monthly-pick"'));
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.ok(main.includes("' 家計調査（月次・' + Calc.monthlyPeriod(M.months) + '）・確認日 '"));
  assert.ok(!/年\d+月〜/.test(main) && !main.includes('2025年10月'), '期間を main.js に手で書かない');
  // main.js の組み立てと同じ式で、今の値から出る字
  const mc = M.checked.split('-');
  const text = '出典: ' + K.SOURCES[M.source].publisher + ' 家計調査（月次・' + C.monthlyPeriod(M.months) + '）・確認日 ' + mc[0] + '年' + (+mc[1]) + '月' + (+mc[2]) + '日';
  assert.equal(text, '出典: 総務省統計局 家計調査（月次・2025年10月〜2026年9月）・確認日 2026年11月18日');
});

test('使い方: 支払った月の 1 文と、Q-412 の更新履歴が 1 行ずつ。画面には足さない', () => {
  const g = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
  const s = '月ごとの図の月は、電気代を支払った月です（家計調査の数え方）。';
  assert.equal(g.split(s).length - 1, 1);
  assert.equal(g.split('月ごとの図に、月次の出典を足しました').length - 1, 1);
  assert.ok(!fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('支払った月'));
});
