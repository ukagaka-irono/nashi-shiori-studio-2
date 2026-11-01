/* なしスタジオ - 画面のことば（多言語）
 *
 * 画面のことばは、日本語がもとです。コードには日本語のまま書き、表示するところで T() に通します。
 *
 *     T('保存しました')                       → 'Saved'（英語のとき）
 *     T('「{name}」を削除しました', { name })  → '{name}' の所に値をはめる
 *
 * ほかの言語は ui/i18n/<言語>.js の表（日本語 → その言語）で引きます。表に無いものは日本語のまま出ます。
 * 書き忘れ・訳し忘れは tools/check-i18n.js が見つけます（.\build.ps1 -Test でも走ります）。
 *
 * 言語は、画面を読みこむ最初に 1 回だけ決めます（ほかのファイルは、読みこむときに T() を呼んでよい）。
 * 切りかえるときは、えらんだ言語をおぼえて、画面を読みなおします（App.setLanguage）。
 *
 * index.html のことばは、読みこみの最後に applyDom() が表で置きかえます。
 *   ・ふつうの文字と title / placeholder / aria-label … そのまま 1 つずつ引く
 *   ・data-i18n="html" を付けた要素 … 中身の HTML をまとめて 1 つとして引く
 *     （「左の <i>イベント</i> から…」のように、ことばの順が言語で変わるもの）
 */
'use strict';
window.NASHI = window.NASHI || {};

