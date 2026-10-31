/* なしスタジオ - 「チェック」タブと「さがす」タブ
 *
 * チェックは lint.js が出した注意をならべ、さがすはブロックの中身を字で引きます。
 *
 * app.js より**あとに**読みこまれるので、app.js の中身は N.App 経由で使います。
 * 逆に app.js からここを呼ぶときは、読みこみ順の都合で N.Search.xxx() の形になります。
 */
'use strict';

(function (N) {

  const Model = N.Model;
  const Render = N.Render;
  const App = N.App;
  const $ = N.$;
  const switchTab = App.switchTab;

  // ------------------------------------------------------------- チェック
  function renderCheck() {
    const list = $('#check-list');
    const badge = $('#check-badge');
    const issues = N.Lint.run(Model.project);
    const errors = N.Lint.countErrors(issues);

    badge.textContent = issues.length ? String(issues.length) : '';
    badge.classList.toggle('is-on', issues.length > 0);
    badge.classList.toggle('warn-only', issues.length > 0 && errors === 0);

    list.textContent = '';
    if (!issues.length) {
      list.appendChild(Render.div('check-ok', '✓ 気になるところはありません'));
      return;
    }
    for (const it of issues) {
      const item = Render.el('button', 'check-item ' + (it.level === 'error' ? 'is-error' : 'is-warn'));
      item.appendChild(Render.el('span', 'mark', it.level === 'error' ? '⛔' : '⚠'));
      const msg = Render.div('msg');
      msg.appendChild(document.createTextNode(it.message));
      if (it.hint) msg.appendChild(Render.el('span', 'why', it.hint));
      item.appendChild(msg);
      if (it.script) {
        item.title = 'クリックでその場所へ移動します';
        item.addEventListener('click', () => jumpTo(it));
      } else {
        item.style.cursor = 'default';
      }
      const fix = fixButton(it.fix);
      if (!fix) { list.appendChild(item); continue; }
      // その場で直せるものは、項目の下にボタンを出す（ボタンの中にボタンは入れられないので並べる）
      const row = Render.div('check-row');
      row.appendChild(item);
      row.appendChild(fix);
      list.appendChild(row);
    }
  }

  /** チェックの項目を、その場で直すボタン（無い変数・トークを作る、使っていない変数を消す） */
  function fixButton(fix) {
    if (!fix || !fix.name) return null;
    let label = '';
    let run = null;
    if (fix.add === 'var') {
      label = `変数「${fix.name}」を作る`;
      run = () => {
        let made = null;
        Model.act(() => { made = Model.addVariable(fix.name, 0); return made ? undefined : false; });
        if (made) App.toast(`変数「${fix.name}」を作りました`);
        else App.toast('その名前の変数は作れません。変数タブで名前を確かめてください', true);
      };
    } else if (fix.add === 'talk') {
      label = `トーク「${fix.name}」を作る`;
      run = () => App.createFunctionNamed(fix.name);
    } else if (fix.remove === 'var') {
      label = `変数「${fix.name}」を削除する`;
      run = () => {
        if (!confirm(`変数「${fix.name}」を削除しますか？`)) return;   // 変数タブの ✕ と同じく確かめる
        Model.act(() => Model.removeVariable(fix.name));
        App.toast(`変数「${fix.name}」を削除しました`);
      };
    }
    if (!run) return null;
    const b = Render.el('button', 'btn small check-fix', label);
    b.addEventListener('click', run);
    return b;
  }

  // --------------------------------------------------------------- さがす
  /** ブロック 1 つを、画面に出ているのと同じ言葉にする（検索と一覧の見出し用） */
  function blockSummary(b, depth) {
    if (!b || typeof b !== 'object') return '';
    if ((depth || 0) > 6) return '…';
    const d = N.getDef(b);
    if (!d) return String(b.type || '');
    let s = '';
    for (const part of d.parts) {
      if (part.lbl != null) { s += part.lbl; continue; }
      const v = b[part.arg];
      if (v == null || v === '') { s += '◯'; continue; }
      if (typeof v === 'object') {
        s += v.type ? '（' + blockSummary(v, (depth || 0) + 1) + '）' : '…';
        continue;
      }
      const a = (d.args || {})[part.arg];
      if (a && a.kind === 'dropdown' && Array.isArray(a.options)) {
        const hit = a.options.find((o) => String(o[1]) === String(v));
        s += hit ? hit[0] : String(v);
      } else {
        s += String(v);
      }
    }
    return s.replace(/\s+/g, ' ').trim();
  }
  App.blockSummary = blockSummary;

  /** かたまりの中のブロックを、入れ子もふくめて順に見る */
  function walkBlocks(script, visit) {
    const stack = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const b of arr) {
        if (!b || typeof b !== 'object') continue;
        visit(b);
        inner(b);
      }
    };
    const inner = (b) => {
      const d = N.getDef(b);
      if (!d) return;
      for (const s of d.subs || []) stack(b[s.key]);
      if (d.dynamic && Array.isArray(b[d.dynamic])) b[d.dynamic].forEach(stack);
      for (const name in (d.args || {})) {
        const v = b[name];
        if (v && typeof v === 'object' && v.type) { visit(v); inner(v); }
      }
    };
    stack(script.blocks);
  }

  function renderSearch() {
    const list = $('#search-list');
    if (!list) return;
    const q = ($('#search-input').value || '').trim().toLowerCase();
    list.textContent = '';
    if (!q) {
      // 言葉が無いときは、キャンバスにあるかたまりの一覧（上から順）。クリックでその場所へ
      const scripts = Model.project.scripts.filter((s) => s.kind !== 'note')
        .slice().sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
      if (!scripts.length) {
        list.appendChild(Render.div('hint', 'キャンバスにまだ何もありません。'));
        return;
      }
      list.appendChild(Render.div('palette-group-title', `かたまりの一覧（${scripts.length} つ）`));
      for (const s of scripts) {
        const item = Render.el('button', 'check-item');
        item.appendChild(Render.el('span', 'mark', '📄'));
        item.appendChild(Render.div('msg', Model.scriptTitle(s)));
        item.title = 'クリックでその場所へ移動します';
        item.addEventListener('click', () => jumpTo({ script: s, block: null }));
        list.appendChild(item);
      }
      return;
    }

    const hits = [];
    for (const s of Model.project.scripts) {
      const title = Model.scriptTitle(s);
      // メモ（付箋）は、見出しに出ない 2 行目より先の文字も探す
      const noteText = s.kind === 'note' ? String(s.text || '').toLowerCase() : '';
      if (title.toLowerCase().includes(q) || noteText.includes(q)) hits.push({ script: s, block: null, text: title });
      walkBlocks(s, (b) => {
        if (hits.length > 200) return;
        const text = blockSummary(b);
        if (text.toLowerCase().includes(q)) hits.push({ script: s, block: b, text, title });
      });
    }

    if (!hits.length) {
      list.appendChild(Render.div('check-ok', '見つかりませんでした'));
      return;
    }
    for (const h of hits) {
      const item = Render.el('button', 'check-item');
      item.appendChild(Render.el('span', 'mark', h.block ? '🔎' : '📄'));
      const msg = Render.div('msg');
      msg.appendChild(document.createTextNode(h.text));
      if (h.block) msg.appendChild(Render.el('span', 'why', h.title));
      item.appendChild(msg);
      item.title = 'クリックでその場所へ移動します';
      item.addEventListener('click', () => jumpTo(h));
      list.appendChild(item);
    }
  }

  /** チェックで見つけた場所までキャンバスを動かして、光らせる */
  function jumpTo(it) {
    if (!it.script) return;
    let target = null;
    let scriptEl = null;
    for (const el of document.querySelectorAll('#canvas .script')) {
      if (el._script === it.script) { scriptEl = el; break; }
    }
    if (!scriptEl) return;
    if (it.block) {
      for (const el of scriptEl.querySelectorAll('.blk')) {
        if (el._blk === it.block) { target = el; break; }
      }
    }

    const ws = $('#workspace');
    const box = (target || scriptEl).getBoundingClientRect();
    const view = ws.getBoundingClientRect();
    ws.scrollLeft += box.left - view.left - Math.max(40, (view.width - box.width) / 2);
    ws.scrollTop += box.top - view.top - Math.max(40, (view.height - box.height) / 2);

    // ブロックはえらんだ状態にする（そのまま Delete や Ctrl+C が効くように）
    if (target && Array.isArray(target._stack)) N.Drag.select(target);

    const flashEl = target || scriptEl;
    flashEl.classList.remove('flash');
    void flashEl.offsetWidth;          // アニメーションをやり直させる
    flashEl.classList.add('flash');
    setTimeout(() => flashEl.classList.remove('flash'), 2600);
  }

  N.Search = { renderCheck, renderSearch };

})(window.NASHI);
