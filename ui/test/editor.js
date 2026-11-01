/* エディタの中身のテスト（データの整形とチェックタブ）
 *
 *   node ui\test\editor.js
 *
 * 画面を出さずに、ui/js の中の「判断しているところ」だけを動かします。
 *
 *   model.js … 読みこんだプロジェクトの整形（normalize）と、かたまりの名前
 *   lint.js  … チェックタブが出す注意
 *   player.js … 「ためす」が、さくらスクリプトをどう再生するか（入力欄・選択肢の情報）
 *
 * ブロックを動かすところは栞（shiori/src/interp.cpp）にしかないので、ここでは見ません
 * （そちらは shiori/test/parity と shiori/test/behavior が見ています）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const COLOR = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const { red, green, dim, off } = COLOR;

// 画面のスクリプトをそのまま読みこむ（window があるつもりで動きます）
global.window = { NASHI_LANG: 'ja' };   // ことばは日本語のまま確かめる
for (const f of ['i18n.js', 'blocks.js', 'model.js', 'lint.js', 'player.js']) {
  (0, eval)(fs.readFileSync(path.join(root, 'ui', 'js', f), 'utf8'));
}
const N = global.window.NASHI;
const { Model, Lint, Player } = N;

let failed = 0;
let checked = 0;
let group = '';

function section(name) { group = name; console.log(`  ---- ${name}`); }

function check(what, got, want) {
  checked++;
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    console.log(`${green}  OK  ${off}${what}`);
    return;
  }
  failed++;
  console.log(`${red}  だめ ${what}${off}`);
  console.log(`        ほしい: ${b}`);
  console.log(`        出た  : ${a}`);
}

/** チェックタブの結果から、message に文字列をふくむものを探す */
function issuesOf(project, part) {
  Model.project = Model.normalize(project);
  return Lint.run(Model.project)
    .filter((i) => i.message.includes(part) || (i.hint || '').includes(part))
    .map((i) => i.level);
}

// ===================================================== プロジェクトの整形
section('読みこんだプロジェクトの整形 (model.normalize)');

{
  const p = Model.normalize({});
  check('空でも既定値でうまる', {
    name: p.meta.name, homeUrl: p.meta.homeUrl,
    interval: p.settings.randomTalkInterval,
    scripts: p.scripts.length, vars: p.variables.length, anims: p.animations.length,
  }, { name: 'なしゴースト', homeUrl: '', interval: 180, scripts: 0, vars: 0, anims: 0 });
}

{
  // 句読点のあとの間は、新しく作るものだけ入。書いていない前のプロジェクトは切のまま
  check('自動の間: 新しく作る / 書いていない / 切と書いた', [
    Model.normalize(Model.newProject()).settings.autoWait,
    Model.normalize({ settings: { randomTalkInterval: 60 } }).settings.autoWait,
    Model.normalize({ settings: { autoWait: false } }).settings.autoWait,
  ], [true, false, false]);
}

{
  const p = Model.normalize({
    variables: [{ name: 'すき', value: 3 }, { name: '', value: 1 }, { value: 9 }],
  });
  check('名前のない変数は落とす', p.variables, [{ name: 'すき', value: 3 }]);
}

{
  const p = Model.normalize({
    animations: [{
      id: 3, base: 0, interval: 'talk', every: 2,
      patterns: [
        { method: 'interpolate', surface: 1, wait: 50, x: -2, y: 3 },
        { method: 'しらない', surface: 2 },
        { method: 'import', file: 'a.png', wait: 10 },
      ],
      collisions: [
        { name: 'Wing', shape: 'polygon', points: '1,2 3,4 5,6' },
        { name: 'Odd', shape: 'へんな形' },
        { name: '   ', shape: 'rect' },
      ],
    }],
  });
  const a = p.animations[0];
  check('知らない重ねかたは base に倒す', a.patterns.map((x) => x.method),
    ['interpolate', 'base', 'import']);
  check('こまの既定値がうまる', a.patterns[1],
    { surface: 2, wait: 200, method: 'base', x: 0, y: 0, file: '' });
  check('差しこむファイル名は残る', a.patterns[2].file, 'a.png');
  check('名前のない当たり判定は落とし、知らない形は四角に倒す',
    a.collisions.map((c) => [c.name, c.shape]), [['Wing', 'polygon'], ['Odd', 'rect']]);
  check('多角形のかどはそのまま持つ', a.collisions[0].points, '1,2 3,4 5,6');
}

