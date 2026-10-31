/* 栞のふるまいテスト
 *
 *   node shiori\test\behavior\behavior.js
 *
 * parity.js が「ブロック 1 つ 1 つの意味」を見るのに対して、こちらは
 * **栞だけが持っている判断**を見ます。プレビューには無い部分です。
 *
 *   ・同じイベントに複数あるとき、どれを選ぶか（しぼり込みの優先）
 *   ・ブロックが無いイベントの既定の反応
 *   ・OnClose に \- が必ず付くこと、\e が補われること
 *   ・「◯秒ごと」の間引き
 *   ・OnMouseMove を数えて OnNadeNade を作ること（20 回・続けては反応しない・しゃべっている途中は割りこまない）
 *   ・しゃべれないあいだの「◯秒ごと」「1時間ごと」は、あとで出す
 *   ・ランダムトークは、言うものが見つかるまでためす／時計はしゃべれるあいだだけ進む
 *   ・ゴースト間通信の届け先と、話しかけ合いの打ち切り
 *   ・外から来た要求の受け付けかた（出していない選択肢・開いていない箱・external）
 *   ・SSP のイベントの読みかた（しゃべれるか・1時間ごと・切り替わって来たとき）
 *
 * 要求には、| のうしろに見出しを足せます（例: 'OnBoot|SecurityLevel:external'）。
 *
 * ふるまいを変えたら、ここの期待値も直してください。
 */
'use strict';

const path = require('path');
const host = require('../lib/host');

const { red, green, dim, off } = host.COLOR;
const EMPTY = path.join(__dirname, 'empty');
const MAIN = path.join(__dirname, 'main');
const TALK = path.join(__dirname, 'talk');
const TALKWAIT = path.join(__dirname, 'talkwait');
const SAVE = path.join(__dirname, 'save');
const AUTOWAIT = path.join(__dirname, 'autowait');

// 書いていないときのダブルクリックのメニュー（頭のひとことは 3 つのどれか）
const MENU_TAIL = '\\n\\n\\q[なにか話して,nashi.menu.talk]\\n\\q[話す多さを変える,nashi.menu.interval]\\n\\q[なんでもない,nashi.menu.cancel]\\e';
const MENU = ['なに？', '呼んだ？', 'どうしたの？'].map((h) => `\\0\\s[0]${h}${MENU_TAIL}`);
// 「話す多さを変える」の選択肢（TALK ゴーストは間隔 1 秒）
const IV_CHOICES = '\\n\\n\\q[たくさん（1 分ごと）,nashi.menu.iv.60]\\n\\q[いつもどおり（1 秒ごと）,nashi.menu.iv.usual]\\n'
  + '\\q[ときどき（10 分ごと）,nashi.menu.iv.600]\\n\\q[しばらく静かに,nashi.menu.iv.0]\\e';

