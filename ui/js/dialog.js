/* なしスタジオ - 保存 / 読込 と 書き出し（ダイアログまわり）
 *
 * exe の中の API を呼んで、プロジェクトの出し入れと、ゴースト一式の書き出しをします。
 *
 * app.js より**あとに**読みこまれるので、app.js の中身は N.App 経由で使います。
 * 逆に app.js からここを呼ぶときは、読みこみ順の都合で N.Dialog.xxx() の形になります。
 */
'use strict';

(function (N) {

  const Model = N.Model;
  const Render = N.Render;
  const App = N.App;
  const $ = N.$;
  const api = App.api;
  const escapeHtml = App.escapeHtml;
  const updateTitle = App.updateTitle;
  const T = N.I18n.T;

  // ---------------------------------------------------------- 保存 / 読込
  async function saveProject(silent) {
    // 開いたファイルがあればそこへ。新しいものは、ゴーストの名前で作る
    // （同じ名前の別のプロジェクトがあれば、exe が「名前 (2)」のように空いた名前にする）。
    const create = !App.projectName;
    const name = App.projectName || Model.project.meta.name || T('ゴースト');
    try {
      const r = await api('/api/project', { method: 'POST', body: { name, create, project: Model.project } });
      App.projectName = r.saved;
      Model.dirty = false;
      updateTitle();
      if (!silent) App.toast(T('「{name}」を保存しました', { name: r.saved }));
      return true;
    } catch (e) {
      App.toast(e.message, true);
      return false;
    }
  }

  /** ウィンドウを閉じるとき、アプリ本体から呼ばれる（保存し終わったら合図を返す） */
  // 保存できなかったときは 'save-failed' を返し、閉じるかどうかは exe が使う人に確かめる。
  App.requestSaveAndClose = async function () {
    let ok = false;
    try { ok = await saveProject(true); } catch (e) { ok = false; }
    if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(ok ? 'saved' : 'save-failed');
  };

  // opts.wide … 絵を大きく見せたいときの広いダイアログ（当たり判定の編集など）
  // opts.onClose … どの閉じかたでも、閉じたあとに呼ぶ
  // opts.noUndo … 開いているあいだは Ctrl+Z / Ctrl+Y でプロジェクトを戻さない（閉じるまで書きかけのもの）
  function modal(title, bodyEl, buttons, opts) {
    const root = $('#modal-root');
    root.textContent = '';
    modalOnClose = (opts && opts.onClose) || null;
    modalNoUndo = !!(opts && opts.noUndo);
    const box = Render.div('modal' + (opts && opts.wide ? ' wide' : ''));
    box.appendChild(Render.el('h3', null, title));
    const body = Render.div('modal-body');
    body.appendChild(bodyEl);
    box.appendChild(body);
    const foot = Render.div('modal-foot');
    for (const b of buttons) {
      const btn = Render.el('button', 'btn' + (b.primary ? ' primary' : ''), b.label);
      btn.addEventListener('click', () => { if (b.run) b.run(); if (b.close !== false) closeModal(); });
      foot.appendChild(btn);
    }
    box.appendChild(foot);
    root.appendChild(box);
    root.classList.add('open');
    root.onclick = (e) => { if (e.target === root) closeModal(); };
  }
  let modalOnClose = null;
  let modalNoUndo = false;
  function modalBlocksUndo() { return modalNoUndo && $('#modal-root').classList.contains('open'); }
  function closeModal() {
    $('#modal-root').classList.remove('open');
    const fn = modalOnClose;
    modalOnClose = null;
    if (fn) fn();
  }

  async function openProjectDialog() {
    let state;
    try { state = await api('/api/state'); } catch (e) { App.toast(e.message, true); return; }
    const list = Render.div('');
    if (!state.projects.length) list.appendChild(Render.div('hint', T('まだ保存したプロジェクトがありません。')));
    for (const p of state.projects) {
      const row = Render.div('proj-row');
      row.appendChild(Render.div('t', p.title));
      row.appendChild(Render.div('d', new Date(p.updated).toLocaleString(N.I18n.lang)));
      const x = Render.el('button', 'x', '✕');
      x.title = T('削除');
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(T('「{name}」を削除しますか？', { name: p.title }))) return;
        try {
          await api('/api/project/delete', { method: 'POST', body: { name: p.file } });
        } catch (err) { App.toast(err.message, true); return; }
        if (App.projectName === p.file) App.projectName = '';   // 開いているものを消したら、次は新しく保存
        closeModal();
        openProjectDialog();
      });
      row.appendChild(x);
      row.addEventListener('click', async () => {
        if (Model.dirty && !confirm(T('保存していない変更があります。開きますか？'))) return;
        try {
          const data = await api('/api/project?name=' + encodeURIComponent(p.file));
          Model.init(data);
          App.projectName = p.file;
          App.sessionVars = {};
          closeModal();
          App.toast(T('「{name}」を開きました', { name: p.title }));
        } catch (e) { App.toast(e.message, true); }
      });
      list.appendChild(row);
    }
    modal(T('プロジェクトを開く'), list, [
      { label: T('あたらしく作る'), run: () => setTimeout(openSampleDialog, 0) },
      { label: T('閉じる') },
    ]);
  }

  /**
   * あたらしく作る: 空から、またはお手本ゴースト（exe に入っている見本）から。
   * 「新規」ボタンと、はじめて起動したとき（first = true）に出す。
   */
  async function openSampleDialog(first) {
    let index = [];
    try {
      index = await (await fetch('samples/index.json')).json();
    } catch (e) {
      App.toast(T('お手本を読めませんでした'), true);
    }
    const list = Render.div('');
    list.appendChild(Render.div('hint', first
      ? T('なしスタジオ 2 へようこそ。お手本をえらぶと、動くゴーストを見ながら、まねて作れます。')
      : T('えらぶと、いまのプロジェクトを置きかえて開きます（保存していないものは消えます）。')));

    const empty = Render.div('proj-row');
    empty.appendChild(Render.div('t', T('空からはじめる')));
    empty.appendChild(Render.div('d', T('何もないキャンバスから、自分で組みます。')));
    empty.addEventListener('click', () => {
      if (Model.dirty && !confirm(T('保存していない変更があります。新しく作りますか？'))) return;
      Model.init(Model.newProject());
      App.projectName = '';
      App.sessionVars = {};
      closeModal();
      App.toast(T('新しいゴーストを作りました'));
    });
    list.appendChild(empty);

    for (const s of index) {
      // 名前と説明は、いまの言語のものがあればそれを（samples/index.json の i18n。中のセリフは日本語のまま）
      const loc = (s.i18n && s.i18n[N.I18n.lang]) || s;
      const row = Render.div('proj-row');
      row.appendChild(Render.div('t', loc.title || s.title));
      row.appendChild(Render.div('d', loc.desc || s.desc));
      row.addEventListener('click', async () => {
        if (Model.dirty && !confirm(T('保存していない変更があります。お手本を開きますか？'))) return;
        try {
          const data = await (await fetch('samples/' + s.file)).json();
          Model.init(data);
          App.projectName = '';          // 上書き保存ではなく、名前を付けて保存させる
          App.sessionVars = {};
          closeModal();
          App.toast(T('お手本「{name}」を開きました。保存すると自分のものになります', { name: loc.title || s.title }));
        } catch (e) { App.toast(T('お手本を読めませんでした'), true); }
      });
      list.appendChild(row);
    }
    const buttons = first
      ? [{ label: T('プロジェクトを開く'), run: () => setTimeout(openProjectDialog, 0) }, { label: T('閉じる') }]
      : [{ label: T('閉じる') }];
    modal(T('あたらしく作る'), list, buttons);
  }

  // ------------------------------------------------------------- 書き出し
  /**
   * 書き出し先に別の栞のゴーストがあったら、確かめてから上書きする。
   * send(overwriteForeign) は API を呼ぶ関数。やめたときは null を返す。
   */
  async function withForeignCheck(send) {
    try {
      return await send(false);
    } catch (e) {
      if (!(e.data && e.data.foreign)) throw e;
      const ok = confirm(e.message + '\n\n' + T('上書きすると、そのゴーストの会話と栞が、このプロジェクトのものに置きかわります（もとには戻せません）。\nゴーストの名前（フォルダ名）を変えるのがおすすめです。それでも上書きしますか？'));
      if (!ok) return null;
      return await send(true);
    }
  }

  /**
   * はじめて書き出したフォルダの名前を、プロジェクトに覚えておく。
   * あとでゴースト名を変えても、同じフォルダ（SSP では同じゴースト）に入るように。
   */
  function rememberFolder(folder) {
    if (!folder || Model.project.meta.folder) return;
    Model.project.meta.folder = folder;
    Model.dirty = true;
    Model.emit();
  }

  /**
   * えらんであるのに読めなかった絵の知らせ（書き出しと SSP に入れるの結果で使う）。
   * 無ければ null。表情の絵は仮の立ち絵に、重ねる絵と着せ替えはその絵が抜けて書き出されている。
   */
  function missingNote(list) {
    if (!list || !list.length) return null;
    const box = Render.div('status-line status-ng');
    const head = Render.div('');
    head.innerHTML = T('ファイルが見つからない絵が {n} 枚あり、その絵は入れていません。<b>ゴースト</b>タブで、えらび直してください。', { n: list.length });
    box.appendChild(head);
    for (const path of list) {
      const row = Render.div('');
      const name = Render.el('code', null, path.split(/[\\/]/).pop());
      name.title = path;
      row.appendChild(name);
      box.appendChild(row);
    }
    return box;
  }

  /**
   * すでにあったので書きかえなかったシェルのファイルの知らせ（書き出しと SSP に入れるの結果で使う）。
   * 無ければ null。手で直したものを守ったので、まちがいではない（だから赤ではなく説明の字）。
   */
  function skippedNote(list) {
    if (!list || !list.length) return null;
    const box = Render.div('hint result-note');
    box.appendChild(Render.div('', T('すでにあったシェルのファイル {n} 個は、そのまま残しました。書き直すときは「すでにあるシェルの絵も上書き」に印を付けてください。', { n: list.length })));
    for (const name of list) {
      const row = Render.div('');
      row.appendChild(Render.el('code', null, name));
      box.appendChild(row);
    }
    return box;
  }

  /**
   * チェックタブに ⛔（エラー）があれば、書き出す前に確かめる。やめたらチェックタブを開いて false。
   * ⚠（注意）では止めない。ためしに動かしたいときもあるので、書き出しそのものは禁じない。
   * question … 最後にたずねる文（「それでも書き出しますか？」など。押したボタンに合わせる）
   */
  function confirmIfErrors(question) {
    const errors = N.Lint.run(Model.project).filter((i) => i.level === 'error');
    if (!errors.length) return true;
    const shown = errors.slice(0, 3).map((i) => T('・{text}', { text: i.message }));
    if (errors.length > 3) shown.push(T('（ほかに {n} つ）', { n: errors.length - 3 }));
    const ok = confirm(T('チェックタブに ⛔ が {n} つあります。', { n: errors.length }) + '\n' + shown.join('\n') + '\n\n' +
      T('このままだと、そこはうまく動きません。') + question);
    if (!ok) App.switchTab('check');
    return ok;
  }

  async function doExport(mode) {
    const outDir = $('#export-dir').value.trim();
    const box = $('#export-result');
    if (!confirmIfErrors(mode === 'nar' ? T('それでも .nar を作りますか？') : T('それでも書き出しますか？'))) {
      box.textContent = T('やめました。');
      return;
    }
    box.textContent = T('書き出し中…');
    try {
      const r = await withForeignCheck((overwriteForeign) => api('/api/export', {
        method: 'POST',
        body: {
          project: Model.project,
          outDir,
          mode,
          includeShell: $('#export-shell').checked,
          overwriteShell: $('#export-overwrite').checked,
          overwriteForeign,
        },
      }));
      if (!r) { box.textContent = T('やめました。'); return; }
      rememberFolder(r.folder);
      box.textContent = '';
      const p = Render.div('');
      if (mode === 'nar') {
        p.innerHTML = T('<b>.nar を作りました</b><br><code>{path}</code><br>SSP のウィンドウにドラッグ＆ドロップするとインストールできます。', { path: escapeHtml(r.path) });
      } else {
        p.innerHTML = T('<b>書き出しました</b><br><code>{path}</code><br>ファイル {n} 個', { path: escapeHtml(r.root), n: r.written.length });
        const kept = skippedNote(r.skipped);
        if (kept) p.appendChild(kept);
      }
      if (!r.dll) {
        p.appendChild(Render.div('status-line status-ng',
          T('nashi.dll が見つかりません。shiori\\build.ps1 を実行してから書き出し直してください。')));
      }
      const lost = missingNote(r.missing);
      if (lost) p.appendChild(lost);
      const open = Render.el('button', 'btn small', T('フォルダを開く'));
      open.style.marginTop = '8px';
      open.addEventListener('click', () => api('/api/reveal', {
        method: 'POST', body: { path: r.root || r.path },
      }).catch(() => {}));
      p.appendChild(open);
      box.appendChild(p);
      if (lost) App.toast(T('書き出しました。見つからない絵が {n} 枚あります', { n: r.missing.length }), true);
      else App.toast(T('書き出しました'));
    } catch (e) {
      box.textContent = '';
      box.appendChild(Render.div('status-line status-ng', e.message));
      App.toast(e.message, true);
    }
  }


  N.Dialog = {
    saveProject, openProjectDialog, openSampleDialog, doExport, withForeignCheck, rememberFolder, missingNote,
    confirmIfErrors, skippedNote,
    modal, closeModal, modalBlocksUndo,
  };

})(window.NASHI);
