// guide が挙げる外の出どころが、どれも constants.js の url にあるか（CHECKED はその出どころを確かめた日。Q-264）。
// 最終確認日の突き合わせの本体は guide-date.test.js（正本の写し）と guide-date.values.json
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

test('guide が挙げる外の出どころは、どれも constants.js の url にある', () => {
  const statics = [...html.matchAll(/<a [^>]*href="(https?:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    .filter((u) => !/^https:\/\/yorozu-craft\.com\//.test(u));
  const { made } = runGuideScript();
  const drawn = made.map((e) => e.href).filter((u) => /^https?:\/\//.test(u));
  const all = [...statics, ...drawn];
  assert.ok(all.length > 0, '外の出どころが 1 つも無い');
  for (const u of all) assert.ok(urls.has(u), `${u} が constants.js に無い`);
});