// 保存データのテスト用: ゴーストのフォルダのファイルを書く・読む
const fs = require('fs');
const writeIn = (dir, name, text) => fs.writeFileSync(path.join(dir, name), text, 'utf8');
const brokenIn = (dir) => fs.readdirSync(dir).filter((f) => /^nashi_save\.broken-\d{8}-\d{6}\.json$/.test(f));
// きょうから n 日前の日付（YYYY-MM-DD）
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 応答 1 件に対する期待。文字列なら Value の完全一致。
//   { value } Value / { commTo } 話しかけ先 / { status } 応答の種類
//   { valueOneOf: [...] } どれか 1 つに当たればよい（既定の反応がランダムなもの）
//   null なら見ない
const scenarios = [
  {
    name: 'ダブルクリックを書いていないゴースト（トークあり）— メニューから話す多さを変えられる',
    dir: TALK,
    steps: [
      ['OnMouseDoubleClick:0,0,0,0,Head', { valueOneOf: MENU }],
      ['OnChoiceSelect:nashi.menu.interval', '\\0\\s[0]どれくらい話そうか？\\n（いまは、だいたい 1 秒ごと）' + IV_CHOICES],
      ['OnChoiceSelect:nashi.menu.iv.0', '\\0\\s[0]わかった。しばらく静かにしてるね。\\n（ダブルクリックで、また変えられるよ）\\e'],
      ['OnSecondChange:0,0,0,1', { status: '204 No Content' }],   // 間隔 1 秒のゴーストでも、もう話さない
      ['OnSecondChange:0,0,0,1', { status: '204 No Content' }],
      // 「いつもどおり」で、設定の間隔にもどる（数はおぼえない）
      ['OnMouseDoubleClick:0,0,0,0,Head', { valueOneOf: MENU }],
      ['OnChoiceSelect:nashi.menu.interval', '\\0\\s[0]どれくらい話そうか？\\n（いまは、静かにしてるよ）' + IV_CHOICES],
      ['OnChoiceSelect:nashi.menu.iv.usual', '\\0\\s[0]わかった。いつもどおりに話すね。\\e'],
      ['OnSecondChange:0,0,0,1', '\\0はなす\\e'],
      // 「なにか話して」「なんでもない」
      ['OnMouseDoubleClick:0,0,0,0,Head', { valueOneOf: MENU }],
      ['OnChoiceSelect:nashi.menu.talk', '\\0はなす\\e'],
      ['OnMouseDoubleClick:0,0,0,0,Head', { valueOneOf: MENU }],
      ['OnChoiceSelect:nashi.menu.cancel', '\\0\\s[0]そう？\\e'],
    ],
  },
  {
    name: 'メニューの行き先も、こちらが出したものだけ受け付ける',
    dir: TALK,
    steps: [
      ['OnChoiceSelect:nashi.menu.iv.0', { status: '204 No Content' }],   // 出していないのに来た
      ['OnSecondChange:0,0,0,1', '\\0はなす\\e'],                          // 静かにはなっていない
    ],
  },
  {
    name: '句読点のあとに自動で間を置く（settings.autoWait）— 続く句読点は最後に 1 回、終わりには置かない',
    dir: AUTOWAIT,
    steps: [
      ['OnBoot:master', '\\0はい、\\_w[100]そうです。\\_w[300]ほんと！？……\\_w[300]うん。\\e'],
      // 閉じかっこは間の前に。改行の前（セリフの終わり）には置かない。半角の !? は見ない
      ['OnKeyPress:a', '\\0「うん。」\\_w[300]そう、\\na!b?c\\e'],
      // 話しかけるブロックも、しゃべるブロックと同じ
      ['OnCommunicate:user,こんにちは', '\\0うん、\\_w[100]いいよ\\e'],
    ],
  },
  {
    name: '終わりの印 \\- — セリフの中の文字の「\\-」は、終わりの印とみなさない',
    dir: AUTOWAIT,
    steps: [
      ['OnClose', '\\0またね、\\_w[100]/\\\\-/\\-'],
      ['OnCloseAll', '\\0/\\\\-/\\-'],                             // 文字の \\- しか無いので、栞が \\- を足す
      // 切りかわるときは、ほんものの \\- だけはずす（文字の \\- は残す）
      ['OnGhostChanging:ほかの子', '\\0またね、\\_w[100]/\\\\-/\\e'],
    ],
  },
  {
    name: 'ほかのゴーストへ切りかわるとき — 専用が無ければ「終了するとき」で（\\- ははずす）',
    dir: MAIN,
    steps: [
      ['OnGhostChanging:ほかの子', '\\0ばいばい\\e'],
    ],
  },
  {
    name: 'ほかのゴーストへ切りかわるとき — 何も書いていなければ「またね。」',
    dir: TALK,
    steps: [
      ['OnGhostChanging:ほかの子', '\\0\\s[0]またね。\\e'],
    ],
  },
  {
    name: '保存データ — 読めない本体はよけて、ひとつ前の控えから読む',
    dir: SAVE,
    setup: (dir) => {
      writeIn(dir, 'nashi_save.json', '{こわれている');
      writeIn(dir, 'nashi_save.bak.json', JSON.stringify({ format: 'nashi-save/1', vars: { 話した: 5 }, boots: 2 }));
    },
    steps: [
      ['OnBoot:master', null],
      ['OnCheck', '\\05\\e'],
    ],
    after: (dir) => {
      const out = [];
      const broken = brokenIn(dir);
      if (broken.length !== 1) out.push(`よけたファイルが 1 つではありません: ${broken.join(', ')}`);
      else if (fs.readFileSync(path.join(dir, broken[0]), 'utf8') !== '{こわれている') out.push('よけたファイルの中身が変わっています');
      const saved = JSON.parse(fs.readFileSync(path.join(dir, 'nashi_save.json'), 'utf8'));
      if (saved.vars['話した'] !== 5 || saved.format !== 'nashi-save/1') out.push(`書きなおした本体がちがいます: ${JSON.stringify(saved)}`);
      return out;
    },
  },
  {
    name: '保存データ — 控えも無ければ初めからにするが、読めなかった本体は消さずに残す',
    dir: SAVE,
    setup: (dir) => writeIn(dir, 'nashi_save.json', '{こわれている'),
    steps: [
      ['OnCheck', '\\00\\e'],
    ],
    after: (dir) => (brokenIn(dir).length === 1 ? [] : ['読めなかった本体が残っていません']),
  },
  {
    name: '保存データ — 控え（nashi_save.bak.json）には前の回の中身を残し、本体に今回の中身と日付を書く',
    dir: SAVE,
    setup: (dir) => writeIn(dir, 'nashi_save.json', JSON.stringify({ vars: { 話した: 7 }, boots: 1 })),
    steps: [
      ['OnBoot:master', null],
      ['OnInc', null],            // 話した を 9 に
      ['OnClose', null],          // ここで 1 回、終わるときにもう 1 回保存する（控えにまわすのは 1 回目だけ）
    ],
    after: (dir) => {
      const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const bak = read('nashi_save.bak.json');
      const main = read('nashi_save.json');
      const out = [];
      if (bak.vars['話した'] !== 7) out.push(`控えが前の回の中身ではありません: ${JSON.stringify(bak.vars)}`);
      if (main.vars['話した'] !== 9) out.push(`本体が今回の中身ではありません: ${JSON.stringify(main.vars)}`);
      const today = daysAgo(0);
      if (main.firstBoot !== today || main.lastBoot !== today || main.lastSeen !== today) {
        out.push(`日付がちがいます: first=${main.firstBoot} last=${main.lastBoot} seen=${main.lastSeen}`);
      }
      return out;
    },
  },
  {
    name: '何日ぶりかは、さいごに会った日（lastSeen）から数える（起動したままの日もふくむ）',
    dir: SAVE,
    setup: (dir) => writeIn(dir, 'nashi_save.json',
      JSON.stringify({ vars: {}, boots: 5, firstBoot: daysAgo(30), lastBoot: daysAgo(20), lastSeen: daysAgo(1) })),
    steps: [
      ['OnBoot:master', null],
      ['OnDays', '\\01/30\\e'],
    ],
  },
  {
    name: '出会った日が先の日付（時計がずれていた）なら、信じずにきょうにする',
    dir: SAVE,
    setup: (dir) => writeIn(dir, 'nashi_save.json',
      JSON.stringify({ vars: {}, boots: 5, firstBoot: daysAgo(-30), lastBoot: daysAgo(2) })),
    steps: [
      ['OnBoot:master', null],
      ['OnDays', '\\02/0\\e'],
    ],
  },
  {
    name: '何日ぶりか・出会ってから何日か（保存データの firstBoot / lastBoot から）',
    dir: SAVE,
    setup: (dir) => writeIn(dir, 'nashi_save.json',
      JSON.stringify({ vars: {}, boots: 5, firstBoot: daysAgo(10), lastBoot: daysAgo(3) })),
    steps: [
      ['OnBoot:master', null],
      ['OnDays', '\\03/10\\e'],
    ],
  },
  {
    name: 'はじめての起動では、Reference0（消滅回数）をシェル名にしない',
    dir: SAVE,
    steps: [
      ['OnFirstBoot:3', null],
      ['OnShell', '\\0「」\\e'],
      ['OnBoot:master', null],
      ['OnShell', '\\0「master」\\e'],
    ],
  },
  {
    name: 'ブロックが無いゴーストの、既定の反応',
    dir: EMPTY,
    steps: [
      ['OnFirstBoot', '\\0\\s[0]はじめまして。\\nなしこです。\\nよろしくね。\\e'],
      ['OnBoot', '\\0\\s[0]おかえりなさい。\\e'],
      ['OnMouseDoubleClick:0,0,0,0,Head', {
        valueOneOf: ['\\0\\s[0]なに？\\e', '\\0\\s[0]呼んだ？\\e', '\\0\\s[0]どうしたの？\\e'],
      }],
      ['OnMinuteChange', { status: '204 No Content', value: '' }],
      ['OnClose', '\\0\\s[0]またね。\\-'],
    ],
  },
  {
    name: '終了のとき \\- が必ず付く／ふつうのイベントには \\e が付く',
    dir: MAIN,
    steps: [
      ['OnBoot', '\\0おきた\\e'],
      ['OnClose', '\\0ばいばい\\-'],
    ],
  },
  {
    name: 'しぼり込み — あたま用があれば、条件なしより優先される',
    dir: MAIN,
    steps: [
      ['OnNadeNade:0,0,0,0,Head', '\\0あたま\\e'],
      ['OnNadeNade:0,0,0,0,Bust', '\\0どこか\\e'],
    ],
  },
  {
    name: 'ゴースト間通信 — 細かい条件ほど先に選ばれる',
    dir: MAIN,
    steps: [
      // 相手＋言葉（いちばん細かい）
      ['OnCommunicate:みかん,ねえねえ', { value: '\\0みかんだ\\e', commTo: 'みかん' }],
      // 言葉だけ（相手が違うので、いちばん細かいものは外れる）
      ['OnCommunicate:さくら,こんにちは', { value: '\\0あいさつ\\e', commTo: '' }],
      // どれにも当てはまらないので、条件なし
      ['OnCommunicate:だれか,やあ', { value: '\\0だれか\\e', commTo: '' }],
    ],
  },
  {
    name: '話しかけ合いは 8 往復で打ち切る（しゃべりは続く）',
    dir: MAIN,
    steps: (() => {
      const out = [];
      for (let i = 1; i <= 10; i++) {
        out.push(['OnCommunicate:みかん,ねえ', {
          value: '\\0みかんだ\\e',
          commTo: i <= 8 ? 'みかん' : '',
          // 世代数は初回が 0 で、返すたびに増える。打ち切ったあとは付かない。
          age: i <= 8 ? String(i - 1) : '',
        }]);
      }
      return out;
    })(),
  },
  {
    name: '「◯秒ごと」は間引かれる（3 秒ごとなら 7 回たたいて 2 回）',
    dir: MAIN,
    steps: [
      ['OnSecondChange:0,1,1', { status: '204 No Content' }],
      ['OnSecondChange:0,1,2', { status: '204 No Content' }],
      ['OnSecondChange:0,1,3', { value: '\\01\\e' }],
      ['OnSecondChange:0,1,4', { status: '204 No Content' }],
      ['OnSecondChange:0,1,5', { status: '204 No Content' }],
      ['OnSecondChange:0,1,6', { value: '\\02\\e' }],
      ['OnSecondChange:0,1,7', { status: '204 No Content' }],
    ],
  },
  {
    name: 'マウスが同じ場所で 20 回続いたら、なでられたことにする／すぐ続けては反応しない',
    dir: MAIN,
    steps: (() => {
      const out = [];
      for (let i = 1; i <= 20; i++) {
        out.push(['OnMouseMove:0,0,0,0,Head',
          i < 20 ? { status: '204 No Content' } : { value: '\\0あたま\\e' }]);
      }
      // 反応したあと 5 秒のあいだは、また 20 回なでても反応しない
      for (let i = 1; i <= 20; i++) out.push(['OnMouseMove:0,0,0,0,Head', { status: '204 No Content' }]);
      return out;
    })(),
  },
  {
    name: 'しゃべっている途中（Status: talking）は、なでても割りこまない',
    dir: MAIN,
    steps: (() => {
      const out = [];
      for (let i = 1; i <= 20; i++) out.push(['OnMouseMove:0,0,0,0,Head|Status:talking', { status: '204 No Content' }]);
      return out;
    })(),
  },
  {
    name: 'なでたときの既定の反応 — むねはいやがり、ほかの場所は（書いていなければ）何も言わない',
    dir: EMPTY,
    steps: (() => {
      const out = [];
      for (let i = 1; i <= 20; i++) out.push(['OnMouseMove:0,0,0,0,Hand', { status: '204 No Content' }]);
      for (let i = 1; i <= 19; i++) out.push(['OnMouseMove:0,0,0,0,Bust', { status: '204 No Content' }]);
      out.push(['OnMouseMove:0,0,0,0,Bust', { value: '\\0\\s[2]……あんまり触らないで。\\e' }]);
      return out;
    })(),
  },
  {
    name: '当たり判定の外は、なでたことにしない',
    dir: MAIN,
    steps: (() => {
      const out = [];
      for (let i = 1; i <= 10; i++) out.push(['OnMouseMove:0,0,0,0,', { status: '204 No Content' }]);
      return out;
    })(),
  },
  {
    name: 'まとまりからトークをよぶ — まとまりに入っているものだけが出る',
    dir: MAIN,
    steps: [
      ['OnGroupTest', { value: '\\0おやすみ\\e' }],
      ['OnGroupTest', { value: '\\0おやすみ\\e' }],
    ],
  },
  {
    name: 'たずねる — 返ってきた答えを、栞が変数に入れる',
    dir: MAIN,
    steps: [
      ['OnAskTest', { value: '\\![open,inputbox,nashi:こたえ,-1,]\\e' }],
      // SSP は OK が押されると OnUserInput を送ってくる
      ['OnUserInput:nashi:こたえ,ミヤガワ', { status: '204 No Content' }],
      ['OnShowAnswer', { value: '\\0ミヤガワ\\e' }],
      // 知らない ID のときは、変数をいじらない
      ['OnUserInput:よそのID,べつのこたえ', { status: '204 No Content' }],
      ['OnShowAnswer', { value: '\\0ミヤガワ\\e' }],
    ],
  },
  {
    name: '◯秒後によぶ — 時間が来たら動く',
    dir: MAIN,
    steps: [
      ['OnLaterTest', { status: '204 No Content' }],   // 予約するだけ
      ['OnSecondChange:0,1,1', { status: '204 No Content' }],
      ['OnSecondChange:0,1,2', { status: '204 No Content' }],
      ['OnSecondChange:0,1,3', { value: '\\01\\e' }],   // これはいつもの「3 秒ごと」
      ['OnSecondChange:0,1,4', { status: '204 No Content' }],
      ['OnSecondChange:0,1,5', { value: '\\0おまたせ\\e' }],
      ['OnSecondChange:0,1,6', { value: '\\02\\e' }],   // 一度きり。あとはいつもどおり
      ['OnSecondChange:0,1,7', { status: '204 No Content' }],
    ],
  },
  {
    name: '本物の SAORI — 待つ呼び出しと、待たない呼び出しの両方',
    dir: MAIN,
    steps: [
      // 待つほう。SAORI が返した Result: がそのままセリフになる
      ['OnSaoriSync', { value: '\\0すぐ\\e' }],
      // 待たないほう。呼んだ時点では何も出ない
      ['OnSaoriReal', { status: '204 No Content' }],
      ['!sleep:600', null],
      ['OnSecondChange:0,1,1', { value: '\\0とどいた:slow_saori.dll\\e' }],
      ['OnShowAnswer', { value: '\\0ぬるい\\e' }],
    ],
  },
  {
    name: 'おそい SAORI の途中で終了しても、栞は落ちない',
    dir: MAIN,
    steps: [
      // 6.5 秒かかる呼び出しを始めてから、すぐ unload（＋ FreeLibrary）する。
      // 栞が消えたあとに答えが返ってくる順番になるので、置き場を分けあう作りと
      // 「走っている間は栞を外させない」押さえが効いていないと、ここで落ちます。
      ['OnSaoriVerySlow', { status: '204 No Content' }],
      ['!unload', null],
      ['!sleep:3000', null],
    ],
  },
  {
    name: '待たない SAORI — 答えが届くと変数に入り、つぎの秒に知らせる',
    dir: MAIN,
    steps: [
      // 呼んだ時点では何も出ない（別のスレッドで動いている）
      ['OnSaoriTest', { status: '204 No Content' }],
      ['!sleep:400', null],
      // 届いた答えは OnSaoriDone として、つぎの「ずっとくりかえす」で知らせる
      ['OnSecondChange:0,1,1', '\\0とどいた:nai.dll\\e'],
      // 一度きり。つぎの秒は、いつもの「3 秒ごと」に戻る
      ['OnSecondChange:0,1,2', { status: '204 No Content' }],
      ['OnSecondChange:0,1,3', { value: '\\01\\e' }],
    ],
  },
  {
    name: 'ネットワーク更新 — 結果だけ知らせ、途中経過と「変わりなし」は黙る',
    dir: EMPTY,
    steps: [
      ['OnUpdateBegin:なしこ,C:\\ghost,,ghost', { status: '204 No Content' }],
      ['OnUpdateReady:2,a.txt,ghost', { status: '204 No Content' }],
      ['OnUpdate.OnDownloadBegin:a.txt,0,2', { status: '204 No Content' }],
      ['OnUpdateComplete:none,,,ghost', { status: '204 No Content' }],
      ['OnUpdateComplete:changed,a.txt,,ghost',
        '\\0\\s[0]更新できたよ。\\n新しくなったところは、つぎに起動したときからだよ。\\e'],
      ['OnUpdateFailure:timeout,a.txt,,ghost',
        '\\0\\s[0]更新できなかったみたい。\\n（timeout）\\e'],
      // 自分でやめたときは黙る
      ['OnUpdateFailure:artificial,,,ghost', { status: '204 No Content' }],
    ],
  },
  {
    name: '何も出力しないブロックは 204／選択肢の行き先が呼ばれる',
    dir: MAIN,
    steps: [
      ['OnEmptyOut', { status: '204 No Content', value: '' }],
      // まだ出していない選択肢の行き先は動かさない（SSTP でだれでも送れるため）
      ['OnChoiceSelect:こたえ', { status: '204 No Content' }],
      ['OnAnchorSelect:こたえ', { status: '204 No Content' }],
      ['OnChoiceTest', '\\q[はい,こたえ]\\e'],
      ['OnChoiceSelect:こたえ', '\\0えらばれた\\e'],
    ],
  },
  {
    name: '選択肢の見出しの , で、行き先を書き足せない',
    dir: MAIN,
    steps: [
      ['OnChoiceComma', '\\q[はい，OnEvil,こたえ]\\e'],
    ],
  },
  {
    name: 'たずねる — 開いていない箱・同じ答えの 2 回目は受け取らない',
    dir: MAIN,
    steps: [
      // 箱を開く前に答えが来ても、変数をいじらない
      ['OnUserInput:nashi:こたえ,なりすまし', { status: '204 No Content' }],
      ['OnShowAnswer', { valueOneOf: ['\\0\\e', ''] }],      // 初期値（空）のまま
      ['OnAskTest', { value: '\\![open,inputbox,nashi:こたえ,-1,]\\e' }],
      ['OnUserInput:nashi:こたえ,ほんもの', { status: '204 No Content' }],
      ['OnShowAnswer', { value: '\\0ほんもの\\e' }],
      // 1 つの箱には 1 回だけ答えられる
      ['OnUserInput:nashi:こたえ,にどめ', { status: '204 No Content' }],
      ['OnShowAnswer', { value: '\\0ほんもの\\e' }],
    ],
  },
  {
    name: 'ほかのコンピュータからの要求（SecurityLevel: external）には反応しない',
    dir: MAIN,
    steps: [
      ['OnBoot|SecurityLevel:external', { status: '204 No Content' }],
      ['OnBoot|SecurityLevel:local', '\\0おきた\\e'],
    ],
  },
  {
    name: '話しかけ合いは、あいだに OnSecondChange がはさまっても 8 往復で打ち切る',
    dir: MAIN,
    steps: (() => {
      const out = [];
      for (let i = 1; i <= 10; i++) {
        out.push(['OnSecondChange:0,0,0,0', null]);
        out.push(['OnCommunicate:みかん,ねえ', {
          value: '\\0みかんだ\\e',
          commTo: i <= 8 ? 'みかん' : '',
        }]);
      }
      return out;
    })(),
  },
  {
    name: '相手が付けてきた Age も数に入れる（8 往復目なら返さない）',
    dir: MAIN,
    steps: [
      ['OnCommunicate:みかん,ねえ|Age:3', { value: '\\0みかんだ\\e', commTo: 'みかん', age: '3' }],
      ['OnCommunicate:みかん,ねえ|Age:8', { value: '\\0みかんだ\\e', commTo: '' }],
    ],
  },
  {
    name: 'しゃべれないとき（Reference3 が 0）は、時間が来た予約も待たせる',
    dir: MAIN,
    steps: [
      ['OnLaterTest', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,0', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,0', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,0', { status: '204 No Content' }],   // 「3 秒ごと」も、しゃべれないので取っておく
      ['OnSecondChange:0,0,0,0', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,0', { status: '204 No Content' }],   // 5 秒目。予約も待つ
      ['OnSecondChange:0,0,0,1', { value: '\\0おまたせ\\e' }],   // しゃべれるようになったら、時間が来た予約から
      ['OnSecondChange:0,0,0,1', { value: '\\01\\e' }],         // つぎの秒に、取っておいた「3 秒ごと」のセリフ
    ],
  },
  {
    name: '時報は、しゃべっている途中（Status: talking）なら、しゃべれるようになってから出す',
    dir: MAIN,
    steps: [
      ['OnHourTimeSignal:0,0,0,1|Status:talking', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,1', { value: '\\0じほう\\e' }],
    ],
  },
  {
    name: '取っておいた時報は、そのあいだの「3 秒ごと」のセリフで上書きされない',
    dir: MAIN,
    steps: [
      ['OnHourTimeSignal:0,0,0,1|Status:talking', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,0', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,0', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,0', { status: '204 No Content' }],   // 「3 秒ごと」が動くが、時報のほうが大事
      ['OnSecondChange:0,0,0,1', { value: '\\0じほう\\e' }],
    ],
  },
  {
    name: 'ランダムトーク — だまったトークのかわりに、ほかのトークをためす（直近に出したものも最後にはためす）',
    dir: TALK,
    steps: [
      ['OnSecondChange:0,0,0,1', '\\0はなす\\e'],
      // 「はなす」は直近に出したので外されるが、ほかがだまったので、最後にためして話す
      ['OnSecondChange:0,0,0,1', '\\0はなす\\e'],
    ],
  },
  {
    name: 'ランダムトークの時計は、しゃべれないあいだ止まる（間隔 10 秒なら、しゃべれるようになってから 8〜12 秒）',
    dir: TALKWAIT,
    steps: (() => {
      const out = [];
      for (let i = 1; i <= 12; i++) out.push(['OnSecondChange:0,0,0,0', { status: '204 No Content' }]);
      for (let i = 1; i <= 7; i++) out.push(['OnSecondChange:0,0,0,1', { status: '204 No Content' }]);
      for (let i = 1; i <= 5; i++) out.push(['OnSecondChange:0,0,0,1', null]);
      out.push(['OnCheck', '\\01\\e']);   // 12 秒たつまでのどこかで話している
      return out;
    })(),
  },
  {
    name: 'ランダムトーク — しゃべっている途中・最小化されているあいだは、ひとりでにしゃべらない',
    dir: TALK,
    steps: [
      ['OnSecondChange:0,0,0,1|Status:talking', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,1|Status:minimizing', { status: '204 No Content' }],
      ['OnSecondChange:0,0,0,1', '\\0はなす\\e'],
    ],
  },
  {
    name: '1時間ごと — SSP の OnHourTimeSignal で、以前の OnHourChange のブロックも動く',
    dir: MAIN,
    steps: [
      ['OnHourTimeSignal:0,0,0,1', '\\0じほう\\e'],
    ],
  },
  {
    name: 'ほかのゴーストから切り替わって来たとき — 専用が無ければ「起動したとき」、シェル名も入る',
    dir: MAIN,
    steps: [
      ['OnGhostChanged:みかん,,みかん,C:\\ghost\\mikan,,,,master2', '\\0おきた\\e'],
      ['OnShowShell', '\\0master2\\e'],
      ['OnShellChanged:master3,なしこ,C:\\shell', null],
      ['OnShowShell', '\\0master3\\e'],
    ],
  },
  {
    name: '文字の飾り・音・濃さ・移動のタグ',
    dir: MAIN,
    steps: [
      ['OnStyleTest', '\\f[bold,1]\\f[color,#2f62c8]\\f[height,150%]\\0だいじ\\f[default]\\e'],
      ['OnBgmTest', '\\![sound,loop,music\\bgm.mp3,--volume=40]\\1\\![set,alpha,30,--time=500]'
        + '\\0\\![move,--X=100,--Y=200,--time=1000,--base=screen]\\![sound,stop]\\e'],
    ],
  },
  {
    name: 'イベントを起こす選択肢 — On を補い、情報は Reference0 で届く',
    dir: MAIN,
    steps: [
      ['OnChoiceEventTest', '\\q[春,OnLikeSeason,花見]\\e'],
      // SSP はえらばれると、OnChoiceSelect ではなく OnLikeSeason を直接起こす
      ['OnLikeSeason:花見', '\\0花見\\e'],
    ],
  },
  {
    name: 'スライダーでたずねる — 答えは「たずねる」と同じく変数に入る',
    dir: MAIN,
    steps: [
      ['OnSliderTest', '\\![open,sliderinput,nashi:こたえ,-1,1,1,10]\\e'],
      ['OnUserInput:nashi:こたえ,7', { status: '204 No Content' }],
      ['OnShowAnswer', '\\07\\e'],
    ],
  },
  {
    name: 'SSP が知らせてくるユーザーの情報と版を、情報ブロックで読める',
    dir: MAIN,
    steps: [
      ['OnNotifyUserInfo:ゆき|Reference2:2000,5,5', null],
      ['basewareversion:2.9.26', null],
      ['OnShowUser', '\\0ゆき/5/5/2.9.26\\e'],
    ],
  },
  {
    name: '着せ替え — そのキャラに切りかえてから \\![bind,カテゴリ,部品,1|0] を出す',
    dir: MAIN,
    steps: [
      ['OnDressTest', '\\1\\![bind,服,エプロン,1]\\0\\![bind,リボン,白,0]\\e'],
    ],
  },
  {
    // 「こたえ」の UTF-8 は E3 81 93 / E3 81 9F / E3 81 88
    name: 'SSP の情報 — たずねたぶんだけ、答えを 1 回だけ変数に入れる',
    dir: MAIN,
    steps: [
      // たずねる前に答えが来ても、変数をいじらない
      ['OnNashiProp_E38193E3819FE38188:9.9.99', { status: '204 No Content' }],
      ['OnShowAnswer', { valueOneOf: ['\\0\\e', ''] }],
      ['OnPropTest', '\\![get,property,OnNashiProp_E38193E3819FE38188,baseware.version]\\0%property[system.os.name]\\e'],
      ['OnNashiProp_E38193E3819FE38188:2.9.26', { status: '204 No Content' }],
      ['OnShowAnswer', '\\02.9.26\\e'],
      // 2 回目の答えは受けとらない
      ['OnNashiProp_E38193E3819FE38188:9.9.99', { status: '204 No Content' }],
      ['OnShowAnswer', '\\02.9.26\\e'],
    ],
  },
  {
    name: 'ファイルを落とされたとき — 1 つ目のファイルを読める',
    dir: MAIN,
    steps: [
      ['OnFileDrop2:C:\\a.txt,0', '\\0C:\\\\a.txt\\e'],
    ],
  },
];

// ---------------------------------------------------------------------- 実行
let failed = 0;
let checked = 0;

for (const sc of scenarios) {
  let got;
  try {
    got = host.run(sc.dir, sc.steps.map((s) => s[0]), sc.setup);
  } catch (e) {
    console.log(`${red}  だめ ${sc.name}${off}\n        ${e.message}`);
    failed++;
    continue;
  }

  const problems = [];
  sc.steps.forEach(([spec, want], i) => {
    const res = got[i];
    if (!res) { problems.push(`${spec}: 応答がありません`); return; }
    const exp = typeof want === 'string' ? { value: want } : want;
    if (!exp) return;
    checked++;

    if (exp.valueOneOf) {
      if (!exp.valueOneOf.includes(res.value)) {
        problems.push(`${spec}\n          出た  : ${res.value}`
          + `\n          どれか: ${exp.valueOneOf.join(' / ')}`);
      }
      return;
    }
    if (exp.value !== undefined && res.value !== exp.value) {
      problems.push(`${spec}\n          出た    : ${res.value}\n          ほしい  : ${exp.value}`);
    }
    if (exp.commTo !== undefined && res.commTo !== exp.commTo) {
      problems.push(`${spec}  話しかけ先  出た: "${res.commTo}" / ほしい: "${exp.commTo}"`);
    }
    if (exp.status !== undefined && res.status !== exp.status) {
      problems.push(`${spec}  応答の種類  出た: "${res.status}" / ほしい: "${exp.status}"`);
    }
    if (exp.age !== undefined && res.age !== exp.age) {
      problems.push(`${spec}  世代数  出た: "${res.age}" / ほしい: "${exp.age}"`);
    }
  });

  // 動かしたあとのフォルダのようす（保存データの控えなど）。問題があれば、その説明を返す
  if (sc.after) { checked++; problems.push(...sc.after(sc.dir)); }

  if (problems.length) {
    failed++;
    console.log(`${red}  だめ ${sc.name}${off}`);
    for (const p of problems) console.log(`        ${p}`);
  } else {
    console.log(`${green}  OK  ${off}${sc.name}  ${dim}(${sc.steps.length} 回)${off}`);
  }
}

console.log('');
if (failed) {
  console.log(`${red}[behavior] ${scenarios.length} 場面中 ${failed} 場面がだめでした。${off}`);
  process.exit(1);
}
console.log(`${green}[behavior] ${scenarios.length} 場面・${checked} か所すべて期待どおりです。${off}`);
