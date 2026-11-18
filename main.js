// ===========================
// 家電の電気代・節約額シミュレーター — 画面の制御
// 計算は calc.js（純粋関数）、単価・目安値・出典は constants.js に置く
// ===========================
(function () {
  'use strict';

  var Calc = window.Calc;
  var K = window.Constants;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "denki-dai_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'denki-dai_';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }   // 保存できない環境（プライベートモードなど）でも動くように
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
  };

  // --- 共有 URL（README「ツールを追加するとき」11） ---
  // 家電リストは "#" 以降に入れる（? クエリはサーバーとアクセス解析に届くので使わない）
  // リンクを短くするため、家電は [プリセットのキー, 方式, W, 時間, 日, 待機W, kWh/年, 台数, 名前（変えたときだけ）] の配列にする
  var MAX_SHARE = 4000;   // これより長いリンクは、送り先で切れることがあるので作らない
  function pack(st) {
    return {
      p: +st.unitPrice || 0, c: st.cutHours, t: st.tab === 'rep' ? 1 : 0,
      r: [st.rep.method === 'wh' ? 1 : 0, st.rep.old, st.rep.neu, st.rep.hours, st.rep.days, st.rep.qty, st.rep.price],
      i: st.items.map(function (it) {
        var a = [it.key, it.method === 'annual' ? 1 : 0, it.watt, it.hours, it.days, it.standbyW, it.annualKwh, it.qty];
        var preset = PRESET[it.key];
        if (!preset || it.name !== preset.name) a.push(it.name);
        return a;
      }),
    };
  }
  function unpack(o) {
    if (!o || !Array.isArray(o.i)) return o;   // 古い形（そのままの state）も読めるようにする
    var r = Array.isArray(o.r) ? o.r : [];
    return {
      unitPrice: o.p, cutHours: o.c, tab: o.t ? 'rep' : 'usage',
      rep: { method: r[0] ? 'wh' : 'annual', old: r[1], neu: r[2], hours: r[3], days: r[4], qty: r[5], price: r[6] },
      items: o.i.map(function (a) {
        a = Array.isArray(a) ? a : [];
        var preset = PRESET[a[0]];
        return { key: a[0], method: a[1] ? 'annual' : 'wh', watt: a[2], hours: a[3], days: a[4], standbyW: a[5], annualKwh: a[6], qty: a[7], name: a[8] || (preset && preset.name) };
      }),
    };
  }
  function toShareHash(st) {
    return '#s=' + encodeURIComponent(JSON.stringify(pack(st)));
  }
  function fromShareHash(hash) {
    var m = /^#s=(.+)$/.exec(hash || '');
    if (!m) return null;
    try { return unpack(JSON.parse(decodeURIComponent(m[1]))); } catch (e) { return null; }
  }

  // --- 状態 ---
  var PRESET = {};
  K.PRESETS.forEach(function (p) { PRESET[p.key] = p; });

  function fromPreset(key) {
    var p = PRESET[key] || PRESET.custom;
    return {
      key: p.key, kind: p.kind, name: p.name, method: p.method,
      watt: p.watt == null ? '' : p.watt, hours: p.hours == null ? '' : p.hours, days: p.days == null ? '' : p.days,
      standbyW: p.standbyW || 0, annualKwh: p.annualKwh == null ? '' : p.annualKwh, qty: p.qty || 1,
    };
  }
  function defaults() {
    return {
      unitPrice: K.UNIT_PRICE.value,
      items: ['aircon', 'fridge', 'tv', 'led_bulb'].map(fromPreset),
      cutHours: 1, tab: 'usage',
      rep: { method: 'annual', old: '', neu: '', hours: 8, days: 30, qty: 1, price: '' },
    };
  }
  var FIELDS = ['watt', 'hours', 'days', 'standbyW', 'annualKwh', 'qty'];
  function normalize(s) {
    var d = defaults();
    if (!s || typeof s !== 'object') return d;
    if (+s.unitPrice > 0) d.unitPrice = +s.unitPrice;
    if (Array.isArray(s.items)) {
      d.items = s.items.slice(0, 40).map(function (it) {
        var base = fromPreset(it && it.key);
        base.name = String((it && it.name) || base.name).slice(0, 30);
        base.method = it && it.method === 'annual' ? 'annual' : 'wh';
        FIELDS.forEach(function (f) { if (it && it[f] !== undefined && it[f] !== null) base[f] = it[f] === '' ? '' : +it[f] || 0; });
        return base;
      });
    }
    if ([0.5, 1, 2].indexOf(+s.cutHours) >= 0) d.cutHours = +s.cutHours;
    if (s.tab === 'rep') d.tab = 'rep';
    if (s.rep && typeof s.rep === 'object') Object.keys(d.rep).forEach(function (k) { if (s.rep[k] !== undefined) d.rep[k] = s.rep[k]; });
    d.rep.method = d.rep.method === 'wh' ? 'wh' : 'annual';
    return d;
  }

  var shared = fromShareHash(location.hash);
  var state = normalize(shared || store.get('draft', null));
  var fromShare = !!shared;

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function yen(v) { return Math.round(v).toLocaleString('ja-JP') + ' 円'; }
  function kwh(v) { return (Math.round(v * 10) / 10).toLocaleString('ja-JP') + ' kWh'; }
  function price() { return num(state.unitPrice) > 0 ? num(state.unitPrice) : K.UNIT_PRICE.value; }

  // --- 単価 ---
  $('unit-price').addEventListener('input', function (e) { state.unitPrice = e.target.value; update(); });
  $('reset-price').addEventListener('click', function () { state.unitPrice = K.UNIT_PRICE.value; $('unit-price').value = state.unitPrice; update(); });

  // --- プリセットのチップ ---
  K.PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = '＋ ' + p.name;
    b.addEventListener('click', function () {
      state.items.push(fromPreset(p.key));
      renderItems();
      var last = $('items').lastElementChild;
      if (last) { var inp = last.querySelector('input'); if (inp) inp.focus(); }
      update();
    });
    $('presets').appendChild(b);
  });

  // --- 家電の行 ---
  function field(label, value, attrs, onInput, cls) {
    var wrap = document.createElement('label');
    wrap.className = 'mini' + (cls ? ' ' + cls : '');
    var span = document.createElement('span'); span.textContent = label;
    var inp = document.createElement('input');
    inp.type = attrs.type || 'number';
    Object.keys(attrs).forEach(function (k) { if (k !== 'type') inp.setAttribute(k, attrs[k]); });
    inp.value = value;
    inp.addEventListener('input', function () { onInput(inp.value); });
    wrap.appendChild(span); wrap.appendChild(inp);
    return wrap;
  }
  // 使用時間は「家の家電」（結果の前）と「品目を足す・数字を直す」（結果の後ろ）の 2 か所に出すので、片方を直したらもう片方にも写す
  function hoursField(it, i) {
    var w = field('時間/日', it.hours, { min: 0, max: 24, step: 0.25, inputmode: 'decimal', 'aria-label': it.name + 'の 1 日の使用時間' }, function (v) {
      it.hours = v;
      document.querySelectorAll('input[data-hours="' + i + '"]').forEach(function (e) { if (e !== inp) e.value = v; });
      update();
    }, 'w4');
    var inp = w.querySelector('input');
    inp.setAttribute('data-hours', i);
    return w;
  }

  // 結果の前の「家の家電」: 品目名・使用時間（W × 時間の品目だけ）・1 か月の電気代・消すボタン（SCREEN.md 1.1 の必須の入力）
  function renderQuick() {
    var box = $('quick');
    box.textContent = '';
    if (!state.items.length) {
      var p = document.createElement('p'); p.className = 'small'; p.textContent = '家電がありません。下の「品目を足す・数字を直す」の品目を押して足してください。';
      box.appendChild(p);
    }
    state.items.forEach(function (it, i) {
      var row = document.createElement('div');
      row.className = 'qrow';
      var name = document.createElement('span'); name.className = 'qname'; name.textContent = it.name;
      row.appendChild(name);
      var ctl = document.createElement('span'); ctl.className = 'qctl';
      if (it.method === 'annual') {
        var a = document.createElement('span'); a.className = 'qannual'; a.textContent = (it.annualKwh === '' ? '—' : it.annualKwh) + ' kWh/年';
        ctl.appendChild(a);
      } else {
        ctl.appendChild(hoursField(it, i));
      }
      var cost = document.createElement('span'); cost.className = 'item-cost'; cost.id = 'qcost-' + i;
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'icon-btn'; del.textContent = '×';
      del.setAttribute('aria-label', it.name + 'を消す');
      del.addEventListener('click', function () { state.items.splice(i, 1); renderItems(); update(); });
      ctl.appendChild(cost); ctl.appendChild(del); row.appendChild(ctl);
      box.appendChild(row);
    });
  }

  function renderItems() {
    renderQuick();
    var box = $('items');
    box.textContent = '';
    if (!state.items.length) {
      var p = document.createElement('p'); p.className = 'small'; p.textContent = '家電がありません。上の品目を押して足してください。';
      box.appendChild(p);
    }
    state.items.forEach(function (it, i) {
      var row = document.createElement('div');
      row.className = 'item';
      var head = document.createElement('div'); head.className = 'item-head';
      var name = document.createElement('input');
      name.type = 'text'; name.value = it.name; name.maxLength = 30; name.className = 'item-name';
      name.setAttribute('aria-label', (i + 1) + ' 行目の品目名');
      name.addEventListener('input', function () { it.name = name.value; renderQuick(); update(); });
      var cost = document.createElement('span'); cost.className = 'item-cost'; cost.id = 'cost-' + i;
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'icon-btn'; del.textContent = '×';
      del.setAttribute('aria-label', it.name + 'を消す');
      del.addEventListener('click', function () { state.items.splice(i, 1); renderItems(); update(); });
      head.appendChild(name); head.appendChild(cost); head.appendChild(del);
      row.appendChild(head);

      var body = document.createElement('div'); body.className = 'item-body';
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', it.name + 'の計算方法');
      [['wh', 'W × 時間'], ['annual', '年間 kWh']].forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
      });
      sel.value = it.method;
      sel.addEventListener('change', function () { it.method = sel.value; renderItems(); update(); });
      body.appendChild(sel);
      var lab = it.name;
      if (it.method === 'annual') {
        body.appendChild(field('kWh/年', it.annualKwh, { min: 0, step: 1, inputmode: 'decimal', 'aria-label': lab + 'の年間消費電力量（kWh/年）' }, function (v) { it.annualKwh = v; renderQuick(); update(); }, 'w6'));
      } else {
        body.appendChild(field('W', it.watt, { min: 0, step: 1, inputmode: 'decimal', 'aria-label': lab + 'の消費電力（W）' }, function (v) { it.watt = v; update(); }, 'w5'));
        body.appendChild(hoursField(it, i));
        body.appendChild(field('日/月', it.days, { min: 0, max: 31, step: 1, inputmode: 'numeric', 'aria-label': lab + 'の 1 か月の使用日数' }, function (v) { it.days = v; update(); }, 'w4'));
        body.appendChild(field('待機 W', it.standbyW, { min: 0, step: 0.1, inputmode: 'decimal', 'aria-label': lab + 'の待機電力（W）' }, function (v) { it.standbyW = v; update(); }, 'w4'));
      }
      body.appendChild(field('台数', it.qty, { min: 1, max: 99, step: 1, inputmode: 'numeric', 'aria-label': lab + 'の台数' }, function (v) { it.qty = v; update(); }, 'w3'));
      row.appendChild(body);
      var p = PRESET[it.key];
      if (p && p.hint) {
        var hint = document.createElement('p'); hint.className = 'item-hint';
        hint.textContent = (it.method === 'annual' && p.method !== 'annual') ? '年間消費電力量（kWh/年）を入れてください' : p.hint;
        row.appendChild(hint);
      }
      box.appendChild(row);
    });
  }

  // --- 結果 ---
  function missingValue(it) {
    return it.method === 'annual' ? !(num(it.annualKwh) > 0) : !(num(it.watt) > 0);
  }
  function renderResult(sum) {
    $('k-month').textContent = yen(sum.total.yenMonth);
    $('k-year').textContent = yen(sum.total.yenYear);
    $('k-kwh').textContent = kwh(sum.total.kwhMonth);
    sum.rows.forEach(function (r) {
      var t = missingValue(state.items[r.index]) ? '値を入れてください' : '月 ' + yen(r.yenMonth);
      ['cost-', 'qcost-'].forEach(function (pre) { var el = $(pre + r.index); if (el) el.textContent = t; });
    });
    var missing = state.items.filter(missingValue).map(function (it) { return it.name; });
    $('warnings').hidden = !missing.length;
    $('warnings').textContent = missing.length ? missing.join('・') + ' の消費電力（W）か年間消費電力量（kWh/年）が空のため、0 円として数えています。本体の表示やカタログの値を入れてください。' : '';
    renderRanking(sum);
    renderHousehold(sum);
    lastSum = sum;
    renderMonthly();
  }

  // 月ごとの平均（家計調査の月次）の縦棒と、この画面の 1 か月の額の横の線。系列は図の上で選ぶ（保存しない・計算に入れない）
  // 月は聞かない（端末の今日の月）。1 人の系列は無い（単身世帯の月次の表が無い）
  var lastSum = null;
  var monthlyLabel = K.HOUSEHOLD_MONTHLY.series[0].label;
  (function () {
    var pick = $('monthly-pick');
    K.HOUSEHOLD_MONTHLY.series.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = s.label; b.dataset.label = s.label;
      b.addEventListener('click', function () { monthlyLabel = s.label; renderMonthly(); });
      pick.appendChild(b);
    });
  })();
  function renderMonthly() {
    if (!lastSum) return;
    [].forEach.call($('monthly-pick').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.label === monthlyLabel)); });
    var box = $('monthly');
    box.textContent = '';
    var ch = Calc.monthlyChart(K.HOUSEHOLD_MONTHLY, monthlyLabel, new Date().getMonth() + 1, lastSum.total.yenMonth, state.items.length > 0);
    var W = 640, L = 8, R = 8, top = 60, plotH = 260, bottom = 40, H = top + plotH + bottom;
    var colW = (W - L - R) / 12, barW = colW * 0.62;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '月ごとの 1 か月の電気代の平均（家計調査、' + ch.label + '）：' +
      ch.bars.map(function (b) { return b.month + '月 ' + (b.yen === null ? '—' : yen(b.yen)); }).join('、') + (ch.line ? '。この画面の 1 か月 ' + yen(ch.line.yen) : ''));
    function el(name, attrs, text) {
      var e = document.createElementNS(SVGNS, name);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text !== undefined) e.textContent = text;
      svg.appendChild(e); return e;
    }
    var base = top + plotH;
    ch.bars.forEach(function (b, i) {
      var cx = L + colW * i + colW / 2;
      if (b.yen !== null) {
        var h = Math.max(2, plotH * b.frac);
        el('rect', { x: cx - barW / 2, y: base - h, width: barW, height: h, rx: 3, class: b.current ? 'bar current' : 'bar', 'data-month': b.month });
        if (b.current) {
          // 今日の月の印: 棒の上の下向きの三角と額
          var ty = base - h - 8;
          el('path', { d: 'M' + (cx - 11) + ' ' + (ty - 14) + ' L' + (cx + 11) + ' ' + (ty - 14) + ' L' + cx + ' ' + ty + ' Z', class: 'mark', 'data-month': b.month });
          el('text', { x: Math.min(Math.max(cx, 70), W - 70), y: ty - 22, 'text-anchor': 'middle', class: 'bar-value' }, yen(b.yen));
        }
      } else if (b.current) {
        el('path', { d: 'M' + (cx - 11) + ' ' + (base - 22) + ' L' + (cx + 11) + ' ' + (base - 22) + ' L' + cx + ' ' + (base - 8) + ' Z', class: 'mark', 'data-month': b.month });
      }
      el('text', { x: cx, y: base + 30, 'text-anchor': 'middle', class: b.current ? 'bar-label current' : 'bar-label' }, String(b.month));
    });
    if (ch.line) {
      var y = base - plotH * ch.line.frac;
      el('line', { x1: L, y1: y, x2: W - R, y2: y, class: 'you-line', 'data-frac': ch.line.frac });
      // 額の字は棒に重ねず、図の左上に線の見本と並べる
      el('line', { x1: L, y1: 18, x2: L + 36, y2: 18, class: 'you-line' });
      el('text', { x: L + 46, y: 26, class: 'you-label' }, 'この画面 ' + yen(ch.line.yen));
    }
    box.appendChild(svg);
  }

  // 世帯の人数ごとの平均（家計調査）の横棒と、この画面の 1 か月の額の縦の線。世帯の人数は聞かない
  function renderHousehold(sum) {
    var box = $('household');
    box.textContent = '';
    var ch = Calc.householdChart(K.HOUSEHOLD.rows, sum.total.yenMonth, state.items.length > 0);
    var W = 640, L = 130, R = 140, top = ch.line ? 40 : 6, rowH = 46, H = top + ch.bars.length * rowH + 6;
    var plot = W - L - R;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '世帯の人数ごとの 1 か月の電気代の平均（家計調査 ' + K.HOUSEHOLD.year + ' 年）：' +
      ch.bars.map(function (b) { return b.label + ' ' + yen(b.yen); }).join('、') + (ch.line ? '。この画面の 1 か月 ' + yen(ch.line.yen) : ''));
    function el(name, attrs, text) {
      var e = document.createElementNS(SVGNS, name);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text !== undefined) e.textContent = text;
      svg.appendChild(e); return e;
    }
    ch.bars.forEach(function (b, i) {
      var y = top + i * rowH;
      var w = Math.max(2, plot * b.frac);
      el('text', { x: L - 10, y: y + 30, 'text-anchor': 'end', class: 'bar-label' }, b.label);
      el('rect', { x: L, y: y + 8, width: w, height: 30, rx: 4, class: 'bar' });
      el('text', { x: L + w + 10, y: y + 30, class: 'bar-value' }, yen(b.yen));
    });
    if (ch.line) {
      var x = L + plot * ch.line.frac;
      el('line', { x1: x, y1: top - 6, x2: x, y2: H - 2, class: 'you-line', 'data-frac': ch.line.frac });
      el('text', { x: x, y: top - 14, 'text-anchor': ch.line.frac > 0.5 ? 'end' : 'start', class: 'you-label' }, 'この画面 ' + yen(ch.line.yen));
    }
    box.appendChild(svg);
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  // ランキング: 1 家電 1 本の横棒（物差しはいちばん額の多い家電）。W × 時間の家電は棒の右の端に印（Q-511）
  // 印を引く・← → で「時間/日」が変わる。動かしている間（引いている間と、印にフォーカスがある間）は並びと物差しを変えず、
  // 指を離した時・フォーカスが外れた時に並べ直す
  var BIG_STEP_HOURS = 1;    // Shift と ← → で動かす時間
  var ROW_PX = 52;           // 1 行の高さ（画面の px）。印の当たり 44 px と、上下の間 8 px
  var rankHold = null;       // 動かしている間の並びと物差し
  var rankDrag = null;       // 引いている印
  var rankRebuilding = false;
  var lastRankSum = null;
  function markable(it) { return !!it && it.method !== 'annual' && num(it.watt) > 0; }
  function hoursAttrs(i) {
    var inp = document.querySelector('input[data-hours="' + i + '"]');
    return { min: num(inp && inp.min), max: num(inp && inp.max), step: num(inp && inp.step) };
  }
  function markLabel(i) { return state.items[i].name + 'の 1 日の使用時間 ' + num(state.items[i].hours) + ' 時間'; }
  function rankName(r) { return r.name.length > 9 ? r.name.slice(0, 8) + '…' : r.name; }
  function setHours(i, h) {
    var it = state.items[i];
    if (num(it.hours) === h && it.hours !== '') return;
    it.hours = h;
    document.querySelectorAll('input[data-hours="' + i + '"]').forEach(function (e) { e.value = h; });
    update();
  }
  function renderRanking(sum) {
    lastRankSum = sum;
    if (rankHold && rankHold.order.every(function (i) { return sum.rows[i]; }) && rankHold.count === sum.rows.length) { moveRanking(sum); return; }
    rankHold = null;
    var box = $('ranking');
    var focused = document.activeElement && document.activeElement.classList.contains('rank-mark') ? +document.activeElement.dataset.index : null;
    rankRebuilding = true;
    box.textContent = '';
    rankRebuilding = false;
    var rows = sum.ranking.filter(function (r) { return r.yenMonth > 0 || markable(state.items[r.index]); });
    if (!rows.length) { var p = document.createElement('p'); p.className = 'small'; p.textContent = '値を入れると、ここに多い順で並びます。'; box.appendChild(p); return; }
    // 1 行の高さは画面で ROW_PX 以上に（狭い画面では図が縮むので、そのぶん図の中の行を高くする）
    var W = 640, scale = (box.clientWidth || W) / W;
    var rowH = Math.max(ROW_PX, Math.ceil(ROW_PX / scale)), gap = Math.ceil((44 / 2 + 12) / scale);
    var L = 250, R = 140 + gap, H = rows.length * rowH + 6, plot = W - L - R;
    var g = { W: W, H: H, L: L, plot: plot, gap: gap, rowH: rowH, cap: (W - L - 8) / plot, max: rows[0].yenMonth, els: {} };
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    function el(name, attrs, text) {
      var e = document.createElementNS(SVGNS, name);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (text !== undefined) e.textContent = text;
      svg.appendChild(e); return e;
    }
    rows.forEach(function (r, k) {
      var y = k * rowH + (rowH - 34) / 2 + 3;
      el('text', { x: L - 10, y: y + 26, 'text-anchor': 'end', class: 'bar-label' }, rankName(r));
      g.els[r.index] = {
        y: y,
        rect: el('rect', { x: L, y: y, width: 2, height: 34, rx: 5, class: 'bar', 'data-index': r.index }),
        text: el('text', { y: y + 26, class: 'bar-value' }),
      };
    });
    box.appendChild(svg);
    rows.forEach(function (r) {
      if (!markable(state.items[r.index])) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'rank-mark'; b.dataset.index = r.index;
      b.style.top = ((g.els[r.index].y + 17) / H * 100) + '%';
      b.addEventListener('focus', onMarkFocus);
      b.addEventListener('blur', onMarkBlur);
      b.addEventListener('keydown', onMarkKey);
      b.addEventListener('pointerdown', onMarkDown);
      b.addEventListener('pointermove', onMarkMove);
      b.addEventListener('pointerup', onMarkUp);
      b.addEventListener('pointercancel', onMarkUp);
      box.appendChild(b);
      g.els[r.index].mark = b;
    });
    g.svg = svg;
    g.order = rows.map(function (r) { return r.index; });
    g.count = sum.rows.length;
    rankGeom = g;
    drawRanking(g, sum);
    if (focused !== null && g.els[focused] && g.els[focused].mark) g.els[focused].mark.focus();
  }
  var rankGeom = null;
  // 棒の長さ・額の字・印の位置だけを書き換える（並びと物差しは g のまま）
  function drawRanking(g, sum) {
    g.order.forEach(function (i) {
      var r = sum.rows[i], e = g.els[i];
      var w = Math.max(2, g.plot * Calc.rankFrac(r.yenMonth, g.max, g.cap));
      e.rect.setAttribute('width', w);
      e.text.setAttribute('x', g.L + w + g.gap);
      e.text.textContent = yen(r.yenMonth);
      if (e.mark) {
        e.mark.style.left = ((g.L + w) / g.W * 100) + '%';
        e.mark.setAttribute('aria-label', markLabel(i));
      }
    });
    g.svg.setAttribute('aria-label', '1 か月の電気代の多い順：' + g.order.map(function (i) { return sum.rows[i].name + ' ' + yen(sum.rows[i].yenMonth); }).join('、'));
  }
  function moveRanking(sum) { drawRanking(rankGeom, sum); }
  function onMarkFocus() { if (!rankHold && rankGeom) rankHold = rankGeom; }
  function onMarkBlur(e) {
    if (rankRebuilding || rankDrag) return;
    var next = e.relatedTarget && e.relatedTarget.classList && e.relatedTarget.classList.contains('rank-mark') ? +e.relatedTarget.dataset.index : null;
    rankHold = null;
    if (!lastRankSum) return;
    renderRanking(lastRankSum);
    if (next !== null && rankGeom.els[next] && rankGeom.els[next].mark) rankGeom.els[next].mark.focus();
  }
  function onMarkKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    var i = +this.dataset.index, a = hoursAttrs(i);
    var d = (e.shiftKey ? BIG_STEP_HOURS : a.step) * (e.key === 'ArrowRight' ? 1 : -1);
    setHours(i, Calc.stepHours(state.items[i].hours, d, a.min, a.max, a.step));
  }
  function onMarkDown(e) {
    if (e.button !== 0) return;
    try { this.setPointerCapture(e.pointerId); } catch (err) { /* 捕まえられなくても、印の上の動きで動かす */ }
    this.focus();
    rankDrag = { id: e.pointerId };
    e.preventDefault();
  }
  function onMarkMove(e) {
    if (!rankDrag || rankDrag.id !== e.pointerId || !rankGeom) return;
    var g = rankGeom, i = +this.dataset.index, a = hoursAttrs(i), it = state.items[i];
    var box = g.svg.getBoundingClientRect();
    var frac = Math.min(g.cap, Math.max(0, ((e.clientX - box.left) / box.width * g.W - g.L) / g.plot));
    var h = Calc.hoursAtFrac(frac, function (v) {
      return Calc.summarize([calcItem(Object.assign({}, it, { hours: v }))], price()).rows[0].yenMonth;
    }, g.max, a.min, a.max, a.step, it.hours);
    setHours(i, h);
  }
  function onMarkUp(e) {
    if (!rankDrag || rankDrag.id !== e.pointerId) return;
    rankDrag = null;
    var i = +this.dataset.index;
    rankHold = null;
    renderRanking(lastRankSum);   // 並べ直す。フォーカスは同じ家電の印に戻す
    if (rankGeom && rankGeom.els[i] && rankGeom.els[i].mark) rankGeom.els[i].mark.focus();
  }
  document.addEventListener('selectstart', function (e) { if (rankDrag) e.preventDefault(); });   // 引いている間に字を選ばない
  window.addEventListener('resize', function () { if (!rankHold && lastRankSum) renderRanking(lastRankSum); });

  // --- 使い方の見直し ---
  $('cut-hours').addEventListener('change', function (e) { state.cutHours = +e.target.value; update(); });
  function renderTips() {
    var list = Calc.usageChanges(state.items.map(function (it) { return Object.assign({}, it, { watt: num(it.watt), hours: num(it.hours), days: num(it.days), standbyW: num(it.standbyW), annualKwh: num(it.annualKwh), qty: num(it.qty) || 1 }); }), price(), K.TIPS, { cutHours: state.cutHours });
    var ol = $('tips');
    ol.textContent = '';
    if (!list.length) { var li0 = document.createElement('li'); li0.textContent = '家電を足すと、節約の方法が出ます。'; ol.appendChild(li0); return; }
    list.slice(0, 12).forEach(function (t) {
      var li = document.createElement('li');
      var strong = document.createElement('strong'); strong.textContent = '年 ' + yen(t.yenYear);
      li.appendChild(strong);
      li.appendChild(document.createTextNode(' ' + t.title + '（' + kwh(t.kwhYear) + '）'));
      if (t.note) {
        var s = document.createElement('span'); s.className = 'tip-note';
        var src = K.SOURCES[t.source];
        s.textContent = '条件：' + t.note + '。出典：' + (src ? src.publisher : '');
        li.appendChild(s);
      }
      ol.appendChild(li);
    });
  }

  // --- 買い替え ---
  var repIds = { old: 'rep-old', neu: 'rep-new', hours: 'rep-hours', days: 'rep-days', qty: 'rep-qty', price: 'rep-price' };
  Object.keys(repIds).forEach(function (k) { $(repIds[k]).addEventListener('input', function (e) { state.rep[k] = e.target.value; update(); }); });
  $('rep-method').addEventListener('change', function (e) { state.rep.method = e.target.value; syncRep(); update(); });
  function syncRep() {
    var wh = state.rep.method === 'wh';
    $('rep-wh').hidden = !wh;
    $('rep-old-label').textContent = '今の製品（' + (wh ? 'W' : 'kWh/年') + '）';
    $('rep-new-label').textContent = '買い替える製品（' + (wh ? 'W' : 'kWh/年') + '）';
  }
  function renderRep() {
    var r = state.rep, wh = r.method === 'wh';
    var res = Calc.replacement({
      method: r.method, oldWatt: num(r.old), newWatt: num(r.neu), oldAnnualKwh: num(r.old), newAnnualKwh: num(r.neu),
      hours: num(r.hours), days: num(r.days), qty: num(r.qty) || 1, price: num(r.price), unitPrice: price(),
    });
    var filled = num(r.old) > 0 && num(r.neu) > 0;
    $('r-saving').textContent = filled ? (res.savingYear >= 0 ? '年 ' + yen(res.savingYear) + ' 安く' : '年 ' + yen(-res.savingYear) + ' 高く') : '—';
    $('r-years').textContent = !filled ? '—' : res.years === null ? '元は取れない' : !(num(r.price) > 0) ? '価格を入れてください' : (Math.round(res.years * 10) / 10) + ' 年';
    $('r-detail').textContent = filled ? '今の製品 年 ' + yen(res.oldYenYear) + '（' + kwh(res.oldKwhYear) + '）→ 買い替え後 年 ' + yen(res.newYenYear) + '（' + kwh(res.newKwhYear) + '）。単価 ' + price() + ' 円/kWh で計算。' + (wh ? '' : ' 年間消費電力量は、カタログや本体の表示の値を入れてください。') : '今の製品と、買い替える製品の値を入れてください。';
  }
  (function renderRepHints() {
    K.REPLACE_HINTS.forEach(function (h) { var li = document.createElement('li'); li.textContent = h.text; $('rep-hints').appendChild(li); });
    var li = document.createElement('li'); li.textContent = '出典：資源エネルギー庁 省エネポータルサイト「機器の買換で省エネ節約」';
    li.className = 'src'; $('rep-hints').appendChild(li);
  })();

  // --- タブ ---
  var tabs = [$('tab-usage'), $('tab-rep')];
  function selectTab(name) {
    state.tab = name;
    tabs.forEach(function (t) {
      var on = (t.id === 'tab-rep') === (name === 'rep');
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { selectTab(t.id === 'tab-rep' ? 'rep' : 'usage'); update(); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { selectTab(state.tab === 'rep' ? 'usage' : 'rep'); $(state.tab === 'rep' ? 'tab-rep' : 'tab-usage').focus(); update(); }
    });
  });

  // --- 共有リンク ---
  $('share').addEventListener('click', function () {
    var hash = toShareHash(state);
    if (hash.length > MAX_SHARE) { syncShare(); return; }
    var url = location.href.split('#')[0] + hash;
    history.replaceState(null, '', url);
    var msg = 'リンクをコピーしました。家電リストはリンクの「#」以降に入っていて、サーバーには送信されません。';
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(function () { $('share-msg').textContent = msg; }, function () { $('share-msg').textContent = 'アドレスバーのリンクをコピーしてください。'; });
    else $('share-msg').textContent = 'アドレスバーのリンクをコピーしてください。';
  });
  function syncShare() {
    var tooLong = toShareHash(state).length > MAX_SHARE;
    $('share').disabled = tooLong;
    if (tooLong) $('share-msg').textContent = '家電が多いためリンクが長くなりすぎます。品目を減らすと共有できます（この端末には自動で保存されています）。';
  }

  // --- ファイルへの書き出し・読み込み（README「ツールを追加するとき」20。決定 D31） ---
  // 中身はこの端末の中で作り、どこにも送信しない。機種変更のときはファイルを移して読み込む
  var TOOL = 'denki-dai';
  $('backup-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(Calc.buildBackup(TOOL, { draft: state }), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = Calc.backupFileName(TOOL);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('share-msg').textContent = 'ファイルに書き出しました。機種変更のときは、このファイルを新しい端末に移して「ファイルから読み込む」を押してください。';
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { $('share-msg').textContent = 'ファイルが大きすぎます。このツールで書き出したファイルを選んでください。'; return; }
    file.text().then(function (text) {
      var r = Calc.parseBackup(text, TOOL, ['draft']);
      if (!r.ok) { $('share-msg').textContent = r.error; return; }
      if (!window.confirm('ファイルの内容で、今の家電リストと単価を置き換えます。よろしいですか？')) return;
      state = normalize(r.data.draft); fromShare = false;
      fillForm(); update();
      $('share-msg').textContent = 'ファイルから読み込みました（家電 ' + state.items.length + ' 品目）。';
    }, function () { $('share-msg').textContent = 'ファイルを読み取れませんでした。'; });
  });

  // --- 上端の固定バーと「くわしく入れる」の状態表示（screen.js。yorozu-plans の SCREEN.md 1.1） ---
  // 読み込み時から結果が出ているので、スクロールか入力をするまではバーを出さない（CLS を出さない）
  var bar = window.YorozuScreen.fixedBar({ bar: 'fixbar', watch: 'result-main', jump: 'result-card', text: 'fixbar-text' });
  var barArmed = false, barText = '';
  function armBar() {
    if (barArmed) return;
    barArmed = true;
    window.removeEventListener('scroll', armBar);
    document.removeEventListener('input', armBar);
    document.removeEventListener('change', armBar);
    bar.set(barText);
  }
  window.addEventListener('scroll', armBar, { passive: true });
  document.addEventListener('input', armBar);
  document.addEventListener('change', armBar);

  function updateSummaries() {
    var missing = state.items.filter(missingValue).length;
    window.YorozuScreen.detailsSummary({
      'opt-items': state.items.length + ' 品目' + (missing ? '（' + missing + ' 品目は値が空）' : ''),
      'opt-price': price() + ' 円/kWh',
      'opt-save': $(state.tab === 'rep' ? 'tab-rep' : 'tab-usage').textContent,
    });
  }

  // --- 全体の更新 ---
  // summarize に渡す形（欄の字を数に）。ランキングの印を引く時も同じ形で額を取る
  function calcItem(it) { return { name: it.name, method: it.method, watt: num(it.watt), hours: num(it.hours), days: num(it.days), standbyW: num(it.standbyW), annualKwh: num(it.annualKwh), qty: num(it.qty) || 1 }; }
  function update() {
    if (!fromShare) store.set('draft', state);
    renderResult(Calc.summarize(state.items.map(calcItem), price()));
    renderTips();
    renderRep();
    syncShare();
    updateSummaries();
    // 固定バーは「1 か月」の電気代（結果の見出しと同じ語）
    barText = state.items.length ? '1 か月 ' + $('k-month').textContent : '';
    if (barArmed) bar.set(barText);
    window.yzUsed?.();
  }

  // 共有リンクから開いたときは、保存中の下書きを上書きしない（操作したら下書きとして保存し直す）
  ['input', 'change', 'click'].forEach(function (ev) {
    document.addEventListener(ev, function () { fromShare = false; }, { once: true, capture: true });
  });

  // 前提の時点
  (function () {
    $('asof-price').textContent = K.UNIT_PRICE.value + ' 円/kWh・' + K.SOURCES.eftc.publisher.replace('公益社団法人 ', '');
    var hc = K.HOUSEHOLD.checked.split('-');
    $('household-src').textContent = '出典: ' + K.SOURCES.kakei2p.publisher + ' 家計調査（' + K.HOUSEHOLD.year + ' 年平均）・確認日 ' + hc[0] + '年' + (+hc[1]) + '月' + (+hc[2]) + '日';
    var M = K.HOUSEHOLD_MONTHLY, mc = M.checked.split('-');
    $('monthly-src').textContent = '出典: ' + K.SOURCES[M.source].publisher + ' 家計調査（月次・' + Calc.monthlyPeriod(M.months) + '）・確認日 ' + mc[0] + '年' + (+mc[1]) + '月' + (+mc[2]) + '日';
    var d = K.CHECKED.split('-');
    var months = (new Date().getFullYear() - d[0]) * 12 + (new Date().getMonth() + 1 - d[1]);
    if (months >= K.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。目安単価の確認から時間がたっています'));
    }
  })();

  // 入力欄を state に合わせる（起動時と、ファイルから読み込んだとき）
  function fillForm() {
    $('unit-price').value = state.unitPrice;
    $('cut-hours').value = String(state.cutHours);
    $('rep-method').value = state.rep.method;
    Object.keys(repIds).forEach(function (k) { $(repIds[k]).value = state.rep[k]; });
    syncRep();
    selectTab(state.tab);
    renderItems();
  }
  fillForm();
  update();
  document.documentElement.classList.remove('js-loading');
})();
