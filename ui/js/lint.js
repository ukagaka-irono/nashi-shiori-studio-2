/* なしスタジオ - プロジェクトのチェック（あぶないところ探し）
 *
 * 見つけたものは { level, message, hint, script, block } の配列で返します。
 * level は 'error'（動かない・たぶん間違い）と 'warn'（気になる）の 2 段階です。
 */
'use strict';

(function (N) {

  const Lint = {};
  const T = N.I18n.T;

  // fix … チェックタブからその場で直せるとき（{ add: 'var' | 'talk', name } / { remove: 'var', name }）
  function issue(list, level, message, hint, script, block, fix) {
    list.push({ level, message, hint: hint || '', script: script || null, block: block || null, fix: fix || null });
  }

  /** スクリプトの中のブロックを、入れ子もふくめて順に見る */
  function walk(script, visit) {
    const walkStack = (stack) => {
      if (!Array.isArray(stack)) return;
      for (const b of stack) {
        if (!b || typeof b !== 'object') continue;
        visit(b);
        walkInner(b);
      }
    };
    const walkInner = (b) => {
      const d = N.getDef(b);
      if (!d) return;
      for (const s of d.subs || []) walkStack(b[s.key]);
      if (d.dynamic && Array.isArray(b[d.dynamic])) b[d.dynamic].forEach(walkStack);
      for (const name in (d.args || {})) {
        const v = b[name];
        if (v && typeof v === 'object' && v.type) { visit(v); walkInner(v); }
      }
    };
    walkStack(script.blocks);
  }

  /** あるブロックの内側（くりかえしの中など）だけを見る */
  function walkStackOnly(block, visit) {
    const d = N.getDef(block);
    if (!d) return;
    const stacks = [];
    for (const s of d.subs || []) stacks.push(block[s.key]);
    if (d.dynamic && Array.isArray(block[d.dynamic])) stacks.push(...block[d.dynamic]);
    for (const stack of stacks) {
      if (!Array.isArray(stack)) continue;
      for (const b of stack) {
        if (!b || typeof b !== 'object') continue;
        visit(b);
        walkStackOnly(b, visit);
      }
    }
  }

  /** メッセージ用のかたまり名。すでに「」が付いているものは足さない */
  function nameOf(script) {
    const t = N.Model.scriptTitle(script);
    // かっこは言語ごとにちがう（「」・“”・『』…）ので、いまの言語のかっこで見る
    const open = T('「{name}」', { name: '' }).charAt(0);
    return open && t.charAt(0) === open ? t : T('「{name}」', { name: t });
  }

  function isEmptyText(v) {
    if (v == null) return true;
    if (typeof v === 'object') return false;      // 変数などが入っている
    return String(v).trim() === '';
  }

  Lint.run = function (project) {
    const out = [];
    if (!project) return out;

    const varNames = (project.variables || []).map((v) => v.name);
    const groups = (project.scripts || [])
      .filter((s) => s.kind === 'talk' && !s.disabled && String(s.group || '').trim())
      .map((s) => String(s.group).trim());
    const callable = (project.scripts || [])
      .filter((s) => s.kind === 'function' || s.kind === 'talk')
      .map((s) => s.name);
    const talkCount = (project.scripts || []).filter((s) => s.kind === 'talk').length;

    // ---- 名前のかぶり
    const seen = {};
    for (const s of project.scripts || []) {
      if (s.kind !== 'function' && s.kind !== 'talk') continue;
      const name = s.name || '';
      if (seen[name]) {
        issue(out, 'error', T('「{name}」という名前が 2 つあります', { name }),
          T('よぶときにどちらか一方しか使われません。名前を変えてください。'), s);
      }
      seen[name] = true;
    }

    // ---- スクリプトごと
    for (const s of project.scripts || []) {
      if (s.kind === 'note') continue;     // 付箋はゴーストの動きに入らない
      const title = nameOf(s);
      const blocks = Array.isArray(s.blocks) ? s.blocks : [];

      if (s.kind !== 'event' && s.kind !== 'talk' && s.kind !== 'function') {
        issue(out, 'warn', T('どこにもつながっていないブロックがあります'),
          T('帽子ブロック（◯◯のとき など）につなげないと動きません。'), s);
      } else if (!blocks.length) {
        issue(out, 'warn', T('{title}の中身がからっぽです', { title }),
          T('ブロックをつなげるか、いらなければ削除してください。'), s);
      }

      if (s.kind === 'event' && !String(s.event || '').trim()) {
        issue(out, 'error', T('イベント名が空のかたまりがあります'),
          T('イベントをえらぶか、名前を直接入力してください。'), s);
      }
      if ((s.kind === 'talk' || s.kind === 'function') && !String(s.name || '').trim()) {
        issue(out, 'error', T('名前のないトークがあります'),
          T('名前をつけないと、よび出せません。'), s);
      }
      if (s.kind === 'talk' && Number(s.weight) < 0) {
        issue(out, 'warn', T('{title}のえらばれやすさがマイナスです', { title }),
          T('0 として扱われるので、このトークは出ません。'), s);
      }

      // ---- 定常ループ（ずっとくりかえす）の重さ
      if (s.kind === 'event' && s.event === 'OnSecondChange') {
        const every = Math.max(1, Number(s.everySec) || 1);
        let count = 0;
        let hasLoop = false;
        walk(s, (b) => {
          count++;
          if (b.type === 'repeat' || b.type === 'while') hasLoop = true;
        });
        // 帽子のすぐ下にセリフがある＝条件なしで毎回しゃべる
        const speaksAlways = blocks.some(
          (b) => b && (b.type === 'say' || b.type === 'raw' || b.type === 'call' || b.type === 'choice')
        );
        if (every <= 1 && speaksAlways) {
          issue(out, 'warn', T('{title}は毎秒しゃべることになります', { title }),
            T('帽子ブロックの「◯秒ごと」を大きくするか、「もし」で条件をつけてください。'), s);
        } else if (every <= 1 && (hasLoop || count >= 10)) {
          issue(out, 'warn', T('{title}は毎秒これだけ動くので、重くなりがちです', { title }),
            T('「◯秒ごと」を 5 秒くらいにすると、体感は変わらずに軽くなります。'), s);
        }
      }

      walk(s, (b) => {
        // くりかえしの中で細かく待つと、長いスクリプトになって重くなる
        if (b.type === 'repeat' || b.type === 'while') {
          let tiny = null;
          walkStackOnly(b, (inner) => {
            if (inner.type === 'wait' && typeof inner.ms === 'number' && inner.ms > 0 && inner.ms <= 20) {
              tiny = inner;
            }
          });
          if (tiny) {
            issue(out, 'warn', T('{title}の「くりかえし」の中で、{ms} ミリ秒だけ待っています', { title, ms: tiny.ms }),
              T('待ちの数だけスクリプトが長くなります。回数を減らすか、待ちを長くしてください。'), s, tiny);
          }
        }
        if (!N.getDef(b)) {
          issue(out, 'error', T('{title}に、知らないブロック（{type}）が入っています', { title, type: b.type }),
            T('新しい版のなしスタジオ 2 で作られたファイルかもしれません。'), s, b);
          return;
        }
        // 数の欄に、数でない文字が書いてある（栞はそこを決まった値として動かすので、気づきにくい）
        const def = N.getDef(b);
        for (const arg in def.args || {}) {
          const v = b[arg];
          if (def.args[arg].mode === 'number' && typeof v === 'string' && v.trim() !== '' && isNaN(Number(v))) {
            issue(out, 'warn', T('{title}の数の欄に「{value}」と書いてあります', { title, value: v }),
              T('数でないと、ちがう値として動きます。数だけを書くか、変数のブロックをはめこんでください。'), s, b);
          }
        }
        switch (b.type) {
          case 'say':
            if (isEmptyText(b.text)) {
              issue(out, 'warn', T('{title}に、なにも言わないセリフがあります', { title }),
                T('文章を入れるか、ブロックを削除してください。'), s, b);
            }
            break;
          case 'raw':
            if (isEmptyText(b.text)) {
              issue(out, 'warn', T('{title}に、からっぽのさくらスクリプトがあります', { title }), '', s, b);
            }
            break;
          case 'communicate':
            if (isEmptyText(b.to)) {
              issue(out, 'error', T('{title}に、話しかける相手が空のブロックがあります', { title }),
                T('相手のゴースト名（本体の名前）を入れてください。「話しかけてきた相手」ブロックを入れると、言われた相手に返せます。'), s, b);
            }
            if (isEmptyText(b.text)) {
              issue(out, 'warn', T('{title}に、なにも言わずに話しかけるブロックがあります', { title }),
                T('文章がないと、相手には届きません。'), s, b);
            }
            break;
          case 'ask':
            if (isEmptyText(b.into)) {
              issue(out, 'error', T('{title}に、答えの入れ先が空の「たずねる」ブロックがあります', { title }),
                T('入れる変数を決めてください。決めないと、たずねても答えを使えません。'), s, b);
            } else if (varNames.indexOf(b.into) < 0) {
              issue(out, 'error', T('変数「{name}」がありません（{title}）', { name: b.into, title }),
                T('下のボタンで作るか、別の変数にえらび直してください。'), s, b, { add: 'var', name: b.into });
            } else if (/[,[\]]/.test(b.into)) {
              issue(out, 'error', T('変数「{name}」の名前は「たずねる」には使えません', { name: b.into }),
                T('カンマや角かっこが入っていると、SSP への命令が壊れます。名前を変えてください。'), s, b);
            }
            break;
          case 'ask_kind':
            if (isEmptyText(b.into)) {
              issue(out, 'error', T('{title}に、答えの入れ先が空の「たずねる」ブロックがあります', { title }),
                T('入れる変数を決めてください。決めないと、たずねても答えを使えません。'), s, b);
            } else if (varNames.indexOf(b.into) < 0) {
              issue(out, 'error', T('変数「{name}」がありません（{title}）', { name: b.into, title }),
                T('下のボタンで作るか、別の変数にえらび直してください。'), s, b, { add: 'var', name: b.into });
            }
            break;
          case 'dressup': {
            const parts = ((project.dressup || {}).parts || []);
            if (isEmptyText(b.part)) {
              issue(out, 'error', T('{title}の「着せ替え」で、部品がえらばれていません', { title }),
                T('「ゴースト」タブの「着せ替え」で部品を作ってから、えらんでください。'), s, b);
            } else if (!parts.some((p) => p.who === (b.who === 1 ? 1 : 0) && p.category === b.category && p.name === b.part)) {
              issue(out, 'error', T('着せ替えの部品「{category}／{part}」がありません（{title}）', { category: b.category || '', part: b.part, title }),
                T('部品の名前やカテゴリを変えたときは、ブロックでもえらび直してください。'), s, b);
            }
            break;
          }
          case 'property_get':
            if (isEmptyText(b.prop)) {
              issue(out, 'error', T('{title}に、たずねる中身が空の「SSP にたずねる」ブロックがあります', { title }),
                T('一覧からえらぶか、プロパティの名前を書いてください。'), s, b);
            }
            if (isEmptyText(b.into)) {
              issue(out, 'error', T('{title}に、答えの入れ先が空の「SSP にたずねる」ブロックがあります', { title }),
                T('入れる変数を決めてください。決めないと、たずねても答えを使えません。'), s, b);
            } else if (varNames.indexOf(b.into) < 0) {
              issue(out, 'error', T('変数「{name}」がありません（{title}）', { name: b.into, title }),
                T('下のボタンで作るか、別の変数にえらび直してください。'), s, b, { add: 'var', name: b.into });
            }
            break;
          case 'choice_event':
            if (isEmptyText(b.event)) {
              issue(out, 'error', T('{title}の選択肢に、起こすイベントがありません', { title }),
                T('えらんでも何も起きません。OnAnswer のようなイベント名を入れてください。'), s, b);
            } else if (typeof b.event === 'string' && !project.scripts.some((x) => x.kind === 'event'
              && x.event === (/^On/.test(b.event.trim()) ? b.event.trim() : 'On' + b.event.trim()))) {
              issue(out, 'warn', T('選択肢で起こす「{event}」のブロックがありません（{title}）', { event: b.event, title }),
                T('「その他（自分で書く）」で、同じ名前のイベントのブロックを作ってください。'), s, b);
            }
            if (isEmptyText(b.label)) {
              issue(out, 'warn', T('{title}に、文字のない選択肢があります', { title }), '', s, b);
            }
            break;
          case 'anim': {
            // 番号をそのまま書いたときだけ見る（変数などをはめこんだときは、動かすまでわからない）
            const id = typeof b.id === 'number' ? b.id : (typeof b.id === 'string' && b.id.trim() !== '' ? Number(b.id) : NaN);
            if (Number.isFinite(id) && !(project.animations || []).some((a) => Number(a.id) === id)) {
              issue(out, 'warn', T('「うごき {id}」がありません（{title}）', { id, title }),
                T('ゴーストタブの「うごき」で作るか、▾ でえらび直してください。手で直したシェルにあるうごきなら、そのままで動きます。'), s, b);
            }
            break;
          }
          case 'sound':
          case 'bgm':
            if (isEmptyText(b.file)) {
              issue(out, 'warn', T('{title}に、ファイル名が空の「音を鳴らす」ブロックがあります', { title }),
                T('ゴーストのフォルダに置いた音のファイル名を入れてください。'), s, b);
            }
            break;
          case 'call_group':
            if (isEmptyText(b.group)) {
              issue(out, 'error', T('{title}の「どれかよぶ」で、まとまりの名前が空です', { title }),
                T('ランダムトークの帽子ブロックで付けた「まとまり」の名前を入れてください。'), s, b);
            } else if (typeof b.group === 'string' && groups.indexOf(b.group.trim()) < 0) {
              issue(out, 'error', T('「{group}」というまとまりのトークがありません（{title}）', { group: b.group, title }),
                T('ランダムトークの帽子ブロックの「まとまり」に、同じ名前を入れてください。'), s, b);
            }
            break;
          case 'later':
            if (isEmptyText(b.name)) {
              issue(out, 'error', T('{title}の「◯秒後によぶ」で、行き先がえらばれていません', { title }), '', s, b);
            } else if (typeof b.name === 'string' && callable.indexOf(b.name) < 0) {
              issue(out, 'error', T('「{name}」というトークがありません（{title}）', { name: b.name, title }),
                T('下のボタンでトークを作るか、行き先をえらび直してください。'), s, b, { add: 'talk', name: b.name });
            }
            break;
          case 'raise':
            if (isEmptyText(b.event)) {
              issue(out, 'warn', T('{title}に、イベント名が空の「自分で起こす」ブロックがあります', { title }),
                T('OnBoot のようなイベント名を入れてください。'), s, b);
            }
            break;
          case 'open_browser':
            if (isEmptyText(b.url)) {
              issue(out, 'warn', T('{title}に、ひらく先が空のブロックがあります', { title }), '', s, b);
            }
            break;
          case 'change_ghost':
            if (isEmptyText(b.name)) {
              issue(out, 'warn', T('{title}に、交代する相手が空のブロックがあります', { title }),
                T('ゴースト名か random を入れてください。'), s, b);
            }
            break;
          case 'saori_call':
            if (isEmptyText(b.file)) {
              issue(out, 'error', T('{title}に、よぶファイルが空の SAORI ブロックがあります', { title }),
                T('ゴーストのフォルダに置いた DLL の名前を入れてください。'), s, b);
            }
            if (isEmptyText(b.into)) {
              issue(out, 'warn', T('{title}に、答えの入れ先が空の SAORI ブロックがあります', { title }),
                T('答えを入れる変数を決めておかないと、届いた答えを使えません。（「SAORI の答えがとどいたとき」でも受け取れます）'), s, b);
            } else if (varNames.indexOf(b.into) < 0) {
              issue(out, 'error', T('変数「{name}」がありません（{title}）', { name: b.into, title }),
                T('下のボタンで作るか、別の変数にえらび直してください。'), s, b, { add: 'var', name: b.into });
            }
            break;
          case 'update':
            // 「更新のありか」が無いと、SSP は更新しようがない
            if (isEmptyText((project.meta || {}).homeUrl)) {
              issue(out, 'warn', T('{title}に、ネットワーク更新のブロックがあります', { title }),
                T('ゴーストの設定の「更新のありか」が空です。入れておかないと、SSP は更新できません。'), s, b);
            }
            break;
          case 'var': case 'set': case 'change':
            if (isEmptyText(b.name)) {
              issue(out, 'error', T('{title}に、変数をえらんでいないブロックがあります', { title }),
                T('変数タブで変数を作ってから、えらんでください。'), s, b);
            } else if (varNames.indexOf(b.name) < 0) {
              issue(out, 'error', T('変数「{name}」がありません（{title}）', { name: b.name, title }),
                T('下のボタンで作るか、別の変数にえらび直してください。'), s, b, { add: 'var', name: b.name });
            }
            break;
          case 'call':
            if (isEmptyText(b.name)) {
              issue(out, 'error', T('{title}の「よぶ」ブロックで、行き先がえらばれていません', { title }), '', s, b);
            } else if (callable.indexOf(b.name) < 0) {
              issue(out, 'error', T('「{name}」というトークがありません（{title}）', { name: b.name, title }),
                T('下のボタンでトークを作るか、行き先をえらび直してください。'), s, b, { add: 'talk', name: b.name });
            }
            break;
          case 'choice':
            if (isEmptyText(b.target)) {
              issue(out, 'error', T('{title}の選択肢に、行き先がありません', { title }),
                T('えらんでも何も起きません。行き先のトークをえらんでください。'), s, b);
            } else if (callable.indexOf(b.target) < 0) {
              issue(out, 'error', T('選択肢の行き先「{name}」がありません（{title}）', { name: b.target, title }),
                T('下のボタンでトークを作るか、行き先をえらび直してください。'), s, b, { add: 'talk', name: b.target });
            }
            if (isEmptyText(b.label)) {
              issue(out, 'warn', T('{title}に、文字のない選択肢があります', { title }), '', s, b);
            }
            break;
          case 'link':
            if (isEmptyText(b.url) || String(b.url).trim() === 'https://') {
              issue(out, 'warn', T('{title}のリンクに、URL が入っていません', { title }), '', s, b);
            }
            break;
          case 'wait':
            if (Number(b.ms) > 60000) {
              issue(out, 'warn', T('{title}に、1 分より長く待つブロックがあります', { title }),
                T('長すぎるとゴーストが固まったように見えます。'), s, b);
            }
            break;
          default:
            break;
        }
      });
    }

    // ---- どこからもよばれない「◯がよばれたとき」
    // （ランダムトークはひとりでに動くので見ない。よぶのは「よぶ」「◯秒後によぶ」「選択肢」の行き先）
    const called = {};
    let rawText = '';      // さくらスクリプトをそのまま書いたところ（\q[…,名前] などで、よんでいるかもしれない）
    for (const s of project.scripts || []) {
      walk(s, (b) => {
        const d = N.getDef(b);
        for (const arg in (d && d.args) || {}) {
          if (d.args[arg].kind === 'funcname' && b[arg]) called[b[arg]] = true;
        }
        if (b.type === 'raw' && typeof b.text === 'string') rawText += '\n' + b.text;
      });
    }
    for (const s of project.scripts || []) {
      // さくらスクリプトでは、[ , ] で区切られた 1 つの引数として名前が書いてあるときだけ「よんでいる」とみる
      // （名前が「あ」のように短いと、ほかの文字に入っているだけで見のがしてしまうので）
      const asArg = new RegExp('[\\[,]' + String(s.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\],]');
      if (s.kind === 'function' && !s.disabled && String(s.name || '').trim() && !called[s.name] &&
          !asArg.test(rawText)) {
        issue(out, 'warn', T('{title}は、どこからもよばれていません', { title: nameOf(s) }),
          T('「◯ をよぶ」「◯ 秒後に ◯ をよぶ」ブロックや、選択肢の行き先にするか、いらなければ削除してください。'), s);
      }
    }

    // ---- 設定まわり
    const st = project.settings || {};
    if (st.randomTalkEnabled !== false) {
      if (!talkCount) {
        issue(out, 'warn', T('自動でしゃべる設定なのに、ランダムトークが 1 つもありません'),
          T('イベントの「ランダムトーク」をキャンバスに置いてください。'));
      } else if (Number(st.randomTalkInterval) <= 0) {
        issue(out, 'warn', T('しゃべる間隔が 0 秒なので、自動ではしゃべりません'),
          T('ゴーストタブで秒数を入れてください。'));
      }
    }

    // ---- 使われていない変数
    const used = {};
    for (const s of project.scripts || []) {
      walk(s, (b) => {
        // 「変数名」の欄（入れる・変える・中身・たずねて入れる先 など）を、どのブロックでも同じに数える
        const d = N.getDef(b);
        for (const arg in (d && d.args) || {}) {
          if (d.args[arg].kind === 'varname' && b[arg]) used[b[arg]] = true;
        }
      });
    }
    for (const name of varNames) {
      if (!used[name]) {
        issue(out, 'warn', T('変数「{name}」はどこでも使われていません', { name }),
          T('いらなければ、下のボタンか変数タブで削除できます。'), null, null, { remove: 'var', name });
      }
    }

    // エラーを先に、あとは見つけた順
    out.sort((a, b) => (a.level === b.level ? 0 : (a.level === 'error' ? -1 : 1)));
    return out;
  };

  Lint.countErrors = function (list) {
    return list.filter((x) => x.level === 'error').length;
  };

  N.Lint = Lint;

})(window.NASHI);