{
  const p = Model.normalize({
    scripts: [
      { kind: 'event', event: 'OnNadeNade', filter: { area: 'Head', who: 1 } },
      { kind: 'event', event: 'OnCommunicate', filter: { from: 'みかん', contains: 'ねえ' } },
      { kind: 'talk' },
      { kind: 'function' },
    ],
  });
  check('マウスのしぼり込みをほどく',
    [p.scripts[0].area, p.scripts[0].who], ['Head', 1]);
  check('通信のしぼり込みをほどく',
    [p.scripts[1].from, p.scripts[1].contains], ['みかん', 'ねえ']);
  check('トークには名前とえらばれやすさが付く',
    [p.scripts[2].name, p.scripts[2].weight], ['トーク', 1]);
  check('名前のないトークにも名前が付く', p.scripts[3].name, 'なまえのないトーク');
  check('置き場所が決まる', typeof p.scripts[0].x, 'number');
}

section('かたまりの名前 (scriptTitle)');
{
  Model.project = Model.normalize({
    animations: [{ id: 0, base: 0, collisions: [{ name: 'Wing', shape: 'rect' }] }],
  });
  check('ふつうのイベント',
    Model.scriptTitle({ kind: 'event', event: 'OnBoot' }), '起動したとき');
  check('◯秒ごと',
    Model.scriptTitle({ kind: 'event', event: 'OnSecondChange', everySec: 5 }),
    '5秒ごとにくりかえす');
  check('なでなで（仮シェルの場所）',
    Model.scriptTitle({ kind: 'event', event: 'OnNadeNade', area: 'Head', who: 0 }),
    'さくらのあたまがなでられたとき');
  check('なでなで（うごきで足した場所）',
    Model.scriptTitle({ kind: 'event', event: 'OnNadeNade', area: 'Wing', who: -1 }),
    'どちらかのWingがなでられたとき');
  check('話しかけられたとき',
    Model.scriptTitle({ kind: 'event', event: 'OnCommunicate', from: 'みかん', contains: 'やあ' }),
    'みかんに「やあ」と話しかけられたとき');
  check('知らないイベントはそのまま',
    Model.scriptTitle({ kind: 'event', event: 'OnUnknownThing' }), 'OnUnknownThing');
}

// =========================================================== チェックタブ
section('チェックタブ (lint)');

const withScript = (blocks, extra) => Object.assign({
  meta: {}, variables: [{ name: 'こたえ', value: '' }],
  scripts: [{ id: 's1', kind: 'event', event: 'OnBoot', blocks }],
}, extra || {});

check('なにも言わないセリフ',
  issuesOf(withScript([{ type: 'say', who: 0, text: '' }]), 'なにも言わないセリフ'), ['warn']);

check('話しかける相手が空',
  issuesOf(withScript([{ type: 'communicate', who: 0, to: '', text: 'やあ' }]), '話しかける相手が空'),
  ['error']);

check('無い変数を使っている',
  issuesOf(withScript([{ type: 'set', name: 'ないよ', value: 1 }]), '「ないよ」がありません'),
  ['error']);

check('知らないブロック',
  issuesOf(withScript([{ type: 'なぞ' }]), '知らないブロック'), ['error']);

// --- ネットワーク更新
check('更新のありかが空のまま、更新ブロックを置いている',
  issuesOf(withScript([{ type: 'update' }]), 'ネットワーク更新のブロック'), ['warn']);

