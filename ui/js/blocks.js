/* なしスタジオ - ブロック定義
 * ここで定義した形が、そのまま ghost.json（栞が読むファイル）の形になります。
 */
'use strict';
window.NASHI = window.NASHI || {};

(function (N) {
  const T = N.I18n.T;

  // ------------------------------------------------------------ categories
  N.CATEGORIES = [
    { id: 'events',    name: T('イベント'), color: '#ffbf00' },
    { id: 'talk',      name: T('セリフ'),   color: '#ff6680' },
    { id: 'looks',     name: T('見た目'),   color: '#9966ff' },
    { id: 'control',   name: T('制御'),     color: '#ffab19' },
    { id: 'variables', name: T('変数'),     color: '#ff8c1a' },
    { id: 'operators', name: T('演算'),     color: '#59c059' },
    { id: 'info',      name: T('情報'),     color: '#5cb1d6' },
  ];

  N.EVENTS = [
    [T('起動したとき'), 'OnBoot'],
    [T('はじめて起動したとき'), 'OnFirstBoot'],
    [T('終了するとき'), 'OnClose'],
    [T('ダブルクリックされたとき'), 'OnMouseDoubleClick'],
    [T('クリックされたとき'), 'OnMouseClick'],
    [T('なでられたとき'), 'OnNadeNade'],
    [T('マウスが動いたとき'), 'OnMouseMove'],
    [T('マウスが乗ったとき'), 'OnMouseEnter'],
    [T('マウスが離れたとき'), 'OnMouseLeave'],
    [T('マウスが止まっているとき'), 'OnMouseHover'],
    [T('ホイールを回されたとき'), 'OnMouseWheel'],
    [T('1時間ごと'), 'OnHourTimeSignal'],
    [T('1分ごと'), 'OnMinuteChange'],
    [T('ずっとくりかえす'), 'OnSecondChange'],
    [T('選択肢がえらばれたとき'), 'OnChoiceSelect'],
    [T('選択肢が時間切れになったとき'), 'OnChoiceTimeout'],
    [T('話しかけられたとき'), 'OnCommunicate'],
    [T('他のゴーストから来たとき'), 'OnGhostChanged'],
    [T('他のゴーストへ行くとき'), 'OnGhostChanging'],
    [T('ほかのゴーストが起動したとき'), 'OnOtherGhostBooted'],
    [T('ほかのゴーストが終了したとき'), 'OnOtherGhostClosed'],
    [T('消すように言われたとき'), 'OnVanishSelecting'],
    [T('消すことが決まったとき'), 'OnVanishSelected'],
    [T('消すのをやめてもらえたとき'), 'OnVanishCancel'],
    [T('キーが押されたとき'), 'OnKeyPress'],
    [T('ファイルを落とされたとき'), 'OnFileDrop2'],
    [T('URL を落とされたとき'), 'OnURLDropped'],
    [T('シェルを着がえたとき'), 'OnShellChanged'],
    [T('着せ替えたとき'), 'OnDressupChanged'],
    [T('バルーンが変わったとき'), 'OnBalloonChange'],
    [T('何かをインストールしたとき'), 'OnInstallComplete'],
    [T('サーフェスがもどったとき'), 'OnSurfaceRestore'],
    [T('最小化されたとき'), 'OnWindowStateMinimize'],
    [T('最小化からもどったとき'), 'OnWindowStateRestore'],
    [T('スクリーンセーバーが終わったとき'), 'OnScreenSaverEnd'],
    [T('画面のロックを解いたとき'), 'OnSessionUnlock'],
    [T('スリープからもどったとき'), 'OnSysResume'],
    [T('バッテリーが少なくなったとき'), 'OnBatteryLow'],
    [T('画面の大きさが変わったとき'), 'OnDisplayChange'],
    [T('ゴミ箱を空にしたとき'), 'OnRecycleBinEmpty'],
    [T('ダークテーマが切りかわったとき'), 'OnDarkTheme'],
    [T('更新をはじめたとき'), 'OnUpdateBegin'],
    [T('更新するものが見つかったとき'), 'OnUpdateReady'],
    [T('更新がおわったとき'), 'OnUpdateComplete'],
    [T('更新に失敗したとき'), 'OnUpdateFailure'],
    [T('SAORI の答えがとどいたとき'), 'OnSaoriDone'],
    [T('答えが返ってきたとき'), 'OnUserInput'],
    [T('答えをやめたとき'), 'OnUserInputCancel'],
    [T('その他（自分で書く）'), '__custom__'],
  ];

  // SSP にたずねられる情報（プロパティシステム）。よく使うものだけ。ほかは自分で書ける。
  // 名前は UKADOC の「プロパティシステム」の一覧どおり。
  N.PROPERTIES = [
    [T('SSP の版'), 'baseware.version'],
    [T('入っているゴーストの数'), 'ghostlist.count'],
    [T('いまのシェルの名前'), 'currentghost.shelllist.current.name'],
    [T('さくらの表情の番号'), 'currentghost.scope(0).surface.num'],
    [T('バッテリーの残り(％)'), 'system.power.battery.percent'],
    [T('電源(AC / バッテリー)'), 'system.power.source'],
    [T('Windows のテーマ(dark / light)'), 'system.theme.os.mode'],
    [T('CPU の使用率(％)'), 'system.cpu.load'],
    [T('メモリの使用率(％)'), 'system.memory.load'],
    [T('OS の名前'), 'system.os.name'],
    [T('その他（自分で書く）'), '__custom__'],
  ];

  // マウス系＝「どこを・だれを」でしぼり込めるイベント
  N.MOUSE_EVENTS = {
    OnMouseClick: 1, OnMouseDoubleClick: 1, OnMouseMove: 1,
    OnMouseWheel: 1, OnNadeNade: 1,
    OnMouseEnter: 1, OnMouseLeave: 1, OnMouseHover: 1,
  };

  // 当たり判定の名前。仮シェルはこの名前で書き出しています。
  N.AREAS = [
    [T('どこか'), ''], [T('あたま'), 'Head'], [T('かお'), 'Face'],
    [T('むね'), 'Bust'], [T('スカート'), 'Skirt'], [T('て'), 'Hand'],
  ];
  N.WHO_ANY = [[T('どちらか'), -1], [T('さくら'), 0], [T('うにゅう'), 1]];

  // Reference の意味（実行パネルのヒント用）
  N.EVENT_REFS = {
    OnBoot: [T('シェル名')],
    OnFirstBoot: [T('消滅回数')],
    OnMouseDoubleClick: [T('X座標'), T('Y座標'), T('ホイール'), T('相手(0=本体/1=相方)'), T('当たった場所')],
    OnMouseClick: [T('X座標'), T('Y座標'), T('ホイール'), T('相手'), T('当たった場所'), T('ボタン')],
    OnMouseMove: [T('X座標'), T('Y座標'), T('ホイール'), T('相手'), T('当たった場所')],
    OnNadeNade: [T('X座標'), T('Y座標'), T('ホイール'), T('相手'), T('なでられた場所')],
    OnMouseWheel: [T('X座標'), T('Y座標'), T('回した量'), T('相手'), T('当たった場所')],
    OnSecondChange: [T('OSの連続起動時間(時)'), T('見切れていたら1'), T('重なっていたら1'), T('しゃべってよいか(1=よい)'), T('放置されている秒数')],
    OnMinuteChange: [T('OSの連続起動時間(時)'), T('見切れていたら1'), T('重なっていたら1'), T('しゃべってよいか(1=よい)'), T('放置されている秒数')],
    OnHourTimeSignal: [T('OSの連続起動時間(時)'), T('見切れていたら1'), T('重なっていたら1'), T('(いつも1)'), T('放置されている秒数')],
    OnChoiceSelect: [T('えらばれたID')],
    OnChoiceTimeout: [T('時間切れになったスクリプト')],
    OnKeyPress: [T('押されたキー(文字)'), T('押されたキー(仮想キーコード)'), T('押しっぱなしの回数'), T('キャラの番号'), T('一緒に押したキー(shift など)')],
    OnMouseEnter: [T('X座標'), T('Y座標'), '', T('相手(0=本体/1=相方)'), T('当たった場所')],
    OnMouseLeave: [T('X座標'), T('Y座標'), '', T('相手(0=本体/1=相方)'), T('当たった場所')],
    OnMouseHover: [T('X座標'), T('Y座標'), '', T('相手(0=本体/1=相方)'), T('当たった場所')],
    OnOtherGhostBooted: [T('起動したゴーストの本体側の名前'), T('起動したときのスクリプト'), T('ゴースト名'), '', '', '', '', T('シェル名')],
    OnOtherGhostClosed: [T('終了したゴーストの本体側の名前'), T('最後のスクリプト'), T('ゴースト名'), '', '', '', '', T('シェル名')],
    OnFileDrop2: [T('落とされたファイル(いくつもあるときは区切り文字 1 でつながる)'), T('落とされたキャラの番号'), T('ファイルの種類(MIME)')],
    OnURLDropped: [T('落としてきたファイルの場所'), 'URL', T('落とされたキャラの番号')],
    OnShellChanged: [T('新しいシェル名'), T('ゴースト名'), T('シェルの場所')],
    OnDressupChanged: [T('キャラの番号'), T('パーツの名前'), T('1=つけた / 0=はずした'), T('カテゴリ名'), 'script / user'],
    OnBalloonChange: [T('新しいバルーン名'), T('バルーンの場所')],
    OnInstallComplete: [T('種類(ghost/shell/balloon…)'), T('名前'), T('名前2')],
    OnScreenSaverEnd: [T('スクリーンセーバー名'), T('場所'), T('始まるまでの秒数')],
    OnSysResume: ['normal / auto / critical'],
    OnBatteryLow: [T('残り(％)'), T('残り時間(不明なら -1)'), 'offline / online / backup', T('状態(low,charging など)')],
    OnDisplayChange: [T('色の深さ(bpp)'), T('幅'), T('高さ')],
    OnRecycleBinEmpty: [T('残ったファイル数'), T('残った大きさ'), T('減った数'), T('減った大きさ'), T('1=空にできた'), T('空にしたゴースト')],
    OnDarkTheme: [T('アプリの設定(1=ダーク)'), T('Windows の設定(1=ダーク)')],
    OnGhostChanged: [T('前のゴーストの本体側の名前'), T('前のゴーストの切り替えスクリプト'), T('前のゴースト名'), T('前のゴーストの場所'), '', '', '', T('シェル名')],
    OnCommunicate: [T('相手の名前(通信ボックスなら user)'), T('言われたこと')],
    OnUpdateBegin: [T('ゴースト名'), T('フォルダの場所'), '', T('種類(ghost/shell/balloon…)')],
    OnUpdateReady: [T('更新するファイル数−1'), T('ファイル名(カンマ区切り)'), T('種類')],
    OnUpdateComplete: [T('none=変更なし / changed=更新した'), T('更新したファイル名'), '', T('種類')],
    OnUpdateFailure: [T('失敗したわけ(timeout など)'), T('できなかったファイル名'), '', T('種類')],
    'OnUpdate.OnDownloadBegin': [T('落としているファイル名'), T('何個目(0から)'), T('全部の数−1')],
    'OnUpdate.OnMD5CompareFailure': [T('ファイル名'), T('正しいMD5'), T('落ちてきたMD5')],
    OnSaoriDone: [T('よんだファイル名'), T('届いた答え')],
    OnUserInput: [T('たずねたときのID'), T('入力された内容')],
    OnUserInputCancel: [T('たずねたときのID'), T('close＝閉じた / timeout＝時間切れ')],
  };

  const WHO = [[T('さくら'), 0], [T('うにゅう'), 1]];
  const WHO_ANY = N.WHO_ANY;
  const AREAS = N.AREAS;
  const YESNO_NL = [[T('改行する'), 1], [T('改行しない'), 0]];

  // --------------------------------------------------------------- helpers
  const DEFS = {};
  N.BLOCKS = DEFS;

  function def(o) {
    DEFS[o.key || o.type] = o;
    o.key = o.key || o.type;
    o.parts = parseSpec(o.spec || '');
    return o;
  }

  // "%who が %text と話す" -> [{lbl}, {arg:'who'}, ...]
  function parseSpec(spec) {
    const parts = [];
    let buf = '';
    for (let i = 0; i < spec.length; i++) {
      if (spec[i] === '%' && /[a-zA-Z_]/.test(spec[i + 1] || '')) {
        let j = i + 1;
        while (j < spec.length && /[a-zA-Z0-9_]/.test(spec[j])) j++;
        if (buf) { parts.push({ lbl: buf }); buf = ''; }
        parts.push({ arg: spec.slice(i + 1, j) });
        i = j - 1;
      } else {
        buf += spec[i];
      }
    }
    if (buf) parts.push({ lbl: buf });
    return parts;
  }

  /** 同じ type でも op ちがいで見た目が変わるブロック */
  const OP_KEYED = { arith: 1, compare: 1, logic: 1 };
  N.defKey = function (block) {
    if (!block || !block.type) return null;
    if (OP_KEYED[block.type] && block.op != null) return block.type + '#' + block.op;
    return block.type;
  };
  N.getDef = function (block) { return DEFS[N.defKey(block)] || null; };

  N.createBlock = function (key) {
    const d = DEFS[key];
    if (!d) return null;
    const b = { type: d.type };
    if (d.fixed) Object.assign(b, d.fixed);
    for (const name in (d.args || {})) {
      const a = d.args[name];
      if (a.kind === 'sub') continue;
      b[name] = typeof a.def === 'function' ? a.def() : a.def;
    }
    for (const s of d.subs || []) b[s.key] = [];
    if (d.dynamic) b[d.dynamic] = [[], []];
    return b;
  };

  N.isReporter = function (block) {
    const d = N.getDef(block);
    return !!d && (d.shape === 'reporter' || d.shape === 'boolean');
  };

  // =========================================================== イベント(hat)
  def({
    type: '@event', cat: 'events', shape: 'hat',
    spec: '%event',
    args: { event: { kind: 'eventname', def: 'OnBoot' } },
    hat: true, kind: 'event',
  });
  // マウス系イベントを選ぶと、この形に変わる（どこを・だれを、で絞り込める）
  def({
    key: '@event.touch', type: '@event', cat: 'events', shape: 'hat',
    spec: T('%who の %area が %event'),
    args: {
      who: { kind: 'dropdown', options: WHO_ANY, def: -1 },
      area: { kind: 'areaname', options: AREAS, def: '' },
      event: { kind: 'eventname', def: 'OnNadeNade' },
    },
    hat: true, kind: 'event',
  });
  // 「話しかけられたとき」を選ぶと、相手と内容でしぼり込める形に変わる
  def({
    key: '@event.comm', type: '@event', cat: 'events', shape: 'hat',
    spec: T('%from に %contains と %event'),
    args: {
      from: { kind: 'input', mode: 'text', def: '', long: true },
      contains: { kind: 'input', mode: 'text', def: '', long: true },
      event: { kind: 'eventname', def: 'OnCommunicate' },
    },
    hat: true, kind: 'event',
  });
  // 「ずっとくりかえす」を選ぶと、間隔を指定できる形に変わる
  def({
    key: '@event.every', type: '@event', cat: 'events', shape: 'hat',
    spec: T('%event %everySec 秒ごと'),
    args: {
      event: { kind: 'eventname', def: 'OnSecondChange' },
      everySec: { kind: 'input', mode: 'number', def: 5 },
    },
    hat: true, kind: 'event',
  });
  def({
    type: '@talk', cat: 'events', shape: 'hat',
    spec: T('ランダムトーク「%name」 えらばれやすさ %weight まとまり %group'),
    args: {
      name: { kind: 'input', mode: 'text', def: T('トーク'), long: true },
      weight: { kind: 'input', mode: 'number', def: 1 },
      group: { kind: 'input', mode: 'text', def: '', long: true },
    },
    hat: true, kind: 'talk',
  });
  def({
    type: '@function', cat: 'events', shape: 'hat',
    spec: T('「%name」がよばれたとき'),
    args: { name: { kind: 'input', mode: 'text', def: T('あたらしいトーク'), long: true } },
    hat: true, kind: 'function',
  });

  // ============================================================== セリフ
  def({
    type: 'say', cat: 'talk', shape: 'stack',
    spec: T('%who が %text と話す %nl'),
    args: {
      who: { kind: 'dropdown', options: WHO, def: 0 },
      // expand … 横に「広げて書く」ボタンを付ける（何行にもわたるセリフを書く窓）
      // choices … 横に ▾ を付けて、プロジェクトにある値（表情・うごき・まとまり・イベント）を名前でえらべる
      text: { kind: 'input', mode: 'text', def: T('こんにちは。'), long: true, expand: true },
      nl: { kind: 'dropdown', options: YESNO_NL, def: 1 },
    },
  });
  def({
    type: 'newline', cat: 'talk', shape: 'stack',
    spec: T('%count 回 改行する'),
    args: { count: { kind: 'input', mode: 'number', def: 1 } },
  });
  def({ type: 'click_wait', cat: 'talk', shape: 'stack', spec: T('クリックされるまで待つ') });
  def({ type: 'clear', cat: 'talk', shape: 'stack', spec: T('バルーンの文字を消す') });
  def({
    type: 'choice', cat: 'talk', shape: 'stack',
    spec: T('選択肢「%label」→ %target を出す'),
    args: {
      label: { kind: 'input', mode: 'text', def: T('うん'), long: true },
      target: { kind: 'funcname', def: '' },
    },
  });
  // えらぶと、トークではなくイベントを起こす選択肢（\q[見出し,OnX,情報]）。
  // 情報は、起きたイベントの「イベントの情報 0番目」に入る。
  def({
    type: 'choice_event', cat: 'talk', shape: 'stack',
    spec: T('選択肢「%label」→ イベント %event を起こす（情報 %a）'),
    args: {
      label: { kind: 'input', mode: 'text', def: T('はい'), long: true },
      event: { kind: 'input', mode: 'text', def: 'OnAnswer', long: true, choices: 'events' },
      a: { kind: 'input', mode: 'text', def: '', long: true },
    },
  });
  // 文字の飾り（\f[…]）。このあとのセリフに効く。「もとにもどす」で全部はずれる。
  def({
    type: 'font_style', cat: 'talk', shape: 'stack',
    spec: T('文字を %style %on'),
    args: {
      style: {
        kind: 'dropdown', def: 'bold',
        options: [[T('太字'), 'bold'], [T('斜め'), 'italic'], [T('下線つき'), 'underline'], [T('取り消し線つき'), 'strike']],
      },
      on: { kind: 'dropdown', def: 1, options: [[T('にする'), 1], [T('をやめる'), 0]] },
    },
  });
  def({
    type: 'font_color', cat: 'talk', shape: 'stack',
    spec: T('文字の色を %color にする'),
    args: {
      color: {
        kind: 'dropdown', def: '#d03030',
        options: [[T('赤'), '#d03030'], [T('青'), '#2f62c8'], [T('緑'), '#2f8a3a'], [T('オレンジ'), '#e07a10'],
          [T('ピンク'), '#e0508a'], [T('むらさき'), '#7a4ac0'], [T('灰色'), '#808080'], [T('もとの色'), 'default']],
      },
    },
  });
  def({
    type: 'font_size', cat: 'talk', shape: 'stack',
    spec: T('文字の大きさを %size ％にする'),
    args: { size: { kind: 'input', mode: 'number', def: 150 } },
  });
  def({ type: 'font_default', cat: 'talk', shape: 'stack', spec: T('文字の飾りをもとにもどす') });
  def({
    type: 'link', cat: 'talk', shape: 'stack',
    spec: T('リンク「%label」→ %url を出す'),
    args: {
      label: { kind: 'input', mode: 'text', def: T('ホームページ'), long: true },
      url: { kind: 'input', mode: 'text', def: 'https://', long: true },
    },
  });
  def({
    type: 'communicate', cat: 'talk', shape: 'stack',
    spec: T('%who が %to に %text と話しかける'),
    args: {
      who: { kind: 'dropdown', options: WHO, def: 0 },
      to: { kind: 'input', mode: 'text', def: '', long: true },
      text: { kind: 'input', mode: 'text', def: T('こんにちは。'), long: true },
    },
  });
  def({
    type: 'raw', cat: 'talk', shape: 'stack',
    spec: T('さくらスクリプト %text をそのまま出す'),
    args: { text: { kind: 'input', mode: 'text', def: '\\![raise,OnTest]', long: true } },
  });

  // ============================================================== 見た目
  def({
    type: 'surface', cat: 'looks', shape: 'stack',
    spec: T('%who の表情を %id 番にする'),
    args: {
      who: { kind: 'dropdown', options: WHO, def: 0 },
      id: { kind: 'input', mode: 'number', def: 0, choices: 'surfaces' },
    },
  });
  // さくら(0) と うにゅう(1) のほかに、3 人目以降を出したいとき
  def({
    type: 'chara', cat: 'looks', shape: 'stack',
    spec: T('これから %id 番のキャラが話す'),
    args: { id: { kind: 'input', mode: 'number', def: 2 } },
  });
  // SERIKO のアニメーション。中身は「ゴースト」タブの「うごき」で作ります。
  def({
    type: 'anim', cat: 'looks', shape: 'stack',
    spec: T('うごき %id を再生する'),
    args: { id: { kind: 'input', mode: 'number', def: 0, choices: 'anims' } },
  });
  def({
    type: 'balloon', cat: 'looks', shape: 'stack',
    spec: T('バルーンを %id 番にする'),
    args: { id: { kind: 'input', mode: 'number', def: 0 } },
  });
  def({
    type: 'sound', cat: 'looks', shape: 'stack',
    spec: T('音 %file を鳴らす'),
    args: { file: { kind: 'input', mode: 'text', def: 'sound.wav', long: true } },
  });
  // BGM など。セリフを待たずに鳴り、くりかえしは「音を止める」まで続く（\![sound,…]）。
  def({
    type: 'bgm', cat: 'looks', shape: 'stack',
    spec: T('音 %file を %mode（音量 %volume ％）'),
    args: {
      file: { kind: 'input', mode: 'text', def: 'bgm.mp3', long: true },
      mode: { kind: 'dropdown', def: 'loop', options: [[T('くりかえし鳴らす'), 'loop'], [T('1 回鳴らす'), 'play']] },
      volume: { kind: 'input', mode: 'number', def: 100 },
    },
  });
  def({ type: 'sound_stop', cat: 'looks', shape: 'stack', spec: T('鳴っている音をぜんぶ止める') });
  // 着せ替え。部品は「ゴースト」タブの「着せ替え」で作り、ここではその中からえらぶ。
  // えらぶと who / category / part の 3 つがまとめて入る。
  def({
    type: 'dressup', cat: 'looks', shape: 'stack',
    spec: T('着せ替え %part を %on'),
    args: {
      part: { kind: 'dresspart', def: '' },
      on: { kind: 'dropdown', def: 1, options: [[T('つける'), 1], [T('はずす'), 0]] },
    },
    fixed: { who: 0, category: '' },
  });
  def({
    type: 'alpha', cat: 'looks', shape: 'stack',
    spec: T('%who の濃さを %alpha ％にする（%ms ミリ秒かけて）'),
    args: {
      who: { kind: 'dropdown', options: WHO, def: 0 },
      alpha: { kind: 'input', mode: 'number', def: 50 },
      ms: { kind: 'input', mode: 'number', def: 500 },
    },
  });
  def({
    type: 'move', cat: 'looks', shape: 'stack',
    spec: T('%who を画面の 横 %x 縦 %y へ動かす（%ms ミリ秒かけて）'),
    args: {
      who: { kind: 'dropdown', options: WHO, def: 0 },
      x: { kind: 'input', mode: 'number', def: 100 },
      y: { kind: 'input', mode: 'number', def: 100 },
      ms: { kind: 'input', mode: 'number', def: 1000 },
    },
  });

  // ================================================================ 制御
  def({
    type: 'wait', cat: 'control', shape: 'stack',
    spec: T('%ms ミリ秒待つ'),
    args: { ms: { kind: 'input', mode: 'number', def: 500 } },
  });
  def({
    type: 'if', cat: 'control', shape: 'c',
    spec: T('もし %cond なら'),
    args: { cond: { kind: 'input', mode: 'bool' } },
    subs: [{ key: 'then' }],
  });
  def({
    type: 'if_else', cat: 'control', shape: 'c',
    spec: T('もし %cond なら'),
    args: { cond: { kind: 'input', mode: 'bool' } },
    subs: [{ key: 'then' }, { key: 'else', label: T('そうでなければ') }],
  });
  def({
    type: 'repeat', cat: 'control', shape: 'c',
    spec: T('%count 回くりかえす'),
    args: { count: { kind: 'input', mode: 'number', def: 3 } },
    subs: [{ key: 'body' }],
  });
  def({
    type: 'while', cat: 'control', shape: 'c',
    spec: T('%cond の間くりかえす'),
    args: { cond: { kind: 'input', mode: 'bool' } },
    subs: [{ key: 'body' }],
  });
  def({
    type: 'random_one', cat: 'control', shape: 'c',
    spec: T('つぎのどれかをランダムに'),
    dynamic: 'branches',
  });
  def({
    type: 'call', cat: 'control', shape: 'stack',
    spec: T('%name をよぶ'),
    args: { name: { kind: 'funcname', def: '' } },
  });
  // 同じ「まとまり」に入れたランダムトークから、1 つえらんでよぶ
  def({
    type: 'call_group', cat: 'control', shape: 'stack',
    spec: T('%group のトークをどれかよぶ'),
    args: { group: { kind: 'input', mode: 'text', def: '', long: true, choices: 'groups' } },
  });
  def({
    type: 'talk_interval', cat: 'control', shape: 'stack',
    spec: T('ランダムトークの間隔を %sec 秒にする'),
    args: { sec: { kind: 'input', mode: 'number', def: 180 } },
  });
  // 使う人に文字を入力してもらい、答えを変数に入れる（\![open,inputbox,…]）。
  // 質問そのものは、ふつうのセリフブロックで先に言っておきます。
  def({
    type: 'ask', cat: 'control', shape: 'stack',
    spec: T('たずねて、答えを %into に入れる（はじめから %initial と書いておく）'),
    args: {
      into: { kind: 'varname', def: '' },
      initial: { kind: 'input', mode: 'text', def: '', long: true },
    },
  });
  // 文字のかわりに、日付・時刻・数（スライダー）・パスワードをたずねる。
  // 答えの形: 日付は「年,月,日」、時刻は「時,分,秒」、スライダーは数。
  def({
    type: 'ask_kind', cat: 'control', shape: 'stack',
    spec: T('%kind をたずねて、答えを %into に入れる（スライダーは %min 〜 %max）'),
    args: {
      kind: {
        kind: 'dropdown', def: 'dateinput',
        options: [[T('日付'), 'dateinput'], [T('時刻'), 'timeinput'], [T('数（スライダー）'), 'sliderinput'],
          [T('パスワード'), 'passwordinput']],
      },
      into: { kind: 'varname', def: '' },
      min: { kind: 'input', mode: 'number', def: 0 },
      max: { kind: 'input', mode: 'number', def: 100 },
    },
  });
  // SSP のいまの様子をたずねて、答えを変数に入れる（\![get,property,…]）。
  // 答えはこのトークのあとに届くので、同じトークの中ではまだ使えない（「たずねる」と同じ）。
  def({
    type: 'property_get', cat: 'control', shape: 'stack',
    spec: T('SSP に %prop をたずねて、答えを %into に入れる'),
    args: {
      prop: { kind: 'propname', def: 'baseware.version' },
      into: { kind: 'varname', def: '' },
    },
  });
  def({
    type: 'later', cat: 'control', shape: 'stack',
    spec: T('%sec 秒後に %name をよぶ'),
    args: {
      sec: { kind: 'input', mode: 'number', def: 30 },
      name: { kind: 'funcname', def: '' },
    },
  });
  def({
    type: 'raise', cat: 'control', shape: 'stack',
    spec: T('イベント %event を自分で起こす（情報 %a を付ける）'),
    args: {
      event: { kind: 'input', mode: 'text', def: 'OnBoot', long: true, choices: 'events' },
      a: { kind: 'input', mode: 'text', def: '', long: true },
    },
  });
  def({
    type: 'change_ghost', cat: 'control', shape: 'cap',
    spec: T('%name に交代する'),
    args: { name: { kind: 'input', mode: 'text', def: 'random', long: true } },
  });
  def({
    type: 'open_browser', cat: 'control', shape: 'stack',
    spec: T('%url をブラウザで開く'),
    args: { url: { kind: 'input', mode: 'text', def: 'https://', long: true } },
  });

  // 外部モジュール（SAORI）を、答えを待たずに呼ぶ。
  // 時間のかかる SAORI を「◯◯でよんだ答え」で呼ぶと、その間 SSP が止まります。
  // こちらは別のスレッドで動いて、答えが届いたら変数に入り、OnSaoriDone が起きます。
  def({
    type: 'saori_call', cat: 'control', shape: 'stack',
    spec: T('%file を %a %b でよぶ（答えを待たずに %into に入れる）%value'),
    args: {
      file: { kind: 'input', mode: 'text', def: 'saori.dll', long: true },
      a: { kind: 'input', mode: 'text', def: '', long: true },
      b: { kind: 'input', mode: 'text', def: '', long: true },
      into: { kind: 'varname', def: '' },
      value: {
        kind: 'dropdown', def: -1,
        options: [[T('（答え）'), -1], [T('0番目の値'), 0], [T('1番目の値'), 1], [T('2番目の値'), 2]],
      },
    },
  });

  // ネットワーク更新をはじめる（\![updatebymyself]）。
  // ゴーストの設定の「更新のありか」が空だと、SSP は何もできません。
  def({ type: 'update', cat: 'control', shape: 'stack', spec: T('ネットワーク更新をする') });
  def({ type: 'end', cat: 'control', shape: 'cap', spec: T('ここでトークをおわる') });
  def({ type: 'close', cat: 'control', shape: 'cap', spec: T('ゴーストを終了する') });

  // ================================================================ 変数
  def({
    type: 'set', cat: 'variables', shape: 'stack',
    spec: T('%name を %value にする'),
    args: {
      name: { kind: 'varname', def: '' },
      value: { kind: 'input', mode: 'text', def: 0 },
    },
  });
  def({
    type: 'change', cat: 'variables', shape: 'stack',
    spec: T('%name を %value ずつ変える'),
    args: {
      name: { kind: 'varname', def: '' },
      value: { kind: 'input', mode: 'number', def: 1 },
    },
  });
  def({
    type: 'var', cat: 'variables', shape: 'reporter',
    spec: '%name',
    args: { name: { kind: 'varname', def: '' } },
  });

  // ================================================================ 演算
  // spec … 記号のまわりも言語で変わるので、%a・%b を入れた 1 つのことばで渡す
  const arith = (op, spec) => def({
    key: 'arith#' + op, type: 'arith', cat: 'operators', shape: 'reporter',
    spec, fixed: { op },
    args: {
      a: { kind: 'input', mode: 'number', def: '' },
      b: { kind: 'input', mode: 'number', def: '' },
    },
  });
  arith('+', T('%a ＋ %b')); arith('-', '%a − %b'); arith('*', '%a × %b'); arith('/', '%a ÷ %b');
  arith('%', T('%a のあまり %b'));

  const compare = (op, spec) => def({
    key: 'compare#' + op, type: 'compare', cat: 'operators', shape: 'boolean',
    spec, fixed: { op },
    args: {
      a: { kind: 'input', mode: 'text', def: '' },
      b: { kind: 'input', mode: 'text', def: 50 },
    },
  });
  compare('<', T('%a ＜ %b')); compare('=', T('%a ＝ %b')); compare('>', T('%a ＞ %b')); compare('!=', '%a ≠ %b');

  def({
    key: 'logic#and', type: 'logic', cat: 'operators', shape: 'boolean',
    spec: T('%a かつ %b'), fixed: { op: 'and' },
    args: { a: { kind: 'input', mode: 'bool' }, b: { kind: 'input', mode: 'bool' } },
  });
  def({
    key: 'logic#or', type: 'logic', cat: 'operators', shape: 'boolean',
    spec: T('%a または %b'), fixed: { op: 'or' },
    args: { a: { kind: 'input', mode: 'bool' }, b: { kind: 'input', mode: 'bool' } },
  });
  def({
    type: 'not', cat: 'operators', shape: 'boolean',
    spec: T('%a ではない'),
    args: { a: { kind: 'input', mode: 'bool' } },
  });
  def({
    type: 'random', cat: 'operators', shape: 'reporter',
    spec: T('%min から %max までのランダムな数'),
    args: {
      min: { kind: 'input', mode: 'number', def: 1 },
      max: { kind: 'input', mode: 'number', def: 10 },
    },
  });
  def({
    type: 'chance', cat: 'operators', shape: 'boolean',
    spec: T('%a ％のかくりつ'),
    args: { a: { kind: 'input', mode: 'number', def: 50 } },
  });
  def({
    type: 'join', cat: 'operators', shape: 'reporter',
    spec: T('%a と %b をつなげる'),
    args: {
      a: { kind: 'input', mode: 'text', def: T('こんにちは'), long: true },
      b: { kind: 'input', mode: 'text', def: T('さん'), long: true },
    },
  });
  def({
    type: 'contains', cat: 'operators', shape: 'boolean',
    spec: T('%a に %b がふくまれる'),
    args: {
      a: { kind: 'input', mode: 'text', def: '', long: true },
      b: { kind: 'input', mode: 'text', def: '', long: true },
    },
  });
  def({
    type: 'length', cat: 'operators', shape: 'reporter',
    spec: T('%a の文字数'),
    args: { a: { kind: 'input', mode: 'text', def: '', long: true } },
  });
  def({
    type: 'round', cat: 'operators', shape: 'reporter',
    spec: T('%a を %op'),
    args: {
      a: { kind: 'input', mode: 'number', def: '' },
      op: {
        kind: 'dropdown', def: 'round',
        options: [[T('四捨五入'), 'round'], [T('切り捨て'), 'floor'], [T('切り上げ'), 'ceil'], [T('絶対値に'), 'abs']],
      },
    },
  });

  // 外部モジュール（SAORI）。ゴーストのフォルダに置いた 32bit の DLL を呼びます。
  def({
    type: 'saori', cat: 'operators', shape: 'reporter',
    spec: T('%file を %a %b でよんだ答え %value'),
    args: {
      file: { kind: 'input', mode: 'text', def: 'saori.dll', long: true },
      a: { kind: 'input', mode: 'text', def: '', long: true },
      b: { kind: 'input', mode: 'text', def: '', long: true },
      value: {
        kind: 'dropdown', def: -1,
        options: [[T('（答え）'), -1], [T('0番目の値'), 0], [T('1番目の値'), 1], [T('2番目の値'), 2]],
      },
    },
  });

  // ================================================================ 情報
  def({
    type: 'sys', cat: 'info', shape: 'reporter',
    spec: '%key',
    args: {
      key: {
        kind: 'dropdown', def: 'hour',
        options: [
          [T('いまの時'), 'hour'], [T('いまの分'), 'minute'], [T('いまの秒'), 'second'],
          [T('いまの年'), 'year'], [T('いまの月'), 'month'], [T('いまの日'), 'day'],
          [T('いまの曜日(0=日)'), 'weekday'], [T('いまの曜日(名前)'), 'weekdayname'],
          [T('いまごろ(朝/昼/夕方/夜)'), 'daypart'], [T('いまの季節'), 'season'],
          [T('起動してからの秒数'), 'uptime'], [T('起動してからの分数'), 'uptimemin'],
          [T('起動した回数'), 'boots'], [T('今回のトーク回数'), 'talks'],
          [T('前に会ってから何日ぶりか'), 'dayssince'], [T('出会ってから何日か'), 'daysmet'],
          [T('前に出したトーク'), 'lasttalk'],
          [T('ゴースト名'), 'ghostname'], [T('シェル名'), 'shellname'],
          [T('話しかけてきた相手'), 'commfrom'], [T('言われたこと'), 'commtext'],
          [T('ユーザーの呼び名'), 'username'], [T('ユーザーの誕生月'), 'birthmonth'],
          [T('ユーザーの誕生日(日)'), 'birthday'], [T('SSP の版'), 'baseware'],
          [T('落とされたファイル(1つ目)'), 'droppedfile'],
        ],
      },
    },
  });
  // セリフの中に、SSP の情報をそのまま出す（%property[…]）。SSP が表示するときに置きかえるので、
  // くらべたり計算したりはできない。それには「SSP に ◯ をたずねて…」を使う。
  def({
    type: 'property', cat: 'info', shape: 'reporter',
    spec: T('SSP の %prop （セリフの中だけ）'),
    args: { prop: { kind: 'propname', def: 'baseware.version' } },
  });
  def({
    type: 'ref', cat: 'info', shape: 'reporter',
    spec: T('イベントの情報 %index'),
    args: {
      index: {
        kind: 'dropdown', def: 0,
        options: [[T('0番目'), 0], [T('1番目'), 1], [T('2番目'), 2], [T('3番目'), 3], [T('4番目'), 4], [T('5番目'), 5],
          [T('6番目'), 6], [T('7番目'), 7]],
      },
    },
  });

  // ------------------------------------------------------------- 説明
  // ブロックにマウスをのせると出る説明。はじめての人が「何をするブロックか」と
  // 「気をつけること」をわかるように、1〜2 文で書く。key（なければ type）で引く。
  // ブロックを足したら、ここにも書く（tools/check-blocks.js が足りないものを名指しする）。
  N.BLOCK_HELP = {
    '@event': T('このイベントが起きたときに、下につなげたブロックを上から順に動かします。'),
    '@event.touch': T('マウスでさわられたときに動きます。キャラと場所（あたま・かおなど）で、反応するところをしぼれます。'),
    '@event.comm': T('ほかのゴーストや使う人に話しかけられたときに動きます。相手と言葉でしぼれます。'),
    '@event.every': T('決めた秒数ごとに、くりかえし動きます。'),
    '@talk': T('ほうっておくと、ときどき勝手にしゃべるトークです。えらばれやすさが大きいほど、よく出ます。'),
    '@function': T('名前の付いたトークです。「◯ をよぶ」「◯ 秒後に ◯ をよぶ」ブロックや、選択肢から動きます。'),
    say: T('キャラにセリフを話させます。「改行する」をえらぶと、話したあとに改行します。'),
    newline: T('バルーンの中で、指定した回数だけ改行します。'),
    click_wait: T('バルーンをクリックされるまで、つぎのセリフを待ちます。'),
    clear: T('バルーンの中の文字を消して、まっさらにします。'),
    choice: T('えらべる選択肢を出します。えらばれると、行き先のトークが動きます。'),
    choice_event: T('えらべる選択肢を出します。えらばれると、そのイベントが起き、情報は「イベントの情報 0番目」に入ります。'),
    font_style: T('このあとの文字を、太字・斜め・下線などにします。「文字の飾りをもとにもどす」でもどります。'),
    font_color: T('このあとの文字の色を変えます。'),
    font_size: T('このあとの文字の大きさを変えます。100％がふつうです。'),
    font_default: T('太字・色・大きさなど、文字の飾りをぜんぶもとにもどします。'),
    link: T('クリックできるリンクを出します。クリックされると、その URL をブラウザで開きます。'),
    communicate: T('ほかのゴーストに話しかけます。相手は「話しかけられたとき」で受けとります。'),
    raw: T('さくらスクリプトを、そのまま出します。ブロックに無いことをしたいときに使います。'),
    surface: T('キャラの表情（立ち絵の番号）を変えます。番号の絵は「ゴースト」タブで決めます。'),
    chara: T('さくら（0）・うにゅう（1）のほかに、3 人目からのキャラ（2 番から）を話させるときに使います。'),
    anim: T('「ゴースト」タブの「うごき」で作ったアニメーションを動かします。'),
    balloon: T('バルーン（ふきだし）の形を、番号で変えます。'),
    sound: T('音のファイルを 1 回鳴らします。ファイルは、書き出したゴーストのフォルダの中に置きます。'),
    bgm: T('BGM などを鳴らします。セリフを待たずに鳴り、「くりかえし鳴らす」は「鳴っている音をぜんぶ止める」まで続きます。'),
    sound_stop: T('鳴っている音を、ぜんぶ止めます。'),
    dressup: T('着せ替えの部品を付けたり、はずしたりします。部品は「ゴースト」タブの「着せ替え」で作ります。'),
    alpha: T('キャラの濃さを変えます。0％で見えなくなり、100％でふつうです。'),
    move: T('キャラを画面の決めた場所へ動かします。'),
    wait: T('指定したミリ秒だけ待ちます。1000 ミリ秒で 1 秒です。'),
    if: T('条件に合うときだけ、中のブロックを動かします。'),
    if_else: T('条件に合うときは上、合わないときは下（そうでなければ）のブロックを動かします。'),
    repeat: T('中のブロックを、決めた回数だけくりかえします。'),
    while: T('条件に合っているあいだ、中のブロックをくりかえします。'),
    random_one: T('いくつかの中から 1 つをランダムにえらんで動かします。＋ − でえらび先の数を変えられます。'),
    call: T('名前の付いたトークを動かします。動きおわると、つぎのブロックへもどります。'),
    call_group: T('同じ「まとまり」に入れたランダムトークから、えらばれやすさに合わせて 1 つ動かします。'),
    talk_interval: T('ランダムトークがしゃべる間隔を変えます。0 にすると、しゃべらなくなります。'),
    ask: T('入力欄を出して、使う人に文字を書いてもらいます。答えはこのトークのあとに届くので、同じトークの中ではまだ使えません。'),
    ask_kind: T('日付・時刻・数（スライダー）・パスワードをたずねます。答えはこのトークのあとに届くので、同じトークの中ではまだ使えません。'),
    property_get: T('SSP のいまの様子をたずねて、変数に入れます。答えはこのトークのあとに届くので、同じトークの中ではまだ使えません。'),
    later: T('決めた秒数のあとに、名前の付いたトークを動かします。'),
    raise: T('イベントを自分で起こします。そのイベントのブロックが動きます。'),
    change_ghost: T('ほかのゴーストに交代します。トークはここでおわります。'),
    open_browser: T('ブラウザで URL を開きます。'),
    saori_call: T('外部モジュール（SAORI）を、答えを待たずによびます。答えが届くと変数に入り、OnSaoriDone が起きます。'),
    update: T('ネットワーク更新をはじめます。「ゴースト」タブの「更新のありか」が空だと、何もできません。'),
    end: T('ここでトークをおわります。「もし」の中に入れると、条件に合ったときだけおわれます。'),
    close: T('ゴーストを終了します。トークはここでおわります。'),
    set: T('変数に値を入れます。前の値は消えます。'),
    change: T('変数の数を、指定しただけふやします。へらすときはマイナスの数を入れます。'),
    var: T('変数の中身です。セリフや計算の欄にはめこんで使います。'),
    arith: T('2 つの数を計算します。'),
    compare: T('2 つの値をくらべます。「もし」などの条件の欄にはめこみます。'),
    logic: T('2 つの条件を組み合わせます（かつ＝どちらも、または＝どちらか）。'),
    not: T('条件の反対です。合っていなければ「合っている」になります。'),
    random: T('決めた範囲から、ランダムな数をえらびます。'),
    chance: T('決めたかくりつで「合っている」になります。50％なら 2 回に 1 回くらいです。'),
    join: T('2 つの文字をつなげて、1 つにします。'),
    contains: T('前の文字の中に、後ろの文字が入っているかを調べます。'),
    length: T('文字の数をかぞえます。'),
    round: T('数を四捨五入・切り捨て・切り上げしたり、マイナスをとった数（絶対値）にしたりします。'),
    saori: T('外部モジュール（SAORI）をよんで、答えを使います。時間のかかるものは、その間 SSP が止まるので「答えを待たずに」のほうを使います。'),
    sys: T('時刻・日付・起動回数など、そのときの情報です。'),
    property: T('SSP の情報を、セリフの中にそのまま出します。くらべたり計算したりはできないので、それには「SSP に ◯ をたずねて…」を使います。'),
    ref: T('このイベントといっしょに届いた情報です（ダブルクリックの座標など）。番号ごとの意味は、イベントによってちがいます。'),
  };
  N.blockHelp = function (def) {
    return def ? (N.BLOCK_HELP[def.key] || N.BLOCK_HELP[def.type] || '') : '';
  };

  // ------------------------------------------------------------- palette
  N.PALETTE = {
    events: [
      { note: T('ゴーストの動きは、ここからはじまります。キャンバスにドラッグしてください。') },
      '@event', '@event.touch', '@event.every', '@event.comm', '@talk', '@function',
    ],
    talk: ['say', 'newline', 'click_wait', 'clear', 'choice', 'choice_event', 'link',
      'font_style', 'font_color', 'font_size', 'font_default', 'communicate', 'raw'],
    looks: ['surface', 'chara', 'anim', 'balloon', 'dressup', 'sound', 'bgm', 'sound_stop', 'alpha', 'move'],
    // { heading } … パレットの小見出し（ブロックが多いカテゴリを、探しやすく分ける）
    control: [
      { heading: T('流れ') }, 'wait', 'if', 'if_else', 'repeat', 'while', 'random_one', 'end',
      { heading: T('トークのよび出し') }, 'call', 'call_group', 'later', 'talk_interval', 'raise',
      { heading: T('質問') }, 'ask', 'ask_kind', 'property_get',
      { heading: T('ゴーストと SSP') }, 'update', 'open_browser', 'change_ghost', 'close', 'saori_call',
    ],
    variables: [{ button: 'add-var', label: T('＋ 変数をつくる') }, '@vars', 'set', 'change'],
    operators: ['arith#+', 'arith#-', 'arith#*', 'arith#/', 'arith#%',
      'compare#<', 'compare#=', 'compare#>', 'compare#!=',
      'logic#and', 'logic#or', 'not', 'random', 'chance',
      'join', 'contains', 'length', 'round', 'saori'],
    info: [
      { note: T('イベントの情報＝ダブルクリックの座標など、イベントごとの追加データです。') },
      'sys', 'property', 'ref',
    ],
  };

})(window.NASHI);