(function (N) {
  // 言語ごとの表。ui/i18n/<言語>.js が N.I18N_TABLES['en'] = { … } のように入れる
  N.I18N_TABLES = N.I18N_TABLES || {};

  // えらべる言語（コードと、その言語で書いた名前）。ssp-i18n と同じ 4 つに、もとの日本語
  const LANGS = [
    ['ja', '日本語'],          // i18n-ignore（言語の名前は、その言語のまま出す）
    ['en', 'English'],
    ['zh-CN', '简体中文'],     // i18n-ignore
    ['zh-TW', '繁體中文'],     // i18n-ignore
    ['ko', '한국어'],
  ];
  const STORE_KEY = 'nashi-studio-2.lang';

  // Windows（WebView2）の言語から、いちばん近いものをえらぶ
  function detect() {
    if (typeof navigator === 'undefined') return 'ja';
    const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'ja'];
    for (const raw of list) {
      const l = String(raw).toLowerCase();
      if (l.startsWith('ja')) return 'ja';
      if (l.startsWith('ko')) return 'ko';
      if (l.startsWith('zh')) {
        return /^zh-(tw|hk|mo|hant)/.test(l) ? 'zh-TW' : 'zh-CN';
      }
      if (l.startsWith('en')) return 'en';
    }
    return 'en';     // どれでもなければ英語（日本語より読める人が多い）
  }

  function stored() {
    try { return localStorage.getItem(STORE_KEY) || ''; } catch { return ''; }
  }

  // えらべるのは、もとの日本語と、表のある言語だけ（表が無い言語は英語にする）
  const known = (code) => LANGS.some(([c]) => c === code) && (code === 'ja' || !!N.I18N_TABLES[code]);
  // テスト（node）では window.NASHI_LANG で決める。日本語のことばのまま確かめるため
  const forced = typeof window !== 'undefined' ? window.NASHI_LANG : '';
  const detected = detect();
  const lang = known(forced) ? forced : (known(stored()) ? stored() : (known(detected) ? detected : 'en'));
  const table = lang === 'ja' ? null : (N.I18N_TABLES[lang] || null);

  function fill(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
  }

  // 日本語のことばを、いまの言語にする。vars があれば {名前} にはめる
  function T(ja, vars) {
    const s = (table && Object.prototype.hasOwnProperty.call(table, ja)) ? table[ja] : ja;
    return fill(s, vars);
  }

  // HTML の中身を表で引くときの形（空白をまとめる。check-i18n.js も同じ形で取り出す）
  function htmlKey(html) {
    return String(html).replace(/\s+/g, ' ').trim();
  }

  const JA = /[　-ヿ㐀-鿿＀-￯]/;
  const ATTRS = ['title', 'placeholder', 'aria-label'];

  // index.html に書いてあることばを、表で置きかえる
  function applyDom(root) {
    document.documentElement.lang = lang;
    if (!table) return;
    const scope = root || document.body;
    scope.querySelectorAll('[data-i18n="html"]').forEach((el) => {
      const key = htmlKey(el.innerHTML);
      if (Object.prototype.hasOwnProperty.call(table, key)) el.innerHTML = table[key];
    });
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // まとめて引いた要素の中と、スクリプト・スタイルの中は見ない
        const p = node.parentElement;
        if (!p || p.closest('[data-i18n="html"], script, style')) return NodeFilter.FILTER_REJECT;
        return JA.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const v = node.nodeValue;
      const key = htmlKey(v);          // 何行かにわたる文も、空白をまとめて 1 つとして引く
      if (!Object.prototype.hasOwnProperty.call(table, key)) continue;
      const lead = v.match(/^\s*/)[0];
      const trail = v.match(/\s*$/)[0];
      node.nodeValue = lead + table[key] + trail;
    }
    scope.querySelectorAll('*').forEach((el) => {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && JA.test(v) && Object.prototype.hasOwnProperty.call(table, v)) el.setAttribute(a, table[v]);
      }
    });
    if (JA.test(document.title) && Object.prototype.hasOwnProperty.call(table, document.title)) {
      document.title = table[document.title];
    }
  }

  // exe（C++）の側が作って返すことば（保存・書き出し・SSP とのやりとりの失敗など）。日本語のまま届くので、
  // この形と照らし合わせて訳す。{0} {1} … には、ファイル名などがそのまま入る（日本語なら、それもまた訳す）。
  // C++ の側でことばを足したり変えたりしたら、ここも直す（tools/check-i18n.js が食いちがいを見つけます）。
  const NATIVE = [
    '画像が読めません',                                        // i18n-native
    'プロジェクトが見つかりません',                            // i18n-native
    'JSON が壊れています',                                     // i18n-native
    '名前がありません',                                        // i18n-native
    '空いている名前が見つかりません',                          // i18n-native
    '保存できませんでした',                                    // i18n-native
    'プロジェクトがありません',                                // i18n-native
    '書き出しに失敗しました',                                  // i18n-native
    'パスがありません',                                        // i18n-native
    '読み込めませんでした',                                    // i18n-native
    'JSON を読めませんでした: {0}',                            // i18n-native
    '見つかりません',                                          // i18n-native
    'ssp.exe が見つかりません。SSP の場所を指定してください。', // i18n-native
    'SSP が見つかりません。SSP の場所を指定してください。',    // i18n-native
    'スクリプトがありません',                                  // i18n-native
    'イベント名がありません',                                  // i18n-native
    '話しかける内容がありません',                              // i18n-native
    '「{0}」には、別の栞で動くゴーストがすでに入っています。', // i18n-native
    'フォルダを作れませんでした',                              // i18n-native
    '書き込みに失敗しました: {0}',                             // i18n-native
    '.nar を書き込めませんでした',                             // i18n-native
    'そのかたまりが見つかりません: {0}',                       // i18n-native
    'ネットワーク機能を初期化できませんでした',                // i18n-native
    'SSP につながりません（SSP が起動しているか、SSTP を受け付ける設定かを確認してください）', // i18n-native
    'SSP へ送信できませんでした',                              // i18n-native
    'SSP から応答がありませんでした',                          // i18n-native
    'SSP が受け付けませんでした: {0}',                         // i18n-native
    // JSON が読めないときの場所と、わけ（shiori/src/json.cpp）
    '{0} 行目 {1} 文字目: {2}',                                // i18n-native
    '\\u のあとの 16 進の数が、とちゅうで切れています',        // i18n-native
    '\\u のあとに、16 進の数でない文字があります',             // i18n-native
    '名前（"…"）が来るはずのところに、ちがうものがあります', // i18n-native
    '\\ のあとに、使えない文字があります',                     // i18n-native
    '" で始めた文字が、" で閉じられないまま終わっています',    // i18n-native
    '入れ子が深すぎます',                                      // i18n-native
    'とちゅうで終わっています',                                // i18n-native
    '「:」が来るはずのところに、ちがうものがあります',         // i18n-native
    '「,」か「}」が来るはずのところに、ちがうものがあります（「,」の書きわすれ？）', // i18n-native
    '「,」か「]」が来るはずのところに、ちがうものがあります（「,」の書きわすれ？）', // i18n-native
    'ここには置けない文字があります',                          // i18n-native
    'ghost.json の中身が { … } のかたちではありません',        // i18n-native
    'ghost.json が見つかりません',                             // i18n-native
  ];
  const nativeRe = NATIVE.map((tpl) => {
    const holes = [];
    const src = tpl.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&').replace(/\\\{(\d)\\\}/g, (m, d) => {
      holes.push(d);
      return '([\\s\\S]*?)';
    });
    return { tpl, holes, re: new RegExp('^' + src + '$') };
  });

  // exe から届いた日本語の文を、いまの言語にする（知らない文は、そのまま）
  function native(msg, depth) {
    const s = String(msg == null ? '' : msg);
    if (!table || !JA.test(s) || (depth || 0) > 3) return s;
    for (const { tpl, holes, re } of nativeRe) {
      const m = s.match(re);
      if (!m) continue;
      const vars = {};
      holes.forEach((h, k) => { vars[h] = native(m[k + 1], (depth || 0) + 1); });
      return T(tpl, vars);
    }
    return s;
  }

  // えらんだ言語をおぼえる（画面の読みなおしは呼ぶ側で）
  function remember(code) {
    if (!known(code)) return false;
    try { localStorage.setItem(STORE_KEY, code); } catch { return false; }
    return true;
  }

  N.I18n = {
    T, applyDom, remember, htmlKey, native,
    nativeTemplates: NATIVE,
    get lang() { return lang; },
    languages: LANGS.filter(([code]) => known(code)).map(([code, name]) => ({ code, name })),
  };
})(window.NASHI);
