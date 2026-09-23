// ===========================
// 家電の電気代・節約額シミュレーター — 計算ロジック（画面から切り離した純粋関数）
// 電力量は kWh、金額は円、単価は 円/kWh。内部は小数のまま計算し、丸めは表示側で行う
// ブラウザでは window.Calc、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var DAYS_PER_MONTH = 365 / 12;   // 待機電力は、使わない日も含めて 1 か月ずっと差しっぱなしとして数える

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  /**
   * 1 か月の電力量（kWh）
   * item = { method: 'wh'（W×時間）| 'annual'（年間消費電力量）, watt, hours（時間/日）, days（日/月）,
   *          annualKwh, standbyW（待機電力 W。W×時間方式のときだけ使う）, qty（台数） }
   */
  function monthlyKwh(item) {
    var qty = num(item.qty) || 1;
    if (item.method === 'annual') return { use: num(item.annualKwh) / 12 * qty, standby: 0, total: num(item.annualKwh) / 12 * qty };
    var hours = Math.min(24, num(item.hours));
    var days = Math.min(31, num(item.days));
    var use = num(item.watt) * hours * days / 1000 * qty;
    // 待機: 1 か月の総時間から、使っている時間を引いた分
    var standbyHours = Math.max(0, 24 * DAYS_PER_MONTH - hours * days);
    var standby = num(item.standbyW) * standbyHours / 1000 * qty;
    return { use: use, standby: standby, total: use + standby };
  }

  function cost(kwh, unitPrice) { return kwh * num(unitPrice); }

  /** 品目ごとの月・年の電力量と金額、合計。金額の多い順に並べた ranking も返す */
  function summarize(items, unitPrice) {
    var rows = items.map(function (it, i) {
      var k = monthlyKwh(it);
      return {
        index: i, name: it.name || '家電', kwhMonth: k.total, standbyKwhMonth: k.standby,
        yenMonth: cost(k.total, unitPrice), yenYear: cost(k.total * 12, unitPrice),
      };
    });
    var total = rows.reduce(function (a, r) {
      return { kwhMonth: a.kwhMonth + r.kwhMonth, yenMonth: a.yenMonth + r.yenMonth, yenYear: a.yenYear + r.yenYear };
    }, { kwhMonth: 0, yenMonth: 0, yenYear: 0 });
    var ranking = rows.slice().sort(function (a, b) { return b.yenMonth - a.yenMonth; });
    return { rows: rows, total: total, ranking: ranking };
  }

  /** 元が取れる年数。年間の差額が 0 以下なら null（元は取れない） */
  function paybackYears(price, yearlySaving) {
    if (!(yearlySaving > 0)) return null;
    return num(price) / yearlySaving;
  }

  /**
   * 買い替え比較
   * p = { method: 'wh' | 'annual', oldWatt, newWatt, hours, days, oldAnnualKwh, newAnnualKwh, qty, price（購入価格）, unitPrice }
   */
  function replacement(p) {
    var base = { method: p.method, hours: p.hours, days: p.days, qty: p.qty };
    var oldK = monthlyKwh(Object.assign({}, base, { watt: p.oldWatt, annualKwh: p.oldAnnualKwh })).total * 12;
    var newK = monthlyKwh(Object.assign({}, base, { watt: p.newWatt, annualKwh: p.newAnnualKwh })).total * 12;
    var oldYen = cost(oldK, p.unitPrice), newYen = cost(newK, p.unitPrice);
    var saving = oldYen - newYen;
    return { oldKwhYear: oldK, newKwhYear: newK, oldYenYear: oldYen, newYenYear: newYen, savingYear: saving, kwhSavingYear: oldK - newK, years: paybackYears(p.price, saving) };
  }

  /**
   * 使い方の変更による年間の節約額（おすすめ施策。節約額の大きい順）
   * opts = { cutHours: 1 日に短くする時間 }
   * tips = constants.js の TIPS（品目の kind ごとの、出典つきの年間の節約電力量）
   */
  function usageChanges(items, unitPrice, tips, opts) {
    var cut = num((opts || {}).cutHours) || 1;
    var out = [];
    items.forEach(function (it, i) {
      var qty = num(it.qty) || 1;
      var name = it.name || '家電';
      if (it.method !== 'annual' && num(it.watt) > 0 && num(it.hours) > 0) {
        var h = Math.min(cut, num(it.hours));
        var kwh = num(it.watt) * h * Math.min(31, num(it.days)) * 12 / 1000 * qty;
        out.push({ index: i, kind: 'hours', title: name + 'の使用時間を 1 日 ' + h + ' 時間短くする', kwhYear: kwh, yenYear: cost(kwh, unitPrice) });
      }
      if (it.method !== 'annual' && num(it.standbyW) > 0) {
        var s = monthlyKwh(it).standby * 12;
        out.push({ index: i, kind: 'standby', title: name + 'の待機電力を切る（主電源を切る・コンセントを抜く）', kwhYear: s, yenYear: cost(s, unitPrice) });
      }
      (tips && it.kind && tips[it.kind] || []).forEach(function (t) {
        var k = t.kwhYear * qty;
        out.push({ index: i, kind: 'tip', title: name + '：' + t.label, note: t.condition, source: t.source, kwhYear: k, yenYear: cost(k, unitPrice) });
      });
    });
    return out.filter(function (x) { return x.kwhYear > 0; }).sort(function (a, b) { return b.yenYear - a.yenYear; });
  }

  var Calc = {
    DAYS_PER_MONTH: DAYS_PER_MONTH, monthlyKwh: monthlyKwh, cost: cost, summarize: summarize,
    paybackYears: paybackYears, replacement: replacement, usageChanges: usageChanges,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(this);
