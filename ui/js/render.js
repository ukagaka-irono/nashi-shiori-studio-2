/* なしスタジオ - ブロックの描画 */
'use strict';

(function (N) {

  const Model = N.Model;
  const INPUT_FONT = '600 12.5px "Segoe UI", "Yu Gothic UI", Meiryo, sans-serif';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const div = (cls, text) => el('div', cls, text);

  let measurer = null;
  function measureText(text) {
    if (!measurer) {
      measurer = el('span');
      measurer.style.cssText =
        'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0;font:' + INPUT_FONT;
      document.body.appendChild(measurer);
    }
    measurer.textContent = text == null ? '' : String(text);
    return measurer.offsetWidth;
  }

  function fitInput(input) {
    const w = measureText(input.value);
    const min = input.classList.contains('long') ? 46 : 26;
    input.style.width = Math.max(min, Math.min(320, w + 16)) + 'px';
  }

  // 変更を Undo に積むためのスナップショット保持
  let editSnapshot = null;
  function beginEdit() { editSnapshot = Model.snapshot(); }
  function endEdit(changed) {
    if (changed && editSnapshot) Model.pushUndo(editSnapshot);
    editSnapshot = null;
  }

  // ------------------------------------------------------------ 入力スロット
  function buildSlot(owner, argName, argDef, project) {
    const value = owner[argName];
    const slot = el('span', 'slot' + (argDef.mode === 'bool' ? ' bool' : ''));
    slot._slotOwner = owner;
    slot._slotArg = argName;
    slot._slotMode = argDef.mode || 'text';

    if (value && typeof value === 'object' && value.type) {
      slot.classList.add('filled');
      const inner = buildBlockEl(value, project);
      inner._slot = slot;
      slot.appendChild(inner);
      return slot;
    }
    if (argDef.mode === 'bool') return slot;   // 空の六角スロット

    const input = el('input');
    input.type = 'text';
    if (argDef.long) input.classList.add('long');
    input.value = value == null ? '' : String(value);
    fitInput(input);
    let before = owner[argName];
    input.addEventListener('focus', () => { before = owner[argName]; beginEdit(); input.select(); });
    input.addEventListener('input', () => {
      fitInput(input);
      owner[argName] = argDef.mode === 'number' && input.value !== '' && !isNaN(Number(input.value))
        ? Number(input.value)
        : input.value;
      N.App && N.App.onLiveEdit && N.App.onLiveEdit();
    });
    input.addEventListener('change', () => {
      // トークの名前を変えたら、よんでいるブロックも付けかえる（元にもどすと、いっしょにもどる）
      if (argName === 'name' && (owner.kind === 'talk' || owner.kind === 'function')) {
        const n = Model.renameTalkRefs(before, owner.name, owner);
        if (n && N.App) N.App.toast(`よんでいるブロック ${n} か所も「${owner.name}」に付けかえました`);
      }
      endEdit(true);
    });
    input.addEventListener('blur', () => endEdit(false));
    const open = () => openLongText(owner, argName);
    input.addEventListener('keydown', (e) => {
      // 広げて書ける欄は、Shift+Enter（改行の入ったセリフは Enter でも）で窓を開く
      if (argDef.expand && e.key === 'Enter' && (e.shiftKey || input.readOnly)) {
        e.preventDefault();
        open();
      } else if (argDef.choices && e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        openChoices(input, owner, argName, argDef.choices, true);
      } else if (e.key === 'Enter') {
        input.blur();
      }
      e.stopPropagation();
    });
    slot.appendChild(input);

    if (argDef.expand) {
      // 1 行の欄は改行を落としてしまうので、改行の入ったセリフは窓でだけ直す
      if (typeof value === 'string' && value.includes('\n')) {
        input.readOnly = true;
        input.value = value.replace(/\r?\n/g, ' ↵ ');
        input.title = '何行かあるセリフです。クリック（または Enter）で、広げて書けます';
        fitInput(input);
        input.addEventListener('click', open);
      }
      const btn = el('button', 'blk-btn blk-expand', '⤢');
      btn.title = '広げて書く (Shift+Enter)';
      btn.tabIndex = -1;          // Tab は欄から欄へ（キーボードでは Shift+Enter で開く）
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', open);
      slot.appendChild(btn);
    }

    if (argDef.choices) {
      // いまの値が一覧にあれば、その名前をマウスをのせたときに見せる（0 → さくら／通常 など）
      const known = choicesFor(argDef.choices, owner).find(([, v]) => String(v) === String(value));
      if (known && !input.title) input.title = known[0];
      const btn = el('button', 'blk-btn blk-expand', '▾');
      btn.title = '一覧からえらぶ (Alt+↓)';
      btn.tabIndex = -1;          // Tab は欄から欄へ（キーボードでは Alt+↓ で開く）
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();      // 外をクリックしたら閉じる、の仕組みに、開いた直後に閉じられないように
        openChoices(btn, owner, argName, argDef.choices);
      });
      slot.appendChild(btn);
    }
    return slot;
  }

  /**
   * 欄の ▾ でえらべるもの。[[見せる名前, 入れる値], …]。番号や名前を覚えていなくても、
   * プロジェクトにあるもの（表情・うごき・まとまり・イベント）から指でえらべるように。
   */
  function choicesFor(kind, owner) {
    const p = Model.project;
    if (kind === 'surfaces') {
      return N.Shell ? N.Shell.surfaceChoices(owner && owner.who) : [];
    }
    if (kind === 'anims') {
      return (p.animations || []).map((a) => [`うごき ${a.id}（表情 ${a.base} から）`, a.id]);
    }
    if (kind === 'groups') {
      const groups = p.scripts.filter((s) => s.kind === 'talk').map((s) => String(s.group || '').trim());
      return [...new Set(groups.filter(Boolean))].map((g) => [g, g]);
    }
    if (kind === 'events') {
      // 起こしても受けるかたまりが無ければ何も起きないので、このプロジェクトにあるイベントだけ
      const names = p.scripts.filter((s) => s.kind === 'event' && s.event).map((s) => s.event);
      return [...new Set(names)].map((ev) => {
        const known = N.EVENTS.find(([, v]) => v === ev);
        return [known ? `${known[0]}（${ev}）` : ev, ev];
      });
    }
    return [];
  }
  const NO_CHOICES = {
    anims: 'まだうごきがありません。「ゴースト」タブの「うごき」で作れます',
    groups: 'まとまりを付けたランダムトークがありません',
    events: 'イベントのかたまりがありません。「イベント」から置いてください',
  };
  // fromKeyboard … Alt+↓ で開いたとき。いちばん上の項目へ移り、Esc で欄にもどる
  function openChoices(anchor, owner, argName, kind, fromKeyboard) {
    const list = choicesFor(kind, owner);
    if (!list.length) { N.App.toast(NO_CHOICES[kind] || 'えらべるものがありません', true); return; }
    const r = anchor.getBoundingClientRect();
    N.App.openMenu(r.left, r.bottom + 2, list.map(([label, v]) => ({
      label, run: () => Model.act(() => { owner[argName] = v; }),
    })), fromKeyboard ? { focusFrom: anchor } : null);
  }

  /**
   * 長いセリフを、何行も書ける大きな欄で書く。書いたものはそのまま入り、ゴーストタブの欄と同じく
   * 閉じたときに 1 回ぶんの「元にもどす」にまとめる（開いているあいだは、プロジェクトを戻さない）。
   */
  function openLongText(owner, argName) {
    const snap = Model.snapshot();
    const body = div('');
    const label = el('label', 'field');
    label.appendChild(el('span', null, 'セリフ'));
    const area = el('textarea');
    area.rows = 8;
    area.value = owner[argName] == null ? '' : String(owner[argName]);
    area.addEventListener('input', () => {
      owner[argName] = area.value;
      N.App && N.App.onLiveEdit && N.App.onLiveEdit();
    });
    label.appendChild(area);
    body.appendChild(label);
    body.appendChild(div('hint', '改行は、そのままバルーンの改行になります。'));
    N.Dialog.modal('セリフを広げて書く', body, [{ label: '閉じる' }], {
      onClose: () => Model.pushUndo(snap),
      noUndo: true,
    });
    area.focus();
  }

  function buildSelect(options, current, onPick) {
    const sel = el('select', 'field-drop');
    let matched = false;
    options.forEach(([label, value]) => {
      const o = el('option', null, label);
      o.value = String(value);
      if (String(value) === String(current)) { o.selected = true; matched = true; }
      sel.appendChild(o);
    });
    if (!matched && current != null && current !== '') {
      const o = el('option', null, String(current));
      o.value = String(current);
      o.selected = true;
      sel.insertBefore(o, sel.firstChild);
    }
    sel.addEventListener('change', () => {
      const picked = options.find(([, v]) => String(v) === sel.value);
      onPick(picked ? picked[1] : sel.value, sel);
    });
    sel.addEventListener('pointerdown', (e) => e.stopPropagation());
    return sel;
  }

  // -------------------------------------------------------------- フィールド
  function buildField(owner, name, argDef, project, blockEl) {
    switch (argDef.kind) {
      case 'dropdown': {
        let options = argDef.options;
        // 「イベントの情報 N番目」は、そのかたまりのイベントでの意味を添える（ダブルクリックなら X座標 など）
        const refs = owner.type === 'ref' && name === 'index' && buildingEvent && N.EVENT_REFS[buildingEvent];
        if (refs) options = options.map(([label, v]) => [refs[v] ? `${label}：${refs[v]}` : label, v]);
        return buildSelect(options, owner[name], (v) => {
          Model.act(() => { owner[name] = v; });
        });
      }

      // 一覧からえらぶか、「その他（自分で書く）」で自分で書く欄（イベント名・プロパティ名）
      case 'eventname':
      case 'propname': {
        const list = argDef.kind === 'propname' ? N.PROPERTIES : N.EVENTS;
        const wrap = el('span', 'field-wrap');
        const isKnown = list.some(([, v]) => v === owner[name]);
        const sel = buildSelect(list, isKnown ? owner[name] : '__custom__', (v) => {
          Model.act(() => { owner[name] = v === '__custom__' ? (isKnown ? '' : owner[name]) : v; });
        });
        wrap.appendChild(sel);
        if (!isKnown) {
          const input = el('input');
          input.className = 'long';
          input.style.cssText = 'margin-left:6px;border:0;border-radius:999px;padding:3px 8px;font:' + INPUT_FONT;
          input.value = owner[name] || '';
          fitInput(input);
          input.addEventListener('focus', beginEdit);
          input.addEventListener('input', () => {
            fitInput(input);
            owner[name] = input.value;
            N.App && N.App.onLiveEdit && N.App.onLiveEdit();
          });
          input.addEventListener('change', () => endEdit(true));
          input.addEventListener('blur', () => endEdit(false));
          input.addEventListener('pointerdown', (e) => e.stopPropagation());
          wrap.appendChild(input);
        }
        return wrap;
      }

      // 当たり判定の名前。仮シェルのものに、うごきで足したものを継ぎ足す。
      case 'areaname': {
        const opts = N.AREAS.slice();
        const seen = {};
        for (const [, v] of opts) seen[v] = 1;
        // 自分の絵に描いた当たり判定の名前も、えらべるようにする
        for (const im of ((Model.project.shell || {}).images || [])) {
          for (const c of (im.collisions || [])) {
            if (!c.name || seen[c.name]) continue;
            seen[c.name] = 1;
            opts.push([c.name + '（立ち絵 ' + im.id + '）', c.name]);
          }
        }
        for (const a of (Model.project.animations || [])) {
          for (const c of (a.collisions || [])) {
            if (!c.name || seen[c.name]) continue;
            seen[c.name] = 1;
            opts.push([c.name + '（うごき ' + a.id + '）', c.name]);
          }
        }
        if (owner[name] && !seen[owner[name]]) opts.push([owner[name], owner[name]]);
        return buildSelect(opts, owner[name], (v) => {
          Model.act(() => { owner[name] = v; });
        });
      }

      // 着せ替えの部品。「ゴースト」タブで作ったものからえらぶ。キャラ・カテゴリ・名前をまとめて入れる。
      case 'dresspart': {
        const whoName = (w) => (w === 1 ? 'うにゅう' : 'さくら');
        const parts = ((Model.project.dressup || {}).parts || []).filter((p) => p.category && p.name);
        const opts = parts.map((p) => [`${whoName(p.who)}：${p.category}／${p.name}`, String(p.id)]);
        const cur = parts.find((p) => p.who === (owner.who === 1 ? 1 : 0)
          && p.category === owner.category && p.name === owner[name]);
        // 名前を変えたり消したりして見つからなくなった部品も、そのまま見せておく（チェックタブが知らせる）
        if (!cur && owner[name]) {
          opts.unshift([`${whoName(owner.who)}：${owner.category || ''}／${owner[name]}`, '__missing__']);
        }
        if (!opts.length) opts.push(['（部品がありません）', '']);
        return buildSelect(opts, cur ? String(cur.id) : (owner[name] ? '__missing__' : ''), (v) => {
          const p = parts.find((x) => String(x.id) === v);
          if (!p) return;
          Model.act(() => { owner.who = p.who; owner.category = p.category; owner[name] = p.name; });
        });
      }

      case 'varname': {
        const opts = Model.variableNames().map((n) => [n, n]);
        if (!opts.length) opts.push(['（変数がありません）', '']);
        opts.push(['＋ あたらしい変数…', '__new__']);
        return buildSelect(opts, owner[name], (v, sel) => {
          if (v === '__new__') {
            const created = N.App.promptNewVariable();
            sel.value = created || owner[name] || '';
            if (created) Model.act(() => { owner[name] = created; });
            return;
          }
          Model.act(() => { owner[name] = v; });
        });
      }

      case 'funcname': {
        const opts = Model.functionNames().map((n) => [n, n]);
        if (!opts.length) opts.push(['（トークがありません）', '']);
        opts.push(['＋ あたらしいトーク…', '__new__']);
        return buildSelect(opts, owner[name], (v, sel) => {
          if (v === '__new__') {
            const created = N.App.promptNewFunction();
            sel.value = created || owner[name] || '';
            if (created) Model.act(() => { owner[name] = created; });
            return;
          }
          Model.act(() => { owner[name] = v; });
        });
      }

      default:
        return buildSlot(owner, name, argDef, project, blockEl);
    }
  }

  function fillRow(row, owner, def, project, blockEl) {
    for (const part of def.parts) {
      if (part.lbl != null) {
        const t = part.lbl.replace(/^\s+|\s+$/g, ' ');
        if (t.trim() === '' ) continue;
        row.appendChild(el('span', 'lbl', part.lbl.trim()));
      } else {
        const argDef = (def.args || {})[part.arg];
        if (!argDef) continue;
        row.appendChild(buildField(owner, part.arg, argDef, project, blockEl));
      }
    }
  }

  // ------------------------------------------------------------------ block
  function buildBlockEl(block, project) {
    const def = N.getDef(block);
    if (!def) {
      const unknown = div('blk cat-control');
      const row = div('row sh-stack', '？ 不明なブロック: ' + (block && block.type));
      unknown.appendChild(row);
      unknown._blk = block;
      return unknown;
    }

    const wrap = div('blk cat-' + def.cat);
    wrap._blk = block;
    wrap._def = def;
    wrap.title = N.blockHelp(def);       // マウスをのせると、何をするブロックかを出す
    if (def.shape === 'reporter') wrap.classList.add('reporter');
    if (def.shape === 'boolean') wrap.classList.add('boolean');
    if (block.disabled) wrap.classList.add('disabled');

    const shapeClass = {
      stack: 'sh-stack', cap: 'sh-cap', hat: 'sh-hat', c: 'sh-ctop',
      reporter: '', boolean: '',
    }[def.shape] || '';

    const row = div('row ' + shapeClass);
    fillRow(row, block, def, project, wrap);
    wrap.appendChild(row);

    if (def.shape === 'c') {
      const subs = [];
      if (def.dynamic) {
        if (!Array.isArray(block[def.dynamic])) block[def.dynamic] = [[], []];
        block[def.dynamic].forEach((arr, i) => {
          subs.push({ arr, label: i === 0 ? null : 'または' });
        });
      } else {
        for (const s of def.subs || []) {
          if (!Array.isArray(block[s.key])) block[s.key] = [];
          subs.push({ arr: block[s.key], label: s.label });
        }
      }

      subs.forEach((s, i) => {
        if (i > 0) {
          const mid = div('row sh-cmid');
          mid.appendChild(el('span', 'branch-label', s.label || ''));
          wrap.appendChild(mid);
        }
        const mouth = div('c-mouth');
        mouth.appendChild(buildStackEl(s.arr, project, { block, key: def.dynamic || (def.subs[i] || {}).key }));
        wrap.appendChild(mouth);
      });

      const bottom = div('row sh-cbottom');
      if (def.dynamic) {
        const minus = el('button', 'blk-btn', '−');
        minus.title = 'えらび先をへらす';
        minus.addEventListener('pointerdown', (e) => e.stopPropagation());
        minus.addEventListener('click', () => {
          const branches = block[def.dynamic];
          if (branches.length <= 1) return;
          // いちばん下のえらび先に、ブロックが入っていれば、いっしょに消えることを確かめる
          const last = branches[branches.length - 1];
          if (Array.isArray(last) && last.length &&
              !confirm('いちばん下のえらび先に入っているブロックも、いっしょに消えます。消しますか？')) return;
          Model.act(() => { branches.pop(); });
        });
        const plus = el('button', 'blk-btn', '＋');
        plus.title = 'えらび先をふやす';
        plus.addEventListener('pointerdown', (e) => e.stopPropagation());
        plus.addEventListener('click', () => {
          Model.act(() => { block[def.dynamic].push([]); });
        });
        bottom.appendChild(minus);
        bottom.appendChild(plus);
      }
      wrap.appendChild(bottom);
    }
    return wrap;
  }

  function buildStackEl(arr, project, owner) {
    const st = div('stack');
    st._stack = arr;
    st._owner = owner;
    arr.forEach((b, i) => {
      const be = buildBlockEl(b, project);
      be._stack = arr;
      be._index = i;
      st.appendChild(be);
    });
    return st;
  }

  const HAT_DEF = { event: '@event', talk: '@talk', function: '@function' };

  // マウス系イベントのときだけ、しぼり込みつきの帽子ブロックに変わる
  function hatKeyFor(script) {
    if (script.kind === 'event') {
      if (N.MOUSE_EVENTS[script.event]) return '@event.touch';
      if (script.event === 'OnSecondChange') return '@event.every';
      if (script.event === 'OnCommunicate') return '@event.comm';
    }
    return HAT_DEF[script.kind];
  }

  function buildScriptEl(script, project, options) {
    const opts = options || {};
    const wrap = div('script');
    wrap._script = script;
    if (!opts.noPosition) {
      wrap.style.left = (script.x || 0) + 'px';
      wrap.style.top = (script.y || 0) + 'px';
    }

    if (!opts.noTools) {
      const tools = div('script-tools');
      const mk = (label, title, fn) => {
        const b = el('button', 'script-tool', label);
        b.title = title;
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return b;
      };
      tools.appendChild(mk('▶', 'このかたまりを実行してみる', () => N.App.runScript(script)));
      tools.appendChild(mk('⧉', '複製する', () => N.App.duplicateScript(script)));
      tools.appendChild(mk('✕', '削除する', () => N.App.deleteScript(script)));
      wrap.appendChild(tools);
    }

    const hatKey = hatKeyFor(script);
    if (hatKey) {
      const def = N.BLOCKS[hatKey];
      const hat = div('blk cat-' + def.cat + ' hat');
      hat._script = script;
      hat._isHat = true;
      hat.title = N.blockHelp(def);
      const row = div('row sh-hat');
      fillRow(row, script, def, project, hat);
      hat.appendChild(row);
      wrap.appendChild(hat);
    }

    // 中のブロックを作るあいだ、どのイベントのかたまりかを覚えておく（「イベントの情報」の意味を出すため）
    const outer = buildingEvent;
    buildingEvent = script.kind === 'event' ? script.event : null;
    try {
      wrap.appendChild(buildStackEl(script.blocks, project, { script }));
    } finally {
      buildingEvent = outer;
    }
    return wrap;
  }
  let buildingEvent = null;

  // -------------------------------------------------------------- workspace
  function renderWorkspace(canvas, project) {
    canvas.textContent = '';
    for (const script of project.scripts) {
      canvas.appendChild(buildScriptEl(script, project));
    }
  }

  // ---------------------------------------------------------------- palette
  /**
   * パレットの「さがす」。すべてのカテゴリから、ことば・説明が query をふくむブロックをえらび、
   * カテゴリ名の小見出しを付けて並べる（renderPalette と同じ形の entries を返す）。
   */
  function searchPalette(query) {
    const q = query.trim().toLowerCase();
    const hit = (text) => String(text || '').toLowerCase().includes(q);
    const out = [];
    for (const cat of N.CATEGORIES) {
      const found = [];
      for (const entry of N.PALETTE[cat.id] || []) {
        if (entry === '@vars') {
          if (Model.variableNames().some(hit) || hit('変数')) found.push(entry);
          continue;
        }
        if (typeof entry !== 'string') continue;
        const def = N.BLOCKS[entry];
        // いちばん基本の帽子は、えらべるイベントの名前（「起動したとき」など）でも見つかるように
        // （マウスなどのイベントをえらぶと、帽子はひとりでにその形に変わる）
        const byEvent = entry === '@event' && N.EVENTS.some(([label, v]) => v !== '__custom__' && hit(label));
        if (def && (hit(def.spec.replace(/%\w+/g, ' ')) || hit(N.blockHelp(def)) || byEvent)) found.push(entry);
      }
      if (found.length) out.push({ heading: cat.name }, ...found);
    }
    if (!out.length) out.push({ note: `「${query.trim()}」をふくむブロックは見つかりません。` });
    return out;
  }

  // query があれば、カテゴリではなく「さがす」の結果を並べる
  function renderPalette(container, catId, project, query) {
    container.textContent = '';
    const entries = query && query.trim() ? searchPalette(query) : (N.PALETTE[catId] || []);

    for (const entry of entries) {
      if (typeof entry === 'object' && entry.note) {
        container.appendChild(div('palette-note', entry.note));
        continue;
      }
      if (typeof entry === 'object' && entry.heading) {
        container.appendChild(div('palette-group-title', entry.heading));
        continue;
      }
      if (typeof entry === 'object' && entry.button) {
        const b = el('button', 'btn small', entry.label);
        b.style.marginBottom = '10px';
        b.addEventListener('click', () => N.App.promptNewVariable());
        container.appendChild(b);
        continue;
      }
      if (entry === '@vars') {
        const names = Model.variableNames();
        if (!names.length) {
          container.appendChild(div('palette-note', 'まだ変数がありません。上のボタンで作ってみましょう。'));
        }
        for (const name of names) {
          const block = { type: 'var', name };
          const holder = div('script');
          const be = buildBlockEl(block, project);
          be._paletteKey = 'var';
          be._paletteBlock = block;
          holder.appendChild(be);
          container.appendChild(holder);
        }
        continue;
      }

      const def = N.BLOCKS[entry];
      if (!def) continue;

      if (def.hat) {
        const fake = {
          id: 'palette', kind: def.kind, blocks: [],
          event: 'OnBoot', name: def.kind === 'talk' ? 'トーク' : 'あたらしいトーク', weight: 1,
          area: '', who: -1,
        };
        // 帽子ブロックの既定値（なでなでブロックなど）を反映する
        for (const argName in (def.args || {})) {
          const a = def.args[argName];
          if (a && a.def !== undefined) fake[argName] = a.def;
        }
        const se = buildScriptEl(fake, project, { noPosition: true, noTools: true });
        se.firstChild._paletteHat = def.kind;
        se.firstChild._paletteScript = fake;
        container.appendChild(se);
        continue;
      }

      const block = N.createBlock(entry);
      if (!block) continue;
      const holder = div('script');
      const be = buildBlockEl(block, project);
      be._paletteKey = entry;
      be._paletteBlock = block;
      holder.appendChild(be);
      container.appendChild(holder);
    }
  }

  N.Render = {
    buildBlockEl, buildStackEl, buildScriptEl, renderWorkspace, renderPalette,
    measureText, div, el,
  };

})(window.NASHI);