check('更新のありかを決めていれば言わない',
  issuesOf(withScript([{ type: 'update' }], { meta: { homeUrl: 'https://example.com/' } }),
    'ネットワーク更新のブロック'), []);

// --- 待たない SAORI
check('よぶファイルが空',
  issuesOf(withScript([{ type: 'saori_call', file: '', into: 'こたえ' }]), 'よぶファイルが空'),
  ['error']);

check('答えの入れ先が空',
  issuesOf(withScript([{ type: 'saori_call', file: 'a.dll', into: '' }]), '答えの入れ先が空'),
  ['warn']);

check('答えの入れ先が無い変数',
  issuesOf(withScript([{ type: 'saori_call', file: 'a.dll', into: 'ないよ' }]),
    '「ないよ」がありません'), ['error']);

check('答えの入れ先も「使っている」に数える',
  issuesOf(withScript([{ type: 'saori_call', file: 'a.dll', into: 'こたえ' }]),
    'どこでも使われていません'), []);

// --- たずねる・◯秒後によぶ
check('たずねる先が空',
  issuesOf(withScript([{ type: 'ask', into: '' }]), '答えの入れ先が空の「たずねる」'), ['error']);

check('たずねる先が無い変数',
  issuesOf(withScript([{ type: 'ask', into: 'ないよ' }]), '「ないよ」がありません'), ['error']);

check('たずねる先も「使っている」に数える',
  issuesOf(withScript([{ type: 'ask', into: 'こたえ' }]), 'どこでも使われていません'), []);

check('◯秒後によぶ先が無いトーク',
  issuesOf(withScript([{ type: 'later', sec: 5, name: 'ないトーク' }]), 'というトークがありません'),
  ['error']);

check('◯秒後によぶ先が空',
  issuesOf(withScript([{ type: 'later', sec: 5, name: '' }]), '行き先がえらばれていません'),
  ['error']);

check('どこでも使われていない変数は言う',
  issuesOf(withScript([{ type: 'say', who: 0, text: 'やあ' }]), 'どこでも使われていません'),
  ['warn']);

// --- 見落としていたまちがい
check('数の欄に、数でない文字',
  issuesOf(withScript([{ type: 'wait', ms: 'すこし' }]), '数の欄に「すこし」'), ['warn']);
check('数の欄に数・変数のブロックなら言わない',
  issuesOf(withScript([{ type: 'wait', ms: '500' }, { type: 'wait', ms: { type: 'var', name: 'こたえ' } }]), '数の欄に'), []);
check('鳴らす音のファイルが空（1 回鳴らす）',
  issuesOf(withScript([{ type: 'sound', file: '' }]), 'ファイル名が空'), ['warn']);
check('まだ作っていない「うごき」',
  issuesOf(withScript([{ type: 'anim', id: 5 }]), '「うごき 5」がありません'), ['warn']);
check('作った「うごき」なら言わない',
  issuesOf(withScript([{ type: 'anim', id: 5 }], { animations: [{ id: 5, base: 0, patterns: [] }] }), '「うごき 5」がありません'), []);
check('どこからもよばれない「◯がよばれたとき」',
  issuesOf(withScript([], { scripts: [{ id: 'f', kind: 'function', name: 'ひとり', blocks: [{ type: 'say', who: 0, text: 'x' }] }] }),
    'どこからもよばれていません'), ['warn']);
check('◯秒後によぶ・選択肢の行き先も「よばれている」に数える',
  issuesOf(withScript([{ type: 'later', sec: 5, name: 'あと' }, { type: 'choice', label: 'はい', target: 'えらぶ' }], {
    scripts: [
      { id: 's1', kind: 'event', event: 'OnBoot', blocks: [{ type: 'later', sec: 5, name: 'あと' }, { type: 'choice', label: 'はい', target: 'えらぶ' }] },
      { id: 'a', kind: 'function', name: 'あと', blocks: [{ type: 'say', who: 0, text: 'x' }] },
      { id: 'b', kind: 'function', name: 'えらぶ', blocks: [{ type: 'say', who: 0, text: 'y' }] },
    ],
  }), 'どこからもよばれていません'), []);
