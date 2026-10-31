/* 書き出しの答え合わせテスト
 *
 *   node studio\test\export.js            見くらべる
 *   node studio\test\export.js --update   いまの出力を期待値として保存しなおす
 *
 * 栞のほうは parity / behavior で守られていますが、スタジオが書き出すファイル
 * （surfaces.txt・descript.txt・ghost.json）は形が崩れても気づけませんでした。
 * ここで材料のプロジェクトを export_host.exe に流して、出てきた中身を
 * studio/test/expected/ の期待値とバイトで見くらべます。
 *
 * updates2.dau だけは期待値ファイルではなく、node の crypto で計算した MD5 と
 * 突き合わせます（同じ計算をもう一度書くのではなく、別の実装と合うかを見ます）。
 *
 * 書き出しかたを変えたときは、出てきたものを目で確かめてから --update してください。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const here = __dirname;
const root = path.resolve(here, '..', '..');
const host = path.join(root, 'studio', 'test', 'export_host.exe');
const fixtureDir = path.join(here, 'fixture');
const expectDir = path.join(here, 'expected');

const COLOR = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const { red, green, dim, off } = COLOR;

const update = process.argv.includes('--update');

if (!fs.existsSync(host)) {
  console.error(`${red}[export] export_host.exe がありません。先に .\\build.ps1 -Test を実行してください。${off}`);
  process.exit(2);
}

/** export_host を動かして、出てきたバイト列を返す */
function run(args) {
  return execFileSync(host, args, { encoding: 'buffer', maxBuffer: 1 << 26 });
}

let failed = 0;
let checked = 0;

/** 期待値ファイルと見くらべる（--update なら書きなおす） */
function compare(name, got) {
  const file = path.join(expectDir, name);
  checked++;
  if (update) {
    fs.mkdirSync(expectDir, { recursive: true });
    fs.writeFileSync(file, got);
    console.log(`${dim}  保存 ${name}${off}`);
    return;
  }
  if (!fs.existsSync(file)) {
    failed++;
    console.log(`${red}  だめ ${name}: 期待値がありません（--update で作れます）${off}`);
    return;
  }
  const want = fs.readFileSync(file);
  if (Buffer.compare(want, got) === 0) {
    console.log(`${green}  OK  ${off}${name}`);
    return;
  }
  failed++;
  console.log(`${red}  だめ ${name}${off}`);
  showDiff(want.toString('utf8'), got.toString('utf8'));
}

/** 最初に食いちがった行のまわりだけ見せる */
function showDiff(want, got) {
  const a = want.split('\n');
  const b = got.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    console.log(`        ${i + 1} 行目`);
    console.log(`        ほしい: ${JSON.stringify(a[i])}`);
    console.log(`        出た  : ${JSON.stringify(b[i])}`);
    const rest = Math.max(a.length, b.length) - i - 1;
    if (rest > 0) console.log(`        ${dim}（ほかにも ${rest} 行あります）${off}`);
    return;
  }
}

// ------------------------------------------------- 書き出したファイルの中身
const cases = [
  ['ghost.json', 'shell/master/surfaces.txt', 'surfaces.txt'],
  ['ghost.json', 'ghost/master/descript.txt', 'descript.txt'],
  ['ghost.json', 'ghost/master/ghost.json', 'program.json'],
  ['ghost.json', 'install.txt', 'install.txt'],
  ['plain.json', 'ghost/master/descript.txt', 'descript-plain.txt'],
  ['balloon.json', 'balloon/descript.txt', 'balloon-descript.txt'],
  ['balloon.json', 'install.txt', 'balloon-install.txt'],
];

console.log('  ---- 書き出したファイルの中身');
for (const [fixture, want, expected] of cases) {
  compare(expected, run([path.join(fixtureDir, fixture), want]));
}

