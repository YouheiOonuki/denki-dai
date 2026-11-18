// ===========================
// 買い替えの「元が取れるまで」の図（yorozu-plans QUEUE Q-600）: 線の形だけを決める純粋関数
// 額は calc.js の replacement の返り（1 年の電気代を 2 つの製品で別々に）と、元が取れる年数（paybackYears）をそのまま使う。
// ここでは電気代を計算しない。線の値は「年 × 1 年の電気代」（買い替える線は価格から）だけ（値上がり・故障・処分費用は足さない）
// ブラウザでは window.Payback、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  /** 縦の目盛りの刻み: 1・2・5 × 10 の累乗で、端までを 4 つ前後に分けるもの */
  function niceStep(max) {
    var raw = max / 4;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  /**
   * 横の端（年）: 元が取れる年数の 2 倍を切り上げた年。span.min〜span.max で止める。元が取れない・価格 0 なら span.min
   */
  function spanYears(years, span) {
    if (!(years > 0)) return span.min;
    return Math.min(span.max, Math.max(span.min, Math.ceil(years * 2)));
  }

  /**
   * 図の形
   * res = Calc.replacement の返り（oldYenYear・newYenYear・years）。price = 買い替える製品の価格（欄の値）
   * span = constants.js の PAYBACK_YEARS（{ min, max }）
   * hold = { years, top } を渡すと、軸の端をそのまま使う（印にフォーカスが在る間と引いている間）
   * 返り: years（横の端）、top（縦の端）、step（縦の目盛りの刻み）、ticks（縦の目盛りの額）、xTicks（横の目盛りの年）、
   *       old・neu（0 年から横の端までの年ごとの [年, 額]）、cross（交わる年。交わらない・価格 0・横の端の外なら null）
   */
  function chart(res, price, span, hold) {
    var p = typeof price === 'number' && price > 0 ? price : 0;
    var years = hold ? hold.years : spanYears(p > 0 ? res.years : null, span);
    var old = [], neu = [];
    for (var t = 0; t <= years; t++) {
      old.push([t, t * res.oldYenYear]);
      neu.push([t, p + t * res.newYenYear]);
    }
    var top, step;
    if (hold) { top = hold.top; step = hold.step; }
    else {
      var max = Math.max(old[years][1], neu[years][1], p, 1);
      step = niceStep(max);
      top = Math.ceil(max / step) * step;
    }
    var ticks = [];
    for (var v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
    var xStep = years <= 10 ? 2 : 5, xTicks = [];
    for (var x = 0; x <= years; x += xStep) xTicks.push(x);
    // 横の端も目盛りに。1 つ前の目盛りと近すぎる（刻みの半分未満）なら、そちらを端に替える
    if (xTicks[xTicks.length - 1] !== years) {
      if (years - xTicks[xTicks.length - 1] < xStep / 2 && xTicks.length > 1) xTicks.pop();
      xTicks.push(years);
    }
    var cross = p > 0 && res.years !== null && res.years <= years ? res.years : null;
    return { years: years, top: top, step: step, ticks: ticks, xTicks: xTicks, old: old, neu: neu, cross: cross };
  }

  var Payback = { niceStep: niceStep, spanYears: spanYears, chart: chart };
  if (typeof module !== 'undefined' && module.exports) module.exports = Payback;
  else root.Payback = Payback;
})(this);