check('さくらスクリプトの中で名前を書いていれば、よばれていることにする',
  issuesOf(withScript([], { scripts: [
    { id: 's1', kind: 'event', event: 'OnBoot', blocks: [{ type: 'raw', text: '\\q[はい,こたえる]' }] },
    { id: 'f', kind: 'function', name: 'こたえる', blocks: [{ type: 'say', who: 0, text: 'x' }] },
  ] }), 'どこからもよばれていません'), []);
check('さくらスクリプトの文字に名前がまじっているだけなら、よばれていない',
  issuesOf(withScript([], { scripts: [
    { id: 's1', kind: 'event', event: 'OnBoot', blocks: [{ type: 'raw', text: '\\_w[500]あいうえお' }] },
    { id: 'f', kind: 'function', name: 'あ', blocks: [{ type: 'say', who: 0, text: 'x' }] },
  ] }), 'どこからもよばれていません'), ['warn']);
check('日付・SSP の情報をたずねる先も「使っている」に数える',
  issuesOf(withScript([{ type: 'ask_kind', kind: 'dateinput', into: 'こたえ', min: 0, max: 100 }]), 'どこでも使われていません'), []);

// --- チェックタブからその場で直す
{
  Model.project = Model.normalize(withScript([{ type: 'set', name: 'ないよ', value: 1 }, { type: 'call', name: 'ないトーク' }]));
  const fixes = Lint.run(Model.project).filter((i) => i.fix).map((i) => i.fix);
  check('無い変数・無いトークには「作る」、使っていない変数には「削除する」',
    fixes.map((f) => (f.add ? 'add-' + f.add : 'remove-' + f.remove) + ':' + f.name).sort(),
    ['add-talk:ないトーク', 'add-var:ないよ', 'remove-var:こたえ']);
}

// ============================================== 変数の名前を変えたとき
section('変数の名前を変えたとき (model.renameVariable)');
{
  Model.project = Model.normalize(withScript([
    { type: 'set', name: 'こたえ', value: 1 },
    { type: 'ask', into: 'こたえ', initial: '' },
    { type: 'ask_kind', kind: 'dateinput', into: 'こたえ', min: 0, max: 100 },
    { type: 'property_get', prop: 'baseware.version', into: 'こたえ' },
    { type: 'say', who: 0, text: { type: 'var', name: 'こたえ' }, nl: 1 },
    { type: 'say', who: 0, text: 'こたえ', nl: 1 },
  ]));
  check('使っている数（入れる・たずねる 3 つ・中身）', Model.countVariableUses('こたえ'), 5);
  Model.renameVariable('こたえ', '名前');
  const bs = Model.project.scripts[0].blocks;
  check('たずねて入れる先も、いっしょに付けかえる',
    [bs[0].name, bs[1].into, bs[2].into, bs[3].into, bs[4].text.name], ['名前', '名前', '名前', '名前', '名前']);
  check('セリフの文字はそのまま', bs[5].text, 'こたえ');
}