// ------------------------------------------------- 自分の絵に描いた当たり判定
//
// 画像は「このコンピュータの中の絶対パス」でないと読まないので、その場で作ります。
// 書き出しが見るのは PNG の頭（大きさ）だけなので、IHDR までの小さな PNG で足ります。
console.log('  ---- 自分の絵に描いた当たり判定 (surfaces.txt)');
{
  const tmpHit = fs.mkdtempSync(path.join(os.tmpdir(), 'nashi-hit-'));
  try {
    const png = (w, h) => {
      const b = Buffer.alloc(8 + 8 + 13 + 4);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
      b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii');
      b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = 6;
      return b;
    };
    fs.writeFileSync(path.join(tmpHit, 'a.png'), png(200, 300));
    fs.writeFileSync(path.join(tmpHit, 'b.png'), png(200, 300));
    const project = {
      meta: { name: 'あたりテスト', sakuraName: 'さくら', keroName: 'うにゅう' },
      shell: {
        images: [
          { id: 0, path: path.join(tmpHit, 'a.png'), collisions: [
            { name: 'Head', shape: 'rect', x1: 10, y1: 20, x2: 110, y2: 90 },
            { name: 'Face,x', shape: 'ellipse', x1: 30, y1: 80, x2: 90, y2: 130 },
            { name: '', shape: 'rect', x1: 0, y1: 0, x2: 5, y2: 5 },
          ] },
          { id: 1, path: path.join(tmpHit, 'b.png'), collisions: [] },
        ],
      },
      scripts: [],
    };
    const fixture = path.join(tmpHit, 'project.json');
    fs.writeFileSync(fixture, JSON.stringify(project));
    const out = run([fixture, 'shell/master/surfaces.txt']).toString('utf8');
    const block = (id) => {
      const m = new RegExp(`surface${id}\\r\\n\\{\\r\\n([\\s\\S]*?)\\}`).exec(out);
      return m ? m[1] : '';
    };
    const checks = [
      ['描いた四角が collision で出る', block(0).includes('collision0,10,20,110,90,Head\r\n')],
      ['描いただ円が collisionex で出る（名前の , は空白に）', block(0).includes('collisionex0,Face x,ellipse,30,80,90,130\r\n')],
      ['名前の無いものは出ない／自動の判定はまざらない', !/Skirt|Bust|,5,5,/.test(block(0))],
      ['描いていない自分の絵には、自動の判定が付く', block(1).includes(',Head\r\n') && block(1).includes(',Skirt\r\n')],
      ['自動生成の絵にも、自動の判定が付く', block(10).includes(',Head\r\n')],
    ];
    for (const [label, ok] of checks) {
      checked++;
      if (ok) { console.log(`${green}  OK  ${off}${label}`); continue; }
      failed++;
      console.log(`${red}  だめ ${label}${off}`);
      console.log(`        ${dim}${JSON.stringify(out.slice(0, 600))}${off}`);
    }
  } finally {
    fs.rmSync(tmpHit, { recursive: true, force: true });
  }
}

// ------------------------------------------------- 着せ替え
console.log('  ---- 着せ替え (surfaces.txt / シェルの descript.txt)');
{
  const tmpDress = fs.mkdtempSync(path.join(os.tmpdir(), 'nashi-dress-'));
  try {
    const png = Buffer.alloc(8 + 8 + 13 + 4);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8); png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(40, 16); png.writeUInt32BE(30, 20); png[24] = 8; png[25] = 6;
    fs.writeFileSync(path.join(tmpDress, 'apron.png'), png);
    const project = {
      meta: { name: 'きがえテスト', sakuraName: 'さくら', keroName: 'うにゅう' },
      shell: { images: [] },
      dressup: {
        parts: [
          { id: 200, who: 0, category: '服', name: 'エプロン', path: path.join(tmpDress, 'apron.png'), x: 30, y: 120, on: true },
          { id: 201, who: 0, category: '服', name: 'ドレス,x', path: path.join(tmpDress, 'apron.png'), x: 0, y: 0, on: false },
          { id: 202, who: 1, category: 'ぼうし', name: '絵が無い', path: path.join(tmpDress, 'none.png'), x: 0, y: 0, on: true },
        ],
        rules: { '0/服': 'mustselect', '1/ぼうし': 'multiple' },
      },
      scripts: [],
    };
    const fixture = path.join(tmpDress, 'project.json');
    fs.writeFileSync(fixture, JSON.stringify(project));
    const surf = run([fixture, 'shell/master/surfaces.txt']).toString('utf8');
    const desc = run([fixture, 'shell/master/descript.txt']).toString('utf8');
    const checks = [
      ['部品だけの surface ができる', surf.includes('surface10200\r\n{\r\nelement0,overlay,dress200.png,0,0\r\n}')],
      ['さくらのすべての表情に bind のうごきを足す', surf.includes('surface.append0,1,2\r\n{\r\nanimation200.interval,bind\r\nanimation200.pattern0,add,10200,0,30,120\r\n')],
      ['append は表情の surface よりあと', surf.indexOf('surface.append') > surf.indexOf('surface12\r\n')],
      ['絵の無い部品は書かない', !surf.includes('202') && !desc.includes('bindgroup202')],
      ['カテゴリと名前（, は空白に）', desc.includes('sakura.bindgroup200.name,服,エプロン\r\n') && desc.includes('sakura.bindgroup201.name,服,ドレス x\r\n')],
      ['はじめからつける部品だけ default', desc.includes('sakura.bindgroup200.default,1\r\n') && !desc.includes('bindgroup201.default')],
      ['えらびかたとメニュー', desc.includes('sakura.bindoption0.group,服,mustselect\r\n') && desc.includes('sakura.menu,auto\r\n') && !desc.includes('kero.menu')],
    ];
    for (const [label, ok] of checks) {
      checked++;
      if (ok) { console.log(`${green}  OK  ${off}${label}`); continue; }
      failed++;
      console.log(`${red}  だめ ${label}${off}`);
      console.log(`        ${dim}${JSON.stringify(surf.slice(-500))}${off}`);
      console.log(`        ${dim}${JSON.stringify(desc.slice(-400))}${off}`);
    }
  } finally {
    fs.rmSync(tmpDress, { recursive: true, force: true });
  }
}

