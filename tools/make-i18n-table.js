/* 訳の JSON（{ "日本語": "訳", … }）から、ui/i18n/<言語>.js を作る
 *
 *   node tools\make-i18n-table.js <言語コード> <言語の名前> <訳.json か いまの表.js> [<訳.json> …]
 *
 * いくつかの JSON（と、いまの ui\i18n\<言語>.js）をまとめ、あとのものを優先して、もとの日本語（tools/check-i18n.js --keys）の順にならべて書きます。
 * 表を手で直すときは、ui/i18n/<言語>.js を直接直してかまいません（このスクリプトは作りなおすときだけ使います）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [code, name, ...files] = process.argv.slice(2);
if (!code || !name || !files.length) {
  console.log('使いかた: node tools\\make-i18n-table.js <言語コード> <言語の名前> <訳.json> …');
  process.exit(1);
}
const root = path.resolve(__dirname, '..');
// いまの表（ui\i18n\<言語>.js）も、そのまま読める（足すぶんの JSON とまとめるため）
function readTable(f) {
  if (!f.endsWith('.js')) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const sandbox = { window: { NASHI: {} } };
  require('vm').runInNewContext(fs.readFileSync(f, 'utf8'), sandbox);
  return (sandbox.window.NASHI.I18N_TABLES || {})[code] || {};
}
const merged = {};
for (const f of files) Object.assign(merged, readTable(f));
const order = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'check-i18n.js'), '--keys'], { encoding: 'utf8' }));

const lines = [];
for (const k of order) {
  if (Object.prototype.hasOwnProperty.call(merged, k)) lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(merged[k])},`);
}
const body = [
  `/* なしスタジオ - 画面のことば: ${name}`,
  ' * もとの日本語 → この言語。足りない・余る・はめこみ違いは tools/check-i18n.js が見ます。',
  ' * {名前} と %名前 と HTML のタグは、もとと同じものを残してください。',
  ' */',
  '\'use strict\';',
  'window.NASHI = window.NASHI || {};',
  'window.NASHI.I18N_TABLES = window.NASHI.I18N_TABLES || {};',
  `window.NASHI.I18N_TABLES[${JSON.stringify(code)}] = {`,
  ...lines,
  '};',
  '',
].join('\r\n');
fs.writeFileSync(path.join(root, 'ui', 'i18n', `${code}.js`), body);
console.log(`ui\\i18n\\${code}.js に ${lines.length} 件を書きました（もとのことばは ${order.length} 件）`);
