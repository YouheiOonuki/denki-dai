// guide の「最終確認日」が constants.js の CHECKED から出ていて、手で書いた控えが無いか（Q-264、yorozu-plans の QUEUE 2026-11-17。otasuke の tests/guide-date.test.js と同じ目的）。
// このリポジトリの guide.html は日付を HTML に持たず、末尾の script が constants.js の CHECKED を #checked に描く（正は 1 か所）。
// なので比べる相手は「HTML の日付」ではなく、(1) HTML の #checked が空のままか、(2) script を動かすと CHECKED がそのまま出るか、
// (3) guide が挙げる外の出どころが constants.js の url にあるか（CHECKED はその出どころを確かめた日）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
const K = require('../constants.js');

// constants.js の木にある url を全部
const urls = new Set();
(function walk(o) {
  if (!o || typeof o !== 'object') return;
  for (const v of Object.values(o)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) urls.add(v);
    else walk(v);
  }
})(K);

// script を動かすための最小の DOM
function el() {
  return {
    children: [], dataset: {}, style: {}, href: '', textContent: '', dateTime: '',
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this[k] = v; },
  };
}
function runGuideScript() {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const body = scripts.find((s) => s.includes('K.CHECKED'));
  assert.ok(body, 'guide.html に CHECKED を描く script が無い');
  const byId = {}, made = [];
  const document = {
    getElementById: (id) => (byId[id] ||= el()),
    querySelector: () => el(),
    createElement: () => { const e = el(); made.push(e); return e; },
    createTextNode: (t) => ({ textContent: t }),
  };
  const window = {};
  const ctx = vm.createContext({ window, document });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'constants.js'), 'utf8'), Object.assign(ctx, { module: undefined }));
  // constants.js は this に Constants を置く（ブラウザでは window）
  window.Constants = ctx.Constants;
  vm.runInContext(body, ctx);
  return { byId, made };
}

test('CHECKED は ISO の日付で、今日より先でない', () => {
  assert.match(K.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(K.CHECKED <= new Date().toISOString().slice(0, 10));
});

test('guide.html の #checked は空（日付の控えを HTML に持たない）', () => {
  assert.match(html, /<time datetime="" id="checked"><\/time>/);
});

test('script を動かすと #checked に CHECKED がそのまま出る', () => {
  const { byId } = runGuideScript();
  const [y, m, d] = K.CHECKED.split('-').map(Number);
  assert.equal(byId.checked.dateTime, K.CHECKED);
  assert.equal(byId.checked.textContent, `${y}年${m}月${d}日`);
});

test('guide が挙げる外の出どころは、どれも constants.js の url にある', () => {
  const statics = [...html.matchAll(/<a [^>]*href="(https?:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    .filter((u) => !/^https:\/\/yorozu-craft\.com\//.test(u));
  const { made } = runGuideScript();
  const drawn = made.map((e) => e.href).filter((u) => /^https?:\/\//.test(u));
  const all = [...statics, ...drawn];
  assert.ok(all.length > 0, '外の出どころが 1 つも無い');
  for (const u of all) assert.ok(urls.has(u), `${u} が constants.js に無い`);
});