// ============================================== トークの名前を変えたとき
section('トークの名前を変えたとき (model.renameTalkRefs)');
{
  const project = Model.normalize({
    format: 'nashi/1',
    scripts: [
      { id: 'a', kind: 'function', name: 'あいさつ', blocks: [] },
      { id: 'b', kind: 'event', event: 'OnBoot', blocks: [
        { type: 'call', name: 'あいさつ' },
        { type: 'later', sec: 5, name: 'あいさつ' },
        { type: 'choice', label: 'うん', target: 'あいさつ' },
        { type: 'if', cond: null, then: [{ type: 'call', name: 'あいさつ' }] },
        { type: 'call', name: 'べつ' },
        { type: 'say', who: 0, text: 'あいさつ', nl: 1 },
      ] },
    ],
  });
  Model.project = project;
  const talk = project.scripts[0];
  talk.name = 'おはよう';
  const n = Model.renameTalkRefs('あいさつ', 'おはよう', talk);
  const blocks = project.scripts[1].blocks;
  check('よぶ・◯秒後によぶ・選択肢・入れ子の中も付けかえる', n, 4);
  check('付けかえたあとの行き先',
    [blocks[0].name, blocks[1].name, blocks[2].target, blocks[3].then[0].name], ['おはよう', 'おはよう', 'おはよう', 'おはよう']);
  check('ほかのトークをよぶもの・セリフの文字はそのまま', [blocks[4].name, blocks[5].text], ['べつ', 'あいさつ']);

  // 同じ名前のトークがまだあれば、よぶ先は消えていないので付けかえない
  project.scripts.push({ id: 'c', kind: 'talk', name: 'おはよう', weight: 1, blocks: [] });
  talk.name = 'こんばんは';
  check('同じ名前のトークがほかにあれば、付けかえない', Model.renameTalkRefs('おはよう', 'こんばんは', talk), 0);
}

// ============================================== 付箋（メモ）
section('付箋（メモ）');
{
  const p = Model.normalize({ format: 'nashi/1', scripts: [{ id: 'n', kind: 'note', x: 10, y: 20 }] });
  check('読みこむと、文字が空でも text を持つ', [p.scripts[0].kind, p.scripts[0].text, p.scripts[0].blocks], ['note', '', []]);
  Model.project = p;
  p.scripts[0].text = '朝のトーク\nここから下は朝だけ';
  check('見出しは 1 行目', Model.scriptTitle(p.scripts[0]), 'メモ「朝のトーク」');
  check('メモはチェックタブに出ない（つながっていない・中身がからっぽ、と言わない）',
    Lint.run(p).filter((i) => i.script === p.scripts[0]).length, 0);
}

// ============================================== ためすの再生（player.parseSakura）
section('ためすの再生 (player.parseSakura)');
{
  const ops = Player.parseSakura('\\0きみの名前は？\\![open,inputbox,nashi:名前,-1,なし]\\q[はい,OnAnswer,yes,2]\\![open,sliderinput,nashi:数,-1,5,0,10]');
  const input = ops.filter((o) => o.op === 'input');
  check('たずねると、入力欄の操作になる（ID・はじめの文字）', input.map((o) => [o.kind, o.id, o.initial]),
    [['inputbox', 'nashi:名前', 'なし'], ['sliderinput', 'nashi:数', '5']]);
  check('スライダーは最小・最大も読む', [input[1].min, input[1].max], [0, 10]);
  const choice = ops.find((o) => o.op === 'choice');
  check('選択肢の行き先のあとの情報を、イベントの情報として持つ', [choice.label, choice.id, choice.refs], ['はい', 'OnAnswer', ['yes', '2']]);
}

// ============================================== お手本ゴースト（ui/samples）
section('お手本ゴースト');
{
  const dir = path.join(root, 'ui', 'samples');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  check('お手本の数', index.length > 0, true);
  for (const s of index) {
    const raw = fs.readFileSync(path.join(dir, s.file), 'utf8');
    const project = Model.normalize(JSON.parse(raw));
    Model.project = project;
    const issues = Lint.run(project);
    // お手本がチェックタブに引っかかっていたら、お手本になりません
    check(`${s.file} は問題なし`, issues.map((i) => `${i.level}: ${i.message}`), []);
  }
}

// ------------------------------------------------------------------ おしまい
if (failed) {
  console.log(`${red}[editor] ${failed} か所ちがいます（${checked} か所中）。${off}`);
  process.exit(1);
}
console.log(`${green}[editor] ${checked} か所すべて期待どおりです。${off}`);
