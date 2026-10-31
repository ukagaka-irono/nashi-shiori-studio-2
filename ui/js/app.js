/* なしスタジオ - 画面全体の組み立て */
'use strict';

(function (N) {

  const Model = N.Model;
  const Render = N.Render;
  const Player = N.Player;
  const $ = (sel) => document.querySelector(sel);
  N.$ = $;   // あとから読みこむ画面ファイルも使います

  const App = {
    state: null,
    projectName: '',
    zoom: 1,
    category: 'events',
    sessionVars: {},
    clipboard: null,          // コピーしたブロック（Ctrl+C / Ctrl+V）
    playToken: 0,
    renderQueued: false,
  };
  N.App = App;

  // ------------------------------------------------------------------ 通知
  let toastTimer = null;
  App.toast = function (msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    // うまくいかなかった知らせは、読みおわる前に消えないよう長めに出す
    toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 6000 : 2600);
  };

  async function api(path, options) {
    const opt = Object.assign({ headers: {} }, options || {});
    opt.headers['X-Nashi'] = '1';
    if (opt.body && typeof opt.body !== 'string') {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(opt.body);
    }
    const res = await fetch(path, opt);
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(data.error || ('通信エラー (' + res.status + ')'));
      err.status = res.status;
      err.data = data;                 // 呼んだ側が、くわしい中身（foreign など）を見られるように
      throw err;
    }
    return data;
  }

  // ---------------------------------------------------------------- 再描画
  function scheduleRender() {
    if (App.renderQueued) return;
    App.renderQueued = true;
    requestAnimationFrame(() => {
      App.renderQueued = false;
      renderAll();
    });
  }

  // チェックタブ（プロジェクト全体を点検する）と、さがすタブは、ブロックを動かすたびに
  // 走らせると重いので、手が止まったときにまとめて 1 回だけ描きなおす（遅くても 0.3 秒後）。
  function scheduleSidePanels() {
    if (App.sidePanelsQueued) return;
    App.sidePanelsQueued = true;
    const run = () => {
      App.sidePanelsQueued = false;
      N.Search.renderCheck();
      N.Search.renderSearch();
    };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 300 });
    else setTimeout(run, 50);
  }

  /**
   * キャンバスの中で打っていた欄を覚えておく。欄を書きおえると描き直しになり、
   * Tab で移った先の欄も作り直されるので、描き直したあとに同じ欄へもどす。
   */
  function rememberCanvasFocus(canvas) {
    const el = document.activeElement;
    if (!el || !canvas.contains(el) || !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) return null;
    const all = [...canvas.querySelectorAll('input, select, textarea, button')];
    const p = el.parentNode;
    return {
      index: all.indexOf(el), count: all.length,
      owner: p && p._slotOwner, arg: p && p._slotArg,
      start: el.selectionStart, end: el.selectionEnd,
    };
  }
  function restoreCanvasFocus(canvas, f) {
    if (!f) return;
    const all = [...canvas.querySelectorAll('input, select, textarea, button')];
    let el = null;
    // 入力スロットは、持ち主のブロックと引数で探す（ブロックが増えたり減ったりしても当たる）
    if (f.owner) el = all.find((e) => e.parentNode._slotOwner === f.owner && e.parentNode._slotArg === f.arg);
    else if (all.length === f.count) el = all[f.index];
    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof f.start === 'number' && el.setSelectionRange) {
      try { el.setSelectionRange(f.start, f.end); } catch { /* 文字の欄ではない */ }
    }
  }

  function renderAll() {
    const project = Model.project;
    const focus = rememberCanvasFocus($('#canvas'));
    Render.renderWorkspace($('#canvas'), project);
    restoreCanvasFocus($('#canvas'), focus);
    N.Drag.reselect($('#canvas'));
    Render.renderPalette($('#palette-blocks'), App.category, project, $('#palette-search').value);
    $('#canvas-hint').style.display = project.scripts.length ? 'none' : '';
    renderVarList();
    renderRunTargets();
    scheduleSidePanels();
    syncMetaFields();
    $('#btn-undo').disabled = !Model.undoStack.length;
    $('#btn-redo').disabled = !Model.redoStack.length;
    updateTitle();
  }

  function updateTitle() {
    document.title = (Model.dirty ? '● ' : '') +
      (Model.project.meta.name || 'なしゴースト') + ' - なしスタジオ 2';
  }

  function switchTab(name) {
    for (const t of document.querySelectorAll('.side-tab')) {
      t.classList.toggle('is-active', t.dataset.tab === name);
    }
    for (const p of document.querySelectorAll('.side-panel')) {
      p.classList.toggle('is-active', p.dataset.panel === name);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // 入力欄に打っている最中に呼ばれる。ここで「保存していない」にしておくと、
  // 欄から離れる前に閉じたり自動保存が走ったりしても、打ったものが残る。
  App.onLiveEdit = function () {
    Model.dirty = true;
    updateTitle();
  };

  // ------------------------------------------------------------- パレット
  function renderCategories() {
    const list = $('#cat-list');
    list.textContent = '';
    for (const cat of N.CATEGORIES) {
      const b = Render.el('button', 'cat-btn' + (cat.id === App.category ? ' is-active' : ''));
      const dot = Render.el('span', 'cat-dot');
      dot.style.background = cat.color;
      b.appendChild(dot);
      b.appendChild(Render.el('span', null, cat.name));
      b.addEventListener('click', () => {
        App.category = cat.id;
        $('#palette-search').value = '';         // カテゴリをえらんだら、さがすのはやめる
        renderCategories();
        Render.renderPalette($('#palette-blocks'), App.category, Model.project);
      });
      list.appendChild(b);
    }
    const help = $('#help-cats');
    if (help && !help.childElementCount) {
      for (const cat of N.CATEGORIES) {
        const row = Render.div('help-cat');
        const i = Render.el('i');
        i.style.background = cat.color;
        row.appendChild(i);
        row.appendChild(Render.el('span', null, cat.name));
        help.appendChild(row);
      }
    }
  }

  // --------------------------------------------------------------- 変数UI
  function renderVarList() {
    const list = $('#var-list');
    list.textContent = '';
    if (!Model.project.variables.length) {
      list.appendChild(Render.div('hint', 'まだ変数がありません。'));
      return;
    }
    for (const v of Model.project.variables) {
      const row = Render.div('var-item');
      row.appendChild(Render.div('dot'));

      const name = Render.el('input', 'vname');
      name.value = v.name;
      let before = v.name;
      name.addEventListener('focus', () => { before = name.value; });
      name.addEventListener('change', () => {
        const ok = Model.act(() => Model.renameVariable(before, name.value.trim()));
        if (!ok) { name.value = before; App.toast('その名前は使えません', true); }
      });
      row.appendChild(name);

      const val = Render.el('input', 'vval');
      val.value = v.value;
      val.title = 'はじめの値';
      val.addEventListener('change', () => {
        Model.act(() => {
          v.value = val.value !== '' && !isNaN(Number(val.value)) ? Number(val.value) : val.value;
        });
      });
      row.appendChild(val);

      const del = Render.el('button', 'del', '✕');
      del.title = '削除';
      del.addEventListener('click', () => {
        // 使っているブロックがあれば、その数も見せる（消すと、そのブロックはチェックタブで ⛔ になる）
        const uses = Model.countVariableUses(v.name);
        const msg = uses
          ? `変数「${v.name}」は ${uses} か所で使っています。削除すると、そこはうまく動きません。削除しますか？`
          : `変数「${v.name}」を削除しますか？`;
        if (!confirm(msg)) return;
        Model.act(() => Model.removeVariable(v.name));
      });
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  App.promptNewVariable = function () {
    const name = prompt('あたらしい変数の名前は？', '好感度');
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    let created = null;
    Model.act(() => { created = Model.addVariable(trimmed, 0); });
    if (!created) { App.toast('その名前の変数はもうあります', true); return null; }
    App.toast(`変数「${trimmed}」を作りました`);
    return trimmed;
  };

  App.promptNewFunction = function () {
    const name = prompt('あたらしいトークの名前は？', 'あたらしいトーク');
    if (!name || !name.trim()) return null;
    const trimmed = name.trim();
    if (Model.functionNames().includes(trimmed)) {
      App.toast('その名前はもう使われています', true);
      return null;
    }
    const at = viewCenter();
    Model.act(() => Model.addScript('function', { name: trimmed, x: at.x, y: at.y }));
    App.toast(`「${trimmed}」を作りました。ブロックをつなげてください`);
    return trimmed;
  };

  /** チェックタブから「トーク『◯』を作る」。見えているあたりに置く */
  App.createFunctionNamed = function (name) {
    const at = viewCenter();
    Model.act(() => Model.addScript('function', { name, x: at.x, y: at.y }));
    App.toast(`「${name}」を作りました。ブロックをつなげてください`);
  };

  /** 付箋（メモ）を置く。at が無ければ、見えているあたり */
  App.addNote = function (at) {
    const p = at || viewCenter();
    let note = null;
    Model.act(() => { note = Model.addScript('note', { text: '', x: Math.round(p.x), y: Math.round(p.y) }); });
    App.toast('メモを置きました');
    // 置いたらすぐ書けるように、中にカーソルを置く
    setTimeout(() => {
      const el = [...document.querySelectorAll('#canvas > .script.note')].find((e) => e._script === note);
      if (el) el.querySelector('.note-text').focus();
    }, 50);
  };

  function viewCenter() {
    const ws = $('#workspace');
    return {
      x: Math.round((ws.scrollLeft + 80) / App.zoom),
      y: Math.round((ws.scrollTop + ws.clientHeight / 2) / App.zoom),
    };
  }

  // ------------------------------------------------------------ スクリプト
  App.duplicateScript = function (script) {
    Model.act(() => {
      const copy = Model.clone(script);
      copy.id = Model.uid('s');
      copy.x = (script.x || 0) + 40;
      copy.y = (script.y || 0) + 40;
      if (copy.kind === 'function' || copy.kind === 'talk') {
        let base = copy.name || 'コピー';
        let n = 2;
        while (Model.functionNames().includes(base + n)) n++;
        copy.name = base + n;
      }
      Model.project.scripts.push(copy);
    });
    App.toast('複製しました');
  };

  App.deleteScript = function (script) {
    // 中身があれば確かめる（ブロック、またはメモの文字）
    const count = (script.blocks || []).length || (script.kind === 'note' && String(script.text || '').trim() ? 1 : 0);
    if (count && !confirm(`「${Model.scriptTitle(script)}」を削除しますか？`)) return;
    Model.act(() => Model.removeScript(script));
    App.toast('削除しました');
  };

  // かたまりを、種類ごとに上から並べなおす。大きさは描いた実物で測る（セリフが長いと 420px より広いので）
  function tidy() {
    const size = new Map();
    for (const el of document.querySelectorAll('#canvas > .script')) {
      if (el._script) size.set(el._script, { w: el.offsetWidth, h: el.offsetHeight });
    }
    Model.act(() => {
      let x = 60, y = 40, colW = 0;
      const order = { event: 0, talk: 1, function: 2, loose: 3, note: 4 };
      const sorted = Model.project.scripts.slice().sort(
        (a, b) => (order[a.kind] || 0) - (order[b.kind] || 0)
      );
      for (const s of sorted) {
        const sz = size.get(s) || { w: 420, h: estimateHeight(s) };
        // この列に入りきらなければ、となりの列へ（列の幅は、その列でいちばん広いかたまり）
        if (y > 40 && y + sz.h > 2400) { y = 40; x += colW + 60; colW = 0; }
        s.x = x; s.y = y;
        y += sz.h + 40;
        colW = Math.max(colW, sz.w);
      }
      Model.project.scripts = sorted;
    });
  }

  function estimateHeight(script) {
    let n = 1;
    const walk = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const b of arr) {
        n++;
        const d = N.getDef(b);
        if (!d) continue;
        for (const s of d.subs || []) { n += 1; walk(b[s.key]); }
        if (d.dynamic && Array.isArray(b[d.dynamic])) { b[d.dynamic].forEach((x) => { n += 1; walk(x); }); }
      }
    };
    walk(script.blocks);
    return n * 40;
  }

  // ------------------------------------------------------------- 実行/演出
  function renderRunTargets() {
    const sel = $('#run-target');
    const prev = sel.value;
    sel.textContent = '';
    for (const s of Model.project.scripts) {
      if (s.kind === 'loose' || s.kind === 'note') continue;
      const o = Render.el('option', null, Model.scriptTitle(s));
      o.value = s.id;
      sel.appendChild(o);
    }
    if (!sel.childElementCount) {
      const o = Render.el('option', null, '（まだブロックがありません）');
      o.value = '';
      sel.appendChild(o);
    }
    // 前に選んでいたものが残っていればそれを、なければ先頭を選ぶ
    if (prev && Model.project.scripts.some((s) => s.id === prev)) sel.value = prev;
    else sel.selectedIndex = 0;
  }

  // ためすときの Reference。マウス系はブロックで選んだ場所・相手を入れておくと、
  // 「イベントの情報」ブロックが本番と同じ値を返す。
  function refsFor(script) {
    if (!script || script.kind !== 'event') return [];
    if (script.event === 'OnCommunicate') {
      // 相手の名前・言われたこと。空欄なら、ためすとき用の仮の値を入れる。
      return [script.from || 'ほかのゴースト', script.contains || 'こんにちは'];
    }
    // よく使うイベントは、それらしい仮の値を入れておく
    const samples = {
      OnFileDrop2: ['C:\\Users\\user\\Desktop\\memo.txt', '0', 'text/plain'],
      OnURLDropped: ['C:\\Users\\user\\Downloads\\page.html', 'https://example.com/', '0'],
      OnKeyPress: ['a', '65', '0', '0', ''],
      OnBatteryLow: ['15', '-1', 'offline', 'low'],
      OnShellChanged: ['master', Model.project.meta.name || '', ''],
      OnDarkTheme: ['1', '1'],
    };
    if (samples[script.event]) return samples[script.event];
    if (!N.MOUSE_EVENTS[script.event]) return [];
    const who = script.who >= 0 ? script.who : 0;
    return ['0', '0', '0', String(who), script.area || 'Head'];
  }

  /**
   * ブロックを動かして、さくらスクリプトをもらう。
   * 動かすのは栞そのもの（studio/src/preview.cpp → shiori/src/interp.cpp）です。
   * 画面側で同じ規則をもう一度書くと、片方だけ直したときに静かにズレるためです。
   */
  // refs … イベントの情報を、画面から渡したいとき（選択肢の情報・入力欄の答え）。無ければ仮の値
  async function runPreview(script, refs) {
    const meta = Model.project.meta || {};
    return api('/api/preview', {
      method: 'POST',
      body: {
        project: Model.project,
        scriptId: script.id,
        refs: refs || refsFor(script),
        vars: App.sessionVars,
        // SSP が知らせてくる情報は、ためすときは仮の値（誕生日は今日にしておく）
        sys: {
          ghostName: meta.name || '', shellName: 'master', userName: 'ユーザー',
          birthMonth: new Date().getMonth() + 1, birthDay: new Date().getDate(), baseware: '2.9',
        },
      },
    });
  }

  App.runScript = async function (script, refs) {
    if (!script) return;
    $('#run-target').value = script.id;
    switchTab('run');
    let res;
    try {
      res = await runPreview(script, refs);
    } catch (e) {
      $('#script-preview').textContent = '（ためせませんでした: ' + e.message + '）';
      App.toast(e.message, true);
      return;
    }
    App.sessionVars = res.vars || {};
    let preview = res.script || '（なにも出力されませんでした）';
    // 話しかけ先はさくらスクリプトに出ないので、ここで見せる
    if (res.commTo) preview += `\n\n（「${res.commTo}」に届きます）`;
    $('#script-preview').textContent = preview;
    renderRunVars();
    N.Shell.playSakura(res.script);
  };

  /**
   * ためすの入力欄に答えたとき。SSP で動かしたときと同じ順に、
   *   ① 「たずねる」が付けた ID（nashi:変数名）なら、その変数に入れる（栞の shiori.cpp と同じ）
   *   ② 「答えが返ってきたとき」（OnUserInput）のかたまりがあれば、ID と答えを情報にして動かす
   */
  // shown … 知らせに出す答え（パスワードは伏せる）
  App.answerInput = function (id, answer, shown) {
    const name = /^nashi:/.test(id) ? id.slice(6) : '';
    if (name) {
      App.sessionVars = Object.assign({}, App.sessionVars, { [name]: answer });
      renderRunVars();
    }
    const handler = Model.project.scripts.find((s) => s.kind === 'event' && s.event === 'OnUserInput' && !s.disabled);
    if (handler) { App.runScript(handler, [id, answer]); return; }
    App.toast(name ? `変数「${name}」に「${shown == null ? answer : shown}」を入れました`
      : '「答えが返ってきたとき」のかたまりがありません', !name);
  };

  function renderRunVars() {
    const box = $('#run-vars');
    box.textContent = '';
    // まだ実行していなくても、プロジェクトの初期値を見せる（何があるか分かるように）
    const shown = {};
    for (const v of Model.project.variables || []) shown[v.name] = v.value;
    Object.assign(shown, App.sessionVars);
    const names = Object.keys(shown).filter((k) => k[0] !== '@');
    if (!names.length) {
      box.appendChild(Render.div('run-var is-empty', 'まだ変数がありません'));
      return;
    }
    for (const k of names) {
      box.appendChild(Render.div('run-var', `${k}: ${Player.toStr(shown[k])}`));
    }
  }

  /** ためすときの変数を、プロジェクトの初期値にもどす */
  function resetSessionVars() {
    App.sessionVars = {};
    renderRunVars();
    App.toast('ためすときの変数を、初期値にもどしました');
  }

  /** 書き出したゴーストが覚えている変数（nashi_save.json）を消す */
  async function resetGhostSave() {
    try {
      const r = await api('/api/save/reset', {
        method: 'POST',
        body: { project: Model.project, outDir: $('#export-dir') ? $('#export-dir').value : '' },
      });
      const n = (r.deleted || []).length;
      App.toast(n
        ? `ゴーストの記憶を消しました（${n} か所）。次に動かすと初期値からになります`
        : '消すものがありませんでした（まだ動かしていないようです）');
    } catch (e) {
      App.toast(e.message, true);
    }
  }

  /** 栞の記録（nashi_debug.txt）を読む・はじめる・やめる
   *
   * 栞は「ファイルがあるときだけ」書くので、記録をはじめる＝空ファイルを作る、です。
   * SAORI が呼べなかった理由など、画面に出ない事情はここに残ります。
   */
  async function ghostLog(action) {
    const box = $('#ghost-log');
    try {
      const r = await api('/api/ghost/log', {
        method: 'POST',
        body: {
          project: Model.project,
          outDir: $('#export-dir') ? $('#export-dir').value : '',
          action: action || '',
        },
      });
      if (!(r.places || []).length) {
        box.textContent = 'まだ書き出していないようです。先に「SSP に入れて動かす」を押してください。';
        return;
      }
      if (action === 'clear') {
        box.textContent = '記録をやめました。';
        App.toast('記録をやめました');
        return;
      }
      if (!r.recording) {
        box.textContent = 'いまは記録していません。「記録をはじめる」を押すと、'
          + 'つぎに動かしたときから残ります。';
        return;
      }
      box.textContent = r.text && r.text.trim()
        ? r.text
        : `記録中です（${r.path}）。まだ何も書かれていません。\n`
          + 'ゴーストを動かしてから、もう一度「読む」を押してください。';
      box.scrollTop = box.scrollHeight;
      if (action === 'start') App.toast('記録をはじめました');
    } catch (e) {
      box.textContent = e.message;
      App.toast(e.message, true);
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function balloonOf(who) {
    return document.getElementById('balloon-' + (who === 1 ? 1 : 0));
  }

  // ---------------------------------------------------------- 右クリック
  let menuReturnTo = null;    // キーボードで開いたとき、閉じたらもどる欄
  App.closeContextMenu = function () {
    const menu = $('#ctx-menu');
    const hadFocus = menu.contains(document.activeElement);
    menu.classList.remove('open');
    if (hadFocus && menuReturnTo && menuReturnTo.isConnected) menuReturnTo.focus();
    menuReturnTo = null;
  };

  // opts.focusFrom … キーボードで開いたときの欄。いちばん上の項目にフォーカスを移し、
  //                  ↑ ↓ で動いて Enter でえらぶ。Esc で閉じて、その欄にもどる。
  function openContextMenu(x, y, items, opts) {
    const menu = $('#ctx-menu');
    menu.textContent = '';
    for (const item of items) {
      if (item === '-') { menu.appendChild(Render.div('ctx-sep')); continue; }
      const b = Render.el('button', 'ctx-item' + (item.danger ? ' danger' : ''), item.label);
      b.addEventListener('click', () => { App.closeContextMenu(); item.run(); });
      menu.appendChild(b);
    }
    menu.style.left = Math.min(x, window.innerWidth - 170) + 'px';
    // 長い一覧（▾ でえらぶものなど）は、画面からはみ出さないよう上を 8px でとめる（中はスクロール）
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menu.childElementCount * 34 - 20)) + 'px';
    menu.classList.add('open');
    menuReturnTo = (opts && opts.focusFrom) || null;
    if (menuReturnTo) { const first = menu.querySelector('.ctx-item'); if (first) first.focus(); }
  }
  App.openMenu = openContextMenu;

  /**
   * コピーしたブロックを、キャンバスの空いた場所に新しいかたまりとして置く。
   * at が無ければ、さいごに押した空いた場所、それも無ければ見えている左上あたり。
   */
  App.pasteOnCanvas = function (at) {
    if (!App.clipboard) { App.toast('コピーしたブロックがありません', true); return; }
    const ws = $('#workspace');
    const p = at || N.Drag.D.lastPoint ||
      { x: ws.scrollLeft / App.zoom + 40, y: ws.scrollTop / App.zoom + 40 };
    Model.act(() => {
      Model.project.scripts.push({
        id: Model.uid('s'), kind: 'loose', blocks: [Model.clone(App.clipboard)],
        x: Math.max(0, Math.round(p.x)), y: Math.max(0, Math.round(p.y)),
      });
    });
    App.toast('はりつけました');
  };

  // ------------------------------------------------------- パレットの幅
  // 右のふちをドラッグで広げる・せばめる。幅はこのパソコンに覚えておく（読めなくても困らない）。
  const PALETTE_W = { def: 252, min: 200, max: 560, key: 'nashi.paletteWidth' };
  function setPaletteWidth(w) {
    w = Math.max(PALETTE_W.min, Math.min(PALETTE_W.max, Math.round(w)));
    document.documentElement.style.setProperty('--palette-w', w + 'px');
    $('#palette-resize').setAttribute('aria-valuenow', String(w));   // 読み上げにもいまの幅を伝える
    return w;
  }
  function setupPaletteResize() {
    try {
      const saved = Number(localStorage.getItem(PALETTE_W.key));
      if (saved) setPaletteWidth(saved);
    } catch { /* 覚えておけない環境では、いつもの幅 */ }
    const save = (w) => { try { localStorage.setItem(PALETTE_W.key, String(w)); } catch { /* なし */ } };
    const handle = $('#palette-resize');
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const left = $('#palette').getBoundingClientRect().left;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('is-dragging');
      const move = (ev) => setPaletteWidth(ev.clientX - left);
      const up = (ev) => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.classList.remove('is-dragging');
        save(setPaletteWidth(ev.clientX - left));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
    handle.addEventListener('dblclick', () => save(setPaletteWidth(PALETTE_W.def)));
    // キーボードでも: ← → で 20px ずつ、Home でもとの幅
    handle.addEventListener('keydown', (e) => {
      const now = $('#palette').offsetWidth;
      let w = null;
      if (e.key === 'ArrowLeft') w = now - 20;
      else if (e.key === 'ArrowRight') w = now + 20;
      else if (e.key === 'Home') w = PALETTE_W.def;
      if (w == null) return;
      e.preventDefault();
      e.stopPropagation();
      save(setPaletteWidth(w));
    });
  }

  function setupContextMenu() {
    document.addEventListener('contextmenu', (e) => {
      const hat = e.target.closest('#canvas .blk.hat');
      const blk = e.target.closest('#canvas .blk');
      const scriptEl = e.target.closest('#canvas .script');
      if (!scriptEl && e.target.closest('#canvas')) {
        // 空いた場所: メモを置ける。コピーしたブロックがあれば、そこへはりつけられる
        e.preventDefault();
        const at = N.Drag.toCanvas(e.clientX, e.clientY);
        const items = [{ label: 'ここにメモを置く', run: () => App.addNote(at) }];
        if (App.clipboard) items.push({ label: 'ここにはりつける', run: () => App.pasteOnCanvas(at) });
        openContextMenu(e.clientX, e.clientY, items);
        return;
      }
      if (!scriptEl) { App.closeContextMenu(); return; }
      // メモの中では、ふつうの文字の右クリック（コピー・はりつけ）のまま
      if (e.target.closest('.note-text')) { App.closeContextMenu(); return; }
      e.preventDefault();

      const isNote = scriptEl._script && scriptEl._script.kind === 'note';
      if (hat || !blk || isNote) {
        const script = scriptEl._script;
        openContextMenu(e.clientX, e.clientY, [
          ...(isNote ? [] : [{ label: '▶ 実行してみる', run: () => App.runScript(script) }]),
          { label: '複製する', run: () => App.duplicateScript(script) },
          '-',
          { label: '削除する', danger: true, run: () => App.deleteScript(script) },
        ]);
        return;
      }

      const block = blk._blk;
      openContextMenu(e.clientX, e.clientY, [
        {
          label: '複製する',
          run: () => Model.act(() => {
            if (!Array.isArray(blk._stack)) return false;
            blk._stack.splice(blk._index + 1, 0, Model.clone(block));
          }),
        },
        {
          label: block.disabled ? '有効にする' : '一時的に無効にする',
          run: () => Model.act(() => {
            if (block.disabled) delete block.disabled;
            else block.disabled = true;
          }),
        },
        '-',
        {
          label: 'このブロックを削除',
          danger: true,
          run: () => Model.act(() => {
            if (!Array.isArray(blk._stack)) return false;
            blk._stack.splice(blk._index, 1);
          }),
        },
        {
          label: 'ここから下をすべて削除',
          danger: true,
          run: () => Model.act(() => {
            if (!Array.isArray(blk._stack)) return false;
            blk._stack.splice(blk._index);
          }),
        },
      ]);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#ctx-menu')) App.closeContextMenu();
    });
    // メニューの中では、↑ ↓ で項目を移り、Esc か Tab で閉じる（開いたまま外へ出ないように）
    $('#ctx-menu').addEventListener('keydown', (e) => {
      const items = [...$('#ctx-menu').querySelectorAll('.ctx-item')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
        if (next) next.focus();
      } else if (e.key === 'Enter' && i >= 0) {
        e.preventDefault();
        items[i].click();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        App.closeContextMenu();
      } else {
        return;
      }
      e.stopPropagation();
    });
  }

  // ------------------------------------------------------------ 設定パネル
  function syncMetaFields() {
    const m = Model.project.meta;
    const s = Model.project.settings;
    const sh = Model.project.shell;
    setVal('#ghost-name', m.name);
    setVal('#meta-name', m.name);
    setVal('#meta-folder', m.folder || '');
    $('#meta-folder').placeholder = m.name || '';
    setVal('#meta-sakura', m.sakuraName);
    setVal('#meta-kero', m.keroName);
    setVal('#meta-craftman', m.craftman);
    setVal('#meta-url', m.craftmanUrl);
    setVal('#meta-homeurl', m.homeUrl);
    setVal('#meta-version', m.version);
    setVal('#meta-desc', m.description);
    setVal('#set-talk-interval', s.randomTalkInterval);
    setVal('#set-no-repeat', s.noRepeatCount == null ? 0 : s.noRepeatCount);
    $('#set-talk-enabled').checked = s.randomTalkEnabled !== false;
    setVal('#shell-balloon-color', sh.balloonColor);
    $('#shell-balloon-on').checked = !!sh.balloonEnabled;
    setVal('#shell-sakura-color', sh.sakuraColor);
    setVal('#shell-sakura-cloth', sh.sakuraCloth);
    setVal('#shell-kero-color', sh.keroColor);
    setVal('#shell-kero-cloth', sh.keroCloth);
    N.Shell.refreshShell();
  }

  function setVal(sel, v) {
    const el = $(sel);
    if (!el) return;
    if (document.activeElement === el) return;
    el.value = v == null ? '' : v;
  }

  function bindMeta() {
    const bind = (sel, apply, onLive) => {
      const el = $(sel);
      let snap = null;
      el.addEventListener('focus', () => { snap = Model.snapshot(); });
      el.addEventListener('change', () => {
        if (!snap) snap = Model.snapshot();
        apply(el.type === 'checkbox' ? el.checked : el.value);
        if (onLive) onLive();
        Model.pushUndo(snap);
        snap = null;
      });
      // 打っている最中もプロジェクトに入れて「保存していない」にする。
      // 欄から離れる前にウィンドウを閉じても、書いたものが消えないように（元にもどす記録は change のときだけ）。
      // 色を動かしている最中は、そのまま描き直す。
      el.addEventListener('input', () => {
        apply(el.type === 'checkbox' ? el.checked : el.value);
        if (onLive) onLive();
        App.onLiveEdit();
      });
    };
    bind('#ghost-name', (v) => { Model.project.meta.name = v; });
    bind('#meta-name', (v) => { Model.project.meta.name = v; });
    bind('#meta-folder', (v) => { Model.project.meta.folder = v.trim(); });
    bind('#meta-sakura', (v) => { Model.project.meta.sakuraName = v; });
    bind('#meta-kero', (v) => { Model.project.meta.keroName = v; });
    bind('#meta-craftman', (v) => { Model.project.meta.craftman = v; });
    bind('#meta-url', (v) => { Model.project.meta.craftmanUrl = v; });
    bind('#meta-homeurl', (v) => { Model.project.meta.homeUrl = v.trim(); });
    bind('#meta-version', (v) => { Model.project.meta.version = v; });
    bind('#meta-desc', (v) => { Model.project.meta.description = v; });
    bind('#set-talk-interval', (v) => { Model.project.settings.randomTalkInterval = Number(v) || 0; });
    bind('#set-no-repeat', (v) => { Model.project.settings.noRepeatCount = Math.max(0, Number(v) || 0); });
    bind('#set-talk-enabled', (v) => { Model.project.settings.randomTalkEnabled = !!v; });
    bind('#shell-balloon-on', (v) => { Model.project.shell.balloonEnabled = !!v; });
    bind('#shell-balloon-color', (v) => { Model.project.shell.balloonColor = v; });
    bind('#shell-sakura-color', (v) => { Model.project.shell.sakuraColor = v; }, N.Shell.refreshShell);
    bind('#shell-sakura-cloth', (v) => { Model.project.shell.sakuraCloth = v; }, N.Shell.refreshShell);
    bind('#shell-kero-color', (v) => { Model.project.shell.keroColor = v; }, N.Shell.refreshShell);
    bind('#shell-kero-cloth', (v) => { Model.project.shell.keroCloth = v; }, N.Shell.refreshShell);
  }

  // ------------------------------------------------------------------ ズーム
  function setZoom(z) {
    App.zoom = Math.max(0.4, Math.min(1.6, z));
    $('#canvas').style.transform = 'scale(' + App.zoom + ')';
    N.Drag.setZoom(App.zoom);
    $('#btn-zoom-reset').textContent = Math.round(App.zoom * 100) + '%';
  }

  // ------------------------------------------------------------------- 起動
  async function boot() {
    renderCategories();
    bindMeta();
    setupContextMenu();
    setupPaletteResize();

    N.Drag.init({
      workspace: $('#workspace'),
      canvas: $('#canvas'),
      layer: $('#drag-layer'),
      palette: $('#palette'),
      trash: $('#trash'),
    });

    Model.onChange(scheduleRender);

    let state = null;
    try { state = await api('/api/state'); } catch (e) { console.warn(e); }
    App.state = state;

    if (state) {
      $('#export-dir').value = state.defaultOutDir || '';
      const st = $('#dll-status');
      st.className = 'status-line ' + (state.dllFound ? 'status-ok' : 'status-ng');
      st.textContent = state.dllFound
        ? '栞 (nashi.dll) の準備ができています'
        : 'nashi.dll がまだありません。shiori\\build.ps1 を実行してください。';
      $('#ssp-hint').textContent = state.sspGhostDir
        ? 'SSP らしきフォルダを見つけました: ' + state.sspGhostDir
        : 'SSP の ghost フォルダを指定すると、そのまま追加できます。';
    }

    let loaded = null;
    let lostLast = '';
    if (state && state.lastProject) {
      try {
        loaded = await api('/api/project?name=' + encodeURIComponent(state.lastProject));
      } catch {
        lostLast = state.lastProject;   // 消えた・動いた。黙ってお手本にすると、作ったものが消えたように見える
      }
    }
    Model.init(loaded || Model.newProject());
    // 開いたファイルに上書き保存する（ゴーストの名前を変えても、別のファイルにはしない）
    App.projectName = loaded ? state.lastProject : '';
    if (lostLast) {
      App.toast(`前に開いていた「${lostLast}」を開けませんでした`, true);
    }
    setZoom(1);
    switchTab('run');
    N.Shell.resetStage();

    // ---- ボタン類
    $('#btn-new').addEventListener('click', () => N.Dialog.openSampleDialog(false));
    $('#btn-open').addEventListener('click', N.Dialog.openProjectDialog);
    $('#btn-save').addEventListener('click', () => N.Dialog.saveProject(false));
    $('#btn-undo').addEventListener('click', () => Model.undo());
    $('#btn-redo').addEventListener('click', () => Model.redo());
    // いちばん大きいボタン: SSP に入れて動かす。SSP が見つからなければ、書き出しタブで場所をたずねる
    // （フォルダや .nar への書き出しも、そのタブからできる）
    $('#btn-export').addEventListener('click', async () => {
      switchTab('export');
      const ssp = await N.Ssp.refreshSsp();
      if (ssp && ssp.ghostDir) { N.Ssp.installToSsp(); return; }
      $('#ssp-path').focus();
      App.toast(ssp && ssp.exe
        ? 'SSP の ghost フォルダが見つかりません。ssp.exe の場所を確かめてください'
        : 'SSP が見つかりません。ssp.exe の場所を入れてください', true);
    });
    $('#btn-export-dir').addEventListener('click', () => N.Dialog.doExport('dir'));
    $('#btn-export-nar').addEventListener('click', () => N.Dialog.doExport('nar'));
    $('#btn-add-var').addEventListener('click', () => App.promptNewVariable());
    $('#btn-anim-add').addEventListener('click', N.Shell.addAnimation);
    $('#btn-dress-add').addEventListener('click', N.Shell.addDressPart);
    $('#btn-shell-add').addEventListener('click', () => {
      const v = prompt('どの番号の立ち絵にしますか？（さくらは 0〜9、うにゅうは 10 以上）', '3');
      if (v == null) return;
      const id = Math.max(0, Math.floor(Number(v)));
      if (!Number.isFinite(id)) { App.toast('番号は数字で入れてください', true); return; }
      N.Shell.pickShellImage(id);
    });
    $('#btn-run').addEventListener('click', () => {
      const id = $('#run-target').value;
      const s = Model.project.scripts.find((x) => x.id === id);
      if (s) App.runScript(s);
      else App.toast('実行するかたまりがありません', true);
    });
    $('#btn-copy-script').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('#script-preview').textContent);
        App.toast('コピーしました');
      } catch { App.toast('コピーできませんでした', true); }
    });
    $('#btn-zoom-in').addEventListener('click', () => setZoom(App.zoom + 0.1));
    $('#btn-zoom-out').addEventListener('click', () => setZoom(App.zoom - 0.1));
    $('#btn-zoom-reset').addEventListener('click', () => setZoom(1));
    $('#btn-tidy').addEventListener('click', () => { tidy(); App.toast('整列しました'); });
    $('#btn-note').addEventListener('click', () => App.addNote());
    $('#btn-import').addEventListener('click', async () => {
      const p = $('#import-path').value.trim();
      if (!p) return;
      if (Model.dirty && !confirm('保存していない変更があります。読み込みますか？')) return;
      try {
        const r = await api('/api/import', { method: 'POST', body: { path: p } });
        Model.init(r.project);
        App.projectName = '';            // よそから来たものは、新しいプロジェクトとして保存する
        App.sessionVars = {};
        App.toast('読み込みました');
      } catch (e) { App.toast(e.message, true); }
    });

    $('#btn-run-ssp').addEventListener('click', N.Ssp.sendScriptToSsp);
    $('#btn-send-event').addEventListener('click', N.Ssp.sendEventToSsp);
    $('#btn-send-comm').addEventListener('click', N.Ssp.sendCommToSsp);
    $('#btn-vars-reset').addEventListener('click', resetSessionVars);
    $('#btn-save-reset').addEventListener('click', resetGhostSave);
    $('#btn-log-show').addEventListener('click', () => ghostLog(''));
    $('#btn-log-start').addEventListener('click', () => ghostLog('start'));
    $('#btn-log-clear').addEventListener('click', () => ghostLog('clear'));
    $('#btn-ssp-install').addEventListener('click', N.Ssp.installToSsp);
    $('#btn-ssp-refresh').addEventListener('click', async () => {
      await N.Ssp.refreshSsp();
      App.toast('SSP の状態を確認しました');
    });
    $('#btn-ssp-launch').addEventListener('click', async () => {
      try {
        await api('/api/ssp/launch', { method: 'POST', body: {} });
        App.toast('SSP を起動しました');
        setTimeout(N.Ssp.refreshSsp, 2500);
      } catch (e) { App.toast(e.message, true); }
      N.Ssp.refreshSsp();
    });
    $('#btn-ssp-path').addEventListener('click', async () => {
      try {
        await api('/api/ssp/path', { method: 'POST', body: { path: $('#ssp-path').value.trim() } });
        await N.Ssp.refreshSsp();
        App.toast('SSP の場所を覚えました');
      } catch (e) { App.toast(e.message, true); }
    });

    for (const t of document.querySelectorAll('.side-tab')) {
      t.addEventListener('click', () => {
        switchTab(t.dataset.tab);
        if (t.dataset.tab === 'export' || t.dataset.tab === 'run') N.Ssp.refreshSsp();
      });
    }
    N.Ssp.refreshSsp();
    setInterval(N.Ssp.refreshSsp, 30000);

    const searchInput = $('#search-input');
    if (searchInput) {
      searchInput.addEventListener('input', N.Search.renderSearch);
      searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') searchInput.blur(); });
    }

    // パレットの「ブロックをさがす」: 打つたびに全カテゴリから探す。Esc で消して、もとのカテゴリへ
    const paletteSearch = $('#palette-search');
    const showPalette = () => Render.renderPalette($('#palette-blocks'), App.category, Model.project, paletteSearch.value);
    paletteSearch.addEventListener('input', showPalette);
    paletteSearch.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      paletteSearch.value = '';
      showPalette();
      paletteSearch.blur();
    });

    // ---- キーボード
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      // ダイアログを開いているあいだは、うしろのキャンバスのブロックを消したりはりつけたりしない。
      // 保存と「もとに戻す」だけは効かせる（当たり判定の編集などは、戻すとダイアログも追いかける）。
      const modalOpen = $('#modal-root').classList.contains('open');
      if (modalOpen && e.key === 'Escape') { e.preventDefault(); N.Dialog.closeModal(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); N.Dialog.saveProject(false); return; }
      // ダイアログの欄に打っているときの Ctrl+Z は、欄の文字を戻す（プロジェクトは戻さない）
      if (modalOpen && (typing || N.Dialog.modalBlocksUndo() || !(e.ctrlKey && /^[zy]$/i.test(e.key)))) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        switchTab('search');
        if (searchInput) { searchInput.focus(); searchInput.select(); }
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); Model.undo(); return; }
      if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault(); Model.redo(); return;
      }
      if (typing) return;

      // ---- ブロックのコピー＆はりつけ
      //   コピーしたものは Model.clone で切り離して持つので、あとから元を消しても平気です。
      const sel = N.Drag.getSelected();
      const key = e.key.toLowerCase();
      if (e.ctrlKey && (key === 'c' || key === 'x')) {
        if (!sel || !sel.block) return;
        e.preventDefault();
        App.clipboard = Model.clone(sel.block);
        if (key === 'x' && Array.isArray(sel.stack)) {
          Model.act(() => { sel.stack.splice(sel.index, 1); });
          N.Drag.select(null);
        }
        App.toast(key === 'x' ? 'ブロックを切り取りました' : 'ブロックをコピーしました');
        return;
      }
      if (e.ctrlKey && key === 'v') {
        if (!App.clipboard) { App.toast('コピーしたブロックがありません', true); return; }
        e.preventDefault();
        // えらんだブロックが無い（または入れ子の中の値ブロック）なら、キャンバスの空いた場所へ
        if (!sel || !Array.isArray(sel.stack)) { App.pasteOnCanvas(); return; }
        Model.act(() => { sel.stack.splice(sel.index + 1, 0, Model.clone(App.clipboard)); });
        App.toast('はりつけました');
        return;
      }
      if (e.ctrlKey && key === 'd') {
        if (!sel || !sel.block || !Array.isArray(sel.stack)) return;
        e.preventDefault();
        Model.act(() => { sel.stack.splice(sel.index + 1, 0, Model.clone(sel.block)); });
        App.toast('ブロックを複製しました');
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel && Array.isArray(sel.stack)) {
          e.preventDefault();
          Model.act(() => { sel.stack.splice(sel.index, 1); });
          N.Drag.select(null);
        }
      }
      if (e.key === 'Escape') App.closeContextMenu();
    });

    $('#workspace').addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(App.zoom + (e.deltaY < 0 ? 0.08 : -0.08));
    }, { passive: false });

    window.addEventListener('beforeunload', (e) => {
      if (!Model.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });

    setInterval(() => { if (Model.dirty) N.Dialog.saveProject(true); }, 60000);

    // 開くものが無かったとき（はじめての起動など）は、はじめかたをえらんでもらう
    if (!loaded) N.Dialog.openSampleDialog(true);
  }

  // ---------------------------------------------------- 分けた画面ファイルへ渡すもの
  // shell.js / search.js / dialog.js / ssp.js は app.js のあとに読みこまれるので、
  // ここに載せたものを N.App 経由で使います。逆向き（app.js から向こう）は、
  // 読みこみ順の都合で N.Shell.xxx() のように、その場で引きます。
  App.api = api;
  App.sleep = sleep;
  App.escapeHtml = escapeHtml;
  App.updateTitle = updateTitle;
  App.switchTab = switchTab;
  App.refsFor = refsFor;
  App.runPreview = runPreview;
  App.renderRunVars = renderRunVars;
  App.balloonOf = balloonOf;
  App.scheduleRender = scheduleRender;
  App.renderAll = renderAll;

  document.addEventListener('DOMContentLoaded', boot);

})(window.NASHI);
