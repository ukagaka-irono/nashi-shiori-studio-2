/* 画面のことばの、訳し忘れ・書き忘れを見つける
 *
 *   node tools\check-i18n.js            点検する（.\build.ps1 -Test でも走ります）
 *   node tools\check-i18n.js --keys     表に入れるべき日本語のことばを、すべて出す（訳す人向け）
 *   node tools\check-i18n.js --missing en   その言語の表に足りないことばを、JSON で出す
 *
 * 画面のことばは日本語がもとで、ほかの言語は ui/i18n/<言語>.js の表（日本語 → その言語）で引きます
 * （ui/js/i18n.js）。ここで見るのは:
 *
 *   1. ui/js/*.js に、T() を通していない日本語の文字列が残っていないか
 *      （その行に「i18n-ignore」と書いてあるものは見ない。画面に出さない日本語のため）
 *   2. どの言語の表にも、T() と index.html のことばが全部あるか・使っていないことばが残っていないか
 *   3. 訳の {名前} と %名前（ブロックの欄）と HTML のタグが、もとと同じか
 *
 * ssp-i18n の tools/i18n_check.py と同じ考えです（もとの言語と見くらべて、足りない・余る・はめこみ違いを出す）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'ui', 'js');
const tableDir = path.join(root, 'ui', 'i18n');
const C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };

const JA = /[　-ヿ㐀-鿿＀-￯]/;

// ------------------------------------------------------------ JS を字句に分ける
// 文字列・テンプレート文字列・コメント・正規表現を見分けるだけの、小さな読み手です。
function scanJs(src) {
  const out = [];        // { kind: 'str' | 'tpl', raw, start, end }
  let i = 0;
  let lastSig = '';      // 直前の、空白でない文字（正規表現か割り算かを見分ける）
  let lastWord = '';
  const tplStack = [];   // テンプレート文字列の ${ } の深さ
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '\'' || c === '"') {
      const s = i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      out.push({ kind: 'str', raw: src.slice(s, i), start: s, end: i });
      lastSig = c; lastWord = '';
      continue;
    }
    if (c === '`' || (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === 0)) {
      // テンプレート文字列（またはその ${ } のあとの続き）
      if (c === '}') tplStack.pop();
      const s = i++;
      let closed = false;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') { i++; closed = true; break; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; tplStack.push(0); break; }
        i++;
      }
      out.push({ kind: 'tpl', raw: src.slice(s, i), start: s, end: i });
      lastSig = closed ? '`' : '{'; lastWord = '';
      continue;
    }
    if (c === '{' && tplStack.length) { tplStack[tplStack.length - 1]++; }
    if (c === '}' && tplStack.length) { tplStack[tplStack.length - 1]--; }
    if (c === '/') {
      const regexOk = lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig)
        || ['return', 'typeof', 'case', 'of', 'in'].includes(lastWord);
      if (regexOk) {
        i++;
        let inClass = false;
        while (i < src.length) {
          const d = src[i];
          if (d === '\\') { i += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          else if (d === '\n') break;
          i++;
        }
        i++;
        while (/[a-z]/i.test(src[i] || '')) i++;
        lastSig = ')'; lastWord = '';
        continue;
      }
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) {
      const s = i;
      while (i < src.length && /[\w$]/.test(src[i])) i++;
      lastWord = src.slice(s, i);
      lastSig = 'w';
      continue;
    }
    lastSig = c; lastWord = '';
    i++;
  }
  return out;
}

function lineOf(src, pos) {
  let n = 1;
  for (let k = 0; k < pos; k++) if (src.charCodeAt(k) === 10) n++;
  return n;
}
function lineText(src, pos) {
  const s = src.lastIndexOf('\n', pos - 1) + 1;
  const e = src.indexOf('\n', pos);
  return src.slice(s, e < 0 ? src.length : e);
}

// ------------------------------------------------------------ 1. JS のことば
const problems = [];
const nativeListed = [];     // ui/js/i18n.js の NATIVE（exe が返すことばの形）
const keys = new Map();      // ことば → 最初に見つけた場所
function addKey(k, where) { if (!keys.has(k)) keys.set(k, where); }

const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
for (const f of jsFiles) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  for (const tok of scanJs(src)) {
    if (!JA.test(tok.raw)) continue;
    const ln = lineOf(src, tok.start);
    const where = `ui\\js\\${f}:${ln}`;
    if (/i18n-ignore/.test(lineText(src, tok.start))) continue;
    if (/i18n-native/.test(lineText(src, tok.start)) && tok.kind === 'str') {
      // exe（C++）が返すことばの形。表に入れ、下で C++ の側と照らし合わせる
      let v;
      try { v = vm.runInNewContext(tok.raw); } catch { problems.push(`${where}  文字列を読めません`); continue; }
      nativeListed.push(v);
      addKey(v, where);
      continue;
    }
    if (tok.kind === 'tpl') {
      problems.push(`${where}  テンプレート文字列に日本語があります。T('…{名前}…', { 名前 }) にしてください: ${tok.raw.slice(0, 60)}`);
      continue;
    }
    const before = src.slice(Math.max(0, tok.start - 40), tok.start);
    const after = src.slice(tok.end).match(/^\s*(.)/);
    if (!/(^|[^\w$.])T\(\s*$/.test(before) && !/I18n\.T\(\s*$/.test(before)) {
      problems.push(`${where}  T() を通していない日本語です（画面に出さないなら、その行に「i18n-ignore」）: ${tok.raw.slice(0, 60)}`);
      continue;
    }
    if (after && after[1] !== ',' && after[1] !== ')') {
      problems.push(`${where}  T() の中で、文字列をつないでいます（1 つの文字列にして {名前} ではめてください）: ${tok.raw.slice(0, 60)}`);
      continue;
    }
    let value;
    try { value = vm.runInNewContext(tok.raw); } catch { problems.push(`${where}  文字列を読めません`); continue; }
    addKey(value, where);
  }
}

// ------------------------------------------------------------ 1b. exe（C++）が返すことば
// 画面に出る失敗のことば（JsonError(...) と r.error = ...）と、JSON が読めないときのわけ（json.cpp の fail）。
// "あ" + x + "い" は「あ{0}い」の形にして、i18n.js の NATIVE にあるかを見る。
{
  const cppStr = (lit) => lit.slice(1, -1).replace(/\\(["\\])/g, '$1');
  const toTemplate = (expr) => {
    const parts = expr.split(/\s\+\s/);
    let n = 0;
    let out = '';
    for (const p of parts) {
      const t = p.trim();
      if (/^"(?:[^"\\]|\\.)*"$/.test(t)) out += cppStr(t);
      else out += `{${n++}}`;
    }
    return out;
  };
  const found = new Map();    // 形 → 場所
  const scanCpp = (rel, pattern) => {
    const file = path.join(root, rel);
    const src = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
    for (const m of src.matchAll(pattern)) {
      let expr = m[1].trim();
      const alts = expr.includes('?') ? expr.split(/[?:]/).slice(1) : [expr];
      for (const a of alts) {
        if (!JA.test(a)) continue;
        const tpl = toTemplate(a.trim());
        if (!found.has(tpl)) found.set(tpl, `${rel}:${lineOf(src, m.index)}`);
      }
    }
  };
  for (const f of fs.readdirSync(path.join(root, 'studio', 'src')).filter((x) => x.endsWith('.cpp'))) {
    scanCpp(path.join('studio', 'src', f), /(?:JsonError\(\s*res\s*,\s*\d+\s*,|\.error\s*=)([^;]*?)\)?;/g);
  }
  scanCpp(path.join('shiori', 'src', 'json.cpp'), /\bfail\(("(?:[^"\\]|\\.)*")\)/g);
  // program.cpp のうち、画面（ためす）に届くのは、ファイルを読まない Adopt の「ghost.json …」だけ
  scanCpp(path.join('shiori', 'src', 'program.cpp'), /error_\s*=\s*Msg\(("ghost\.json(?:[^"\\]|\\.)*")\)/g);
  // 書式（sprintf）で作るもの。C++ の側をさがすのではなく、ここに書いておく
  found.set('{0} 行目 {1} 文字目: {2}', 'shiori\\src\\json.cpp（fail の sprintf）');

  for (const [tpl, at] of found) {
    if (!nativeListed.includes(tpl)) {
      problems.push(`${at}  画面に出ることばが ui\\js\\i18n.js の NATIVE にありません（「// i18n-native」で足してください）: ${tpl}`);
    }
  }
  for (const tpl of nativeListed) {
    if (!found.has(tpl)) problems.push(`ui\\js\\i18n.js  NATIVE の「${tpl}」は、もう exe の側にありません（消してください）`);
  }
}

// ------------------------------------------------------------ 1c. 栞のことば（shiori/src/lang.cpp の表）
// 栞が自分で言うこと（Say・QLabel・セリフの配列）と SSP への知らせ（Msg・Report）の日本語が、
// lang.cpp の表に 5 つの言語でそろっているか。{0} の数がもとと同じか。使っていない行が無いか。
const shioriProblems = [];
{
  const LIT = '"(?:[^"\\\\]|\\\\.)*"';
  const LITS = `(${LIT}(?:\\s*${LIT})*)`;            // "…" "…" のように並べたものは 1 つ
  const join = (s) => [...s.matchAll(new RegExp(LIT, 'g'))].map((x) => JSON.parse(x[0])).join('');
  const used = new Map();
  const labels = new Set();       // 選択肢の名前（QLabel）に使うもの。訳に , と ] を入れない
  const srcDir = path.join(root, 'shiori', 'src');
  // // のコメントを消す（文字列の中の // は残す: "http://" など）
  const noComments = (src) => src.split('\n').map((line) => {
    let inStr = false;
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (c === '\\' && inStr) { k++; continue; }
      if (c === '"') inStr = !inStr;
      else if (!inStr && c === '/' && line[k + 1] === '/') return line.slice(0, k);
    }
    return line;
  }).join('\n');
  for (const f of fs.readdirSync(srcDir).filter((x) => x.endsWith('.cpp') && x !== 'lang.cpp')) {
    const src = noComments(fs.readFileSync(path.join(srcDir, f), 'utf8'));
    const pats = [
      new RegExp(`\\b(?:Say|QLabel|Msg|fail|Tr|argTr)\\(\\s*${LITS}`, 'g'),
      new RegExp(`\\bReport\\(\\s*kProblem\\w+\\s*,\\s*${LITS}`, 'g'),
      // セリフの配列は、名前を lines（…Lines）にする決まり（句読点の表などは見ない）
      new RegExp(`static const char\\* \\w*[lL]ines\\[\\] = \\{([^}]*)\\}`, 'g'),
    ];
    for (const re of pats) {
      for (const m of src.matchAll(re)) {
        const texts = re.source.startsWith('static') ? [...m[1].matchAll(new RegExp(LIT, 'g'))].map((x) => JSON.parse(x[0])) : [join(m[1])];
        for (const t of texts) {
          if (!JA.test(t)) continue;
          if (!used.has(t)) used.set(t, `shiori\\src\\${f}:${lineOf(src, m.index)}`);
          if (/^QLabel\(/.test(m[0])) labels.add(t);
        }
      }
    }
  }
  const langSrc = fs.readFileSync(path.join(srcDir, 'lang.cpp'), 'utf8');
  const rows = new Map();
  for (const m of langSrc.matchAll(new RegExp(`\\{\\s*\\{\\s*(${LIT}(?:\\s*,\\s*${LIT}){4})\\s*\\}\\s*\\}`, 'g'))) {
    const cols = [...m[1].matchAll(new RegExp(LIT, 'g'))].map((x) => JSON.parse(x[0]));
    const at = `shiori\\src\\lang.cpp:${lineOf(langSrc, m.index)}`;
    if (rows.has(cols[0])) shioriProblems.push(`${at}  同じ日本語の行が 2 つあります（先のものしか使われません）: ${cols[0].slice(0, 40)}`);
    else rows.set(cols[0], { cols, at });
  }
  for (const t of labels) {
    const row = rows.get(t);
    if (row && row.cols.some((c) => /[,\]]/.test(c))) {
      shioriProblems.push(`${row.at}  選択肢の名前の訳に , か ] があります（\\q[名前,ID] がこわれるので、はずされます）: ${t}`);
    }
  }
  const names = ['日本語', 'English', '简体中文', '繁體中文', '한국어'];
  const nums = (s) => [...s.matchAll(/\{(\d)\}/g)].map((x) => x[0]).sort().join(' ');
  for (const [t, at] of used) {
    if (!rows.has(t)) shioriProblems.push(`${at}  栞のことばが shiori\\src\\lang.cpp の表にありません: ${t.slice(0, 50)}`);
  }
  for (const [t, row] of rows) {
    if (!used.has(t)) shioriProblems.push(`${row.at}  もう使っていない行です（消してください）: ${t.slice(0, 50)}`);
    row.cols.forEach((c, k) => {
      if (!c.trim()) shioriProblems.push(`${row.at}  ${names[k]} が空です: ${t.slice(0, 40)}`);
      else if (nums(c) !== nums(t)) shioriProblems.push(`${row.at}  ${names[k]} のはめこむ所（{0} など）がちがいます: ${t.slice(0, 40)}`);
    });
  }
  problems.push(...shioriProblems);
}

// ------------------------------------------------------------ 2. index.html のことば
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
const htmlKey = (h) => String(h).replace(/\s+/g, ' ').trim();

{
  let html = fs.readFileSync(path.join(root, 'ui', 'index.html'), 'utf8');
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/);
  if (titleM && JA.test(titleM[1])) addKey(decode(titleM[1].trim()), 'ui\\index.html <title>');
  html = html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/g, (m) => m.replace(/[^\n]/g, ' '));
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  let m;
  let skipDepth = 0;     // data-i18n="html" の中（まとめて 1 つ）
  let skipStart = -1;
  let skipTag = '';
  let depthOfTag = 0;
  while ((m = re.exec(html))) {
    const at = `ui\\index.html:${lineOf(html, m.index)}`;
    if (m[3] !== undefined) {
      if (skipDepth) continue;
      const t = htmlKey(m[3]);
      if (t && JA.test(t)) addKey(decode(t), at);
      continue;
    }
    const tag = m[1].toLowerCase();
    const closing = m[0][1] === '/';
    const attrs = m[2] || '';
    if (skipDepth) {
      if (tag === skipTag && !VOID.has(tag)) {
        if (closing) depthOfTag--; else if (!/\/\s*$/.test(attrs)) depthOfTag++;
        if (depthOfTag === 0) {
          const inner = html.slice(skipStart, m.index);
          // 画面では innerHTML（ブラウザが書きなおした形）で引くので、書きなおされない形だけにする
          const odd = inner.replace(/<\/?(?:b|i|code|kbd|br)>/g, '').match(/<[^>]*>?|[&>]/);
          if (odd) {
            problems.push(`${at}  data-i18n="html" の中は、属性の無い <b> <i> <code> <kbd> <br> と文字だけにしてください`
              + `（& や > も使わない。画面では書きなおされて表と合わなくなります）: ${odd[0]}`);
          }
          if (JA.test(inner)) addKey(htmlKey(inner), at);
          skipDepth = 0;
        }
      }
      continue;
    }
    if (closing) continue;
    for (const am of attrs.matchAll(/\b(title|placeholder|aria-label)="([^"]*)"/g)) {
      if (JA.test(am[2])) addKey(decode(am[2]), at);
    }
    if (/\bdata-i18n="html"/.test(attrs) && !VOID.has(tag)) {
      skipDepth = 1; skipStart = m.index + m[0].length; skipTag = tag; depthOfTag = 1;
    }
  }
}

// ------------------------------------------------------------ 3. 言語の表
function loadTable(file) {
  const sandbox = { window: { NASHI: {} } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  const tables = sandbox.window.NASHI.I18N_TABLES || {};
  const codes = Object.keys(tables);
  return codes.length === 1 ? { code: codes[0], table: tables[codes[0]] } : null;
}

const holes = (s) => [...String(s).matchAll(/\{(\w+)\}|%(\w+)/g)].map((x) => x[0]).sort().join(' ');
const tags = (s) => [...String(s).matchAll(/<\/?([a-zA-Z]+)/g)].map((x) => x[0].toLowerCase()).sort().join(' ');

const tables = fs.existsSync(tableDir) ? fs.readdirSync(tableDir).filter((f) => f.endsWith('.js')).sort() : [];
const argv = process.argv.slice(2);

if (argv[0] === '--keys') {
  process.stdout.write(JSON.stringify([...keys.keys()], null, 2) + '\n');
  process.exit(0);
}

const loaded = {};
for (const f of tables) {
  const file = path.join(tableDir, f);
  let t;
  try { t = loadTable(file); } catch (e) { problems.push(`ui\\i18n\\${f}  読みこめません: ${e.message}`); continue; }
  if (!t) { problems.push(`ui\\i18n\\${f}  N.I18N_TABLES に 1 つだけ入れてください`); continue; }
  if (`${t.code}.js` !== f) problems.push(`ui\\i18n\\${f}  ファイル名と言語コード（${t.code}）がちがいます`);
  loaded[t.code] = t.table;
}

if (argv[0] === '--missing') {
  const t = loaded[argv[1]] || {};
  const miss = {};
  for (const k of keys.keys()) if (!Object.prototype.hasOwnProperty.call(t, k)) miss[k] = '';
  process.stdout.write(JSON.stringify(miss, null, 2) + '\n');
  process.exit(0);
}

for (const [code, table] of Object.entries(loaded)) {
  const missing = [...keys.keys()].filter((k) => !Object.prototype.hasOwnProperty.call(table, k));
  const extra = Object.keys(table).filter((k) => !keys.has(k));
  if (missing.length) {
    problems.push(`ui\\i18n\\${code}.js  訳がありません（${missing.length} 件）:\n`
      + missing.slice(0, 15).map((k) => `            ${JSON.stringify(k).slice(0, 80)}  ← ${keys.get(k)}`).join('\n')
      + (missing.length > 15 ? `\n            …ほか ${missing.length - 15} 件（node tools\\check-i18n.js --missing ${code}）` : ''));
  }
  if (extra.length) {
    problems.push(`ui\\i18n\\${code}.js  もう使っていないことばがあります（${extra.length} 件。消してください）:\n`
      + extra.slice(0, 10).map((k) => `            ${JSON.stringify(k).slice(0, 80)}`).join('\n'));
  }
  for (const [k, v] of Object.entries(table)) {
    if (!keys.has(k)) continue;
    if (typeof v !== 'string' || !v.trim()) { problems.push(`ui\\i18n\\${code}.js  訳が空です: ${JSON.stringify(k).slice(0, 60)}`); continue; }
    if (holes(k) !== holes(v)) {
      problems.push(`ui\\i18n\\${code}.js  はめこむ所がちがいます: ${JSON.stringify(k).slice(0, 50)}\n            もと「${holes(k)}」 訳「${holes(v)}」`);
    }
    if (tags(k) !== tags(v)) {
      problems.push(`ui\\i18n\\${code}.js  HTML のタグがちがいます: ${JSON.stringify(k).slice(0, 50)}`);
    }
  }
}

// お手本の名前と説明（ui/samples/index.json の i18n）が、表のある言語ぶんそろっているか
{
  const index = JSON.parse(fs.readFileSync(path.join(root, 'ui', 'samples', 'index.json'), 'utf8'));
  for (const s of index) {
    for (const code of Object.keys(loaded)) {
      const loc = s.i18n && s.i18n[code];
      if (!loc || !loc.title || !loc.desc) {
        problems.push(`ui\\samples\\index.json  「${s.title}」に ${code} の名前（title）と説明（desc）がありません（i18n.${code}）`);
      }
    }
  }
}

// index.html が、表をすべて、i18n.js より先に読んでいるか
{
  const html = fs.readFileSync(path.join(root, 'ui', 'index.html'), 'utf8');
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((x) => x[1]);
  const core = order.indexOf('js/i18n.js');
  if (core < 0) problems.push('ui\\index.html  js/i18n.js を読んでいません');
  for (const f of tables) {
    const at = order.indexOf(`i18n/${f}`);
    if (at < 0) problems.push(`ui\\index.html  i18n/${f} を読んでいません`);
    else if (core >= 0 && at > core) problems.push(`ui\\index.html  i18n/${f} は js/i18n.js より先に読んでください`);
  }
  if (core >= 0 && order.slice(0, core).some((s) => s.startsWith('js/'))) {
    problems.push('ui\\index.html  js/i18n.js は、ほかの js/ より先に読んでください（読みこむときに T() を使うため）');
  }
}

if (problems.length) {
  console.log(`${C.red}[i18n] ${problems.length} 件の問題があります${C.off}`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log(`${C.green}[i18n] ことば ${keys.size} 件。${Object.keys(loaded).sort().join(' / ') || '（表なし）'} の表に、すべてそろっています。${C.off}`);