// ------------------------------------------------- ネットワーク更新の照合表
//
// 中身を作るところから確かめたいので、その場でフォルダを組み立てます。
console.log('  ---- ネットワーク更新の照合表 (updates2.dau)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nashi-dau-'));
try {
  const files = {
    'readme.txt': Buffer.from('こんにちは\r\n', 'utf8'),
    'ghost\\master\\ghost.json': Buffer.from('{"a":1}\n', 'utf8'),
    'shell\\master\\surface0.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0xff]),
    // これは配ってはいけないもの（使う人の持ちもの・作業用）
    'ghost\\master\\nashi_save.json': Buffer.from('{"好感度":99}', 'utf8'),
    'ghost\\master\\nashi_debug.txt': Buffer.from('log', 'utf8'),
    'delete.txt': Buffer.from('old.txt\r\n', 'utf8'),
  };
  for (const rel of Object.keys(files)) {
    const p = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, files[rel]);
  }

  const out = run(['--dau', tmp]).toString('utf8');
  // 出力は 0x01 を <1>、改行を <CR><LF> と書いたもの
  const lines = out.split('\n').map((s) => s.replace(/\r$/, '')).filter((s) => s.length);
  const want = ['ghost\\master\\ghost.json', 'readme.txt', 'shell\\master\\surface0.png'];

  checked++;
  const names = lines.map((s) => s.split('<1>')[0]);
  if (names.join(' / ') !== want.join(' / ')) {
    failed++;
    console.log(`${red}  だめ 並んでいるファイルがちがいます${off}`);
    console.log(`        ほしい: ${want.join(' / ')}`);
    console.log(`        出た  : ${names.join(' / ')}`);
  } else {
    console.log(`${green}  OK  ${off}配るファイルだけが並んでいる（持ちもの・作業用は入らない）`);
  }

  for (const line of lines) {
    const parts = line.split('<1>');
    checked++;
    const rel = parts[0];
    const md5 = crypto.createHash('md5').update(files[rel]).digest('hex');
    if (parts[1] !== md5) {
      failed++;
      console.log(`${red}  だめ ${rel} の MD5${off}`);
      console.log(`        ほしい: ${md5}`);
      console.log(`        出た  : ${parts[1]}`);
    } else if (parts[2] !== '<CR><LF>' || parts.length !== 3) {
      failed++;
      console.log(`${red}  だめ ${rel} の行の形（0x01 が 2 つ + CRLF）${off}`);
      console.log(`        出た  : ${JSON.stringify(line)}`);
    } else {
      console.log(`${green}  OK  ${off}${rel} ${dim}${md5}${off}`);
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ------------------------------------------------------------------ おしまい
if (failed) {
  console.log(`${red}[export] ${failed} か所ちがいます（${checked} か所中）。${off}`);
  console.log(`${dim}  わざと変えたのなら: node studio\\test\\export.js --update${off}`);
  process.exit(1);
}
console.log(`${green}[export] ${checked} か所すべて期待どおりです。${off}`);
