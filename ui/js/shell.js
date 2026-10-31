/* なしスタジオ - 立ち絵とうごき（「ゴースト」タブ）と、ステージの再生
 *
 * シェルの絵の割りあて、SERIKO のうごきの編集、
 * さくらスクリプトを受けとって吹き出しと立ち絵を動かすところ。
 *
 * app.js より**あとに**読みこまれるので、app.js の中身は N.App 経由で使います。
 * 逆に app.js からここを呼ぶときは、読みこみ順の都合で N.Shell.xxx() の形になります。
 */
'use strict';

(function (N) {

  const Model = N.Model;
  const Render = N.Render;
  const App = N.App;
  const $ = N.$;
  const Player = N.Player;
  const api = App.api;
  const sleep = App.sleep;
  const balloonOf = App.balloonOf;

  // ------------------------------------------------------------ 立ち絵の絵
  // 標準の 6 枚。ここに無い番号も「追加」でふやせる。
  const SHELL_SLOTS = [
    [0, 'さくら／通常'], [1, 'さくら／笑顔'], [2, 'さくら／驚き'],
    [10, 'うにゅう／通常'], [11, 'うにゅう／笑顔'], [12, 'うにゅう／驚き'],
  ];

  function shellImages() {
    const sh = Model.project.shell || {};
    if (!Array.isArray(sh.images)) sh.images = [];
    return sh.images;
  }

  /**
   * 「表情を ◯ 番にする」の ▾ でえらべる番号。標準の 6 枚と、絵を割り当てたほかの番号。
   * who が 0 / 1 なら、そのキャラの番号（さくらは 10 より下、うにゅうは 10 から）だけ。
   */
  function surfaceChoices(who) {
    const list = SHELL_SLOTS.map(([id, label]) => [id, label]);
    for (const img of shellImages()) {
      const id = Number(img.id);
      if (!list.some(([n]) => n === id)) list.push([id, (id >= 10 ? 'うにゅう' : 'さくら') + '／自分の絵']);
    }
    return list
      .filter(([id]) => who !== 0 && who !== 1 ? true : (who === 1) === (id >= 10))
      .sort((a, b) => a[0] - b[0])
      .map(([id, label]) => [`${id}　${label}`, id]);
  }

  function shellImageOf(surfaceId) {
    return shellImages().find((x) => Number(x.id) === Number(surfaceId)) || null;
  }

  // 仮シェルは exe 側で描いてもらう。色を URL に入れてあるので、
  // 色を変えれば URL も変わり、そのまま描き直しになる。
  function shellUrl(surfaceId) {
    const img = shellImageOf(surfaceId);
    if (img && !img.path && Array.isArray(img.layers) && img.layers.length) return composedUrl(img);
    if (img && img.path) {
      return '/api/shell/file?path=' + encodeURIComponent(img.path) +
             '&v=' + encodeURIComponent(img.stamp || '');
    }
    const s = Model.project.shell || {};
    const kero = surfaceId >= 10;
    const hair = (kero ? s.keroColor : s.sakuraColor) || (kero ? '#8fd18a' : '#f08cae');
    const cloth = (kero ? s.keroCloth : s.sakuraCloth) || (kero ? '#e8b45c' : '#6e82c8');
    return '/api/shell?id=' + surfaceId +
           '&hair=' + encodeURIComponent(hair) +
           '&cloth=' + encodeURIComponent(cloth);
  }

  // ---------------------------------------------- 重ねて作る立ち絵（element）
  // そのキャラ共通の土台の手前に、その立ち絵の絵を奥から順に重ねる。書き出しでは SSP が重ねるが、
  // エディタでは画面の中で描いて、できた絵を立ち絵として使う（できるまでは、すきとおった 1 点）。
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const composed = {};   // 立ち絵の番号 → { key, url }
  const composeWatchers = new Set();   // 重ねた絵ができたら呼ぶ（開いているダイアログの見本）

  function layerUrl(l) {
    return '/api/shell/file?path=' + encodeURIComponent(l.path) + '&v=' + encodeURIComponent(l.stamp || '');
  }

  function baseLayers(who) {
    const sh = Model.project.shell || {};
    const base = sh.base || {};
    return Array.isArray(base[who]) ? base[who] : [];
  }

  function composedUrl(img) {
    const layers = baseLayers(Number(img.id) >= 10 ? 1 : 0).concat(img.layers);
    const key = JSON.stringify(layers);
    const c = composed[img.id];
    if (c && c.key === key) return c.url || BLANK;
    composed[img.id] = { key, url: '' };
    composeLayers(layers).then(({ url, missing }) => {
      const now = composed[img.id];
      if (!now || now.key !== key) return;           // そのあいだに変わった
      now.url = url;
      now.missing = missing;
      refreshShell();
      for (const fn of composeWatchers) fn();
    });
    return (c && c.url) || BLANK;                     // できるまでは前の絵のまま
  }

  // 重ねる絵のうち、読めなかった枚数（できあがるまでは 0）
  function composedMissing(surfaceId) {
    const c = composed[surfaceId];
    return (c && c.missing) || 0;
  }

  // 土台だけを重ねた見本（まだ表情の絵が無いとき、ダイアログで見せる）
  function baseOnlyUrl(who) {
    const layers = baseLayers(who);
    const key = JSON.stringify(layers);
    const slot = 'base' + who;
    const c = composed[slot];
    if (c && c.key === key) return c.url || BLANK;
    composed[slot] = { key, url: '' };
    composeLayers(layers).then(({ url, missing }) => {
      const now = composed[slot];
      if (!now || now.key !== key) return;
      now.url = url;
      now.missing = missing;
      for (const fn of composeWatchers) fn();
    });
    return (c && c.url) || BLANK;
  }

  // 絵を読みこんで、左上をそろえて重ねる。読めない絵は飛ばす。
  async function composeLayers(layers) {
    const loaded = await Promise.all(layers.map((l) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve({ im, x: l.x || 0, y: l.y || 0 });
      im.onerror = () => resolve(null);
      im.src = layerUrl(l);
    })));
    const ok = loaded.filter(Boolean);
    const missing = loaded.length - ok.length;
    if (!ok.length) return { url: '', missing };
    // SSP と同じく、はみ出したぶんは広げる（左や上へのはみ出しは切る）
    let w = 1, h = 1;
    for (const { im, x, y } of ok) {
      w = Math.max(w, x + im.naturalWidth);
      h = Math.max(h, y + im.naturalHeight);
    }
    const cv = document.createElement('canvas');
    cv.width = Math.min(w, 4096);
    cv.height = Math.min(h, 4096);
    const g = cv.getContext('2d');
    for (const { im, x, y } of ok) g.drawImage(im, x, y);
    return { url: cv.toDataURL('image/png'), missing };
  }

  function setSurface(who, surfaceId) {
    const img = document.getElementById('chara-' + (who === 1 ? 1 : 0));
    if (!img) return;
    // 用意した画像があればその番号をそのまま使う。
    // 仮シェルしか無い番号は 0/1/2（さくら）と 10/11/12（うにゅう）に丸める。
    let id = Number(surfaceId) || 0;
    if (!shellImageOf(id)) {
      if (who === 1 && id < 10) id += 10;
      if ([0, 1, 2, 10, 11, 12].indexOf(id) < 0) id = who === 1 ? 10 : 0;
    }
    const url = shellUrl(id);
    if (img.getAttribute('src') !== url) img.setAttribute('src', url);
  }

  // ゴーストタブの見本と、ためすタブの立ち絵をまとめて描き直す
  function refreshShell() {
    setSurface(0, 0);
    setSurface(1, 10);
    for (const id of [0, 1, 2, 10]) {
      const img = document.getElementById('shell-prev-' + id);
      if (img) img.setAttribute('src', shellUrl(id));
    }
    renderShellSlots();
    renderDressList();
    renderAnimList();
    renderStageDress();
  }

  // うごき（SERIKO のアニメーション）
  const ANIM_INTERVALS = [
    ['呼んだときだけ', 'never'],
    ['いつも', 'always'],
    ['ときどき', 'sometimes'],
    ['まれに', 'rarely'],
    ['◯秒に一度くらい', 'random'],
    ['◯回しゃべるごと', 'talk'],
    ['起動時に一度だけ', 'runonce'],
  ];

  // こまの重ねかた（SERIKO の描画メソッド）。名前は surfaces.txt にそのまま出ます。
  const ANIM_METHODS = [
    ['かさねる', 'overlay'],
    ['かさねる（速い）', 'overlayfast'],
    ['土台をとりかえる', 'base'],
    ['すきとおりごと上書き', 'replace'],
    ['すきまだけ重ねる', 'interpolate'],
    ['すきとおりを無視する', 'asis'],
    ['すきとおりをけずる', 'reduce'],
    ['位置だけ動かす', 'move'],
    ['かけあわせ', 'blend-multiply'],
    ['スクリーン', 'blend-screen'],
    ['オーバーレイ', 'blend-overlay'],
    ['足しあわせ', 'blend-add'],
    ['ほかのうごきを動かす', 'start'],
    ['ほかのうごきを止める', 'stop'],
    ['動く絵を差しこむ', 'import'],
  ];

  // 当たり判定のかたち
  const ANIM_SHAPES = [
    ['四角', 'rect'],
    ['だ円', 'ellipse'],
    ['丸', 'circle'],
    ['多角形', 'polygon'],
  ];

  function renderAnimList() {
    const box = $('#anim-list');
    if (!box) return;
    const anims = Model.project.animations || [];
    box.textContent = '';
    if (!anims.length) {
      box.appendChild(Render.div('hint', 'まだうごきがありません。下のボタンで作れます。'));
      return;
    }

    anims.forEach((a, idx) => {
      const row = Render.div('anim-row');

      const head = Render.div('anim-head');
      head.appendChild(Render.el('span', 'anim-id', `うごき ${a.id}`));

      const mk = (label, value, onInput, opts) => {
        const f = Render.el('label', 'field row');
        f.appendChild(Render.el('span', null, label));
        const inp = Render.el('input');
        inp.type = (opts && opts.type) || 'number';
        inp.value = value;
        if (opts && opts.min != null) inp.min = String(opts.min);
        inp.addEventListener('change', () => {
          const snap = Model.snapshot();
          onInput(inp.value);
          Model.pushUndo(snap);
          renderAnimList();
        });
        f.appendChild(inp);
        return f;
      };

      head.appendChild(mk('番号', a.id, (v) => { a.id = Math.max(0, Math.min(127, Number(v) || 0)); },
        { min: 0 }));
      head.appendChild(mk('どの立ち絵に付ける', a.base, (v) => { a.base = Number(v) || 0; }, { min: 0 }));

      const sel = Render.el('select');
      for (const [label, value] of ANIM_INTERVALS) {
        const o = Render.el('option', null, label);
        o.value = value;
        sel.appendChild(o);
      }
      sel.value = a.interval;
      sel.addEventListener('change', () => {
        const snap = Model.snapshot();
        a.interval = sel.value;
        Model.pushUndo(snap);
        renderAnimList();
      });
      const selField = Render.el('label', 'field row');
      selField.appendChild(Render.el('span', null, 'いつ動く'));
      selField.appendChild(sel);
      head.appendChild(selField);

      if (a.interval === 'random' || a.interval === 'talk') {
        head.appendChild(mk(a.interval === 'random' ? '秒' : '回', a.every,
          (v) => { a.every = Math.max(1, Number(v) || 1); }, { min: 1 }));
      }

      const del = Render.el('button', 'btn tiny', '消す');
      del.addEventListener('click', () => {
        Model.act(() => { Model.project.animations.splice(idx, 1); });
        renderAnimList();
      });
      head.appendChild(del);
      row.appendChild(head);

      // パラパラの中身（どの絵を何ミリ秒）
      const pats = Render.div('anim-pats');
      // えらんだものを owner[key] に入れる小さなドロップダウン
      const pick = (label, list, value, onPick) => {
        const f = Render.el('label', 'field row');
        f.appendChild(Render.el('span', null, label));
        const s = Render.el('select');
        for (const [text, v] of list) {
          const o = Render.el('option', null, text);
          o.value = v;
          s.appendChild(o);
        }
        s.value = value;
        s.addEventListener('change', () => {
          const snap = Model.snapshot();
          onPick(s.value);
          Model.pushUndo(snap);
          renderAnimList();
        });
        f.appendChild(s);
        return f;
      };

      a.patterns.forEach((p, k) => {
        const pr = Render.div('anim-pat');
        pr.appendChild(Render.el('span', 'anim-step', `${k + 1}`));
        pr.appendChild(pick('重ねかた', ANIM_METHODS, p.method || 'base',
          (v) => { p.method = v; }));
        // 重ねかたによって、必要な欄が変わる
        if (p.method === 'start' || p.method === 'stop') {
          pr.appendChild(mk('うごき番号', p.surface,
            (v) => { p.surface = Math.max(0, Math.min(127, Number(v) || 0)); }, { min: 0 }));
        } else {
          if (p.method === 'import') {
            pr.appendChild(mk('動く絵', p.file || '', (v) => { p.file = String(v).trim(); },
              { type: 'text' }));
          } else {
            pr.appendChild(mk('立ち絵', p.surface, (v) => { p.surface = Number(v) || 0; }, { min: 0 }));
          }
          pr.appendChild(mk('ミリ秒', p.wait, (v) => { p.wait = Math.max(0, Number(v) || 0); },
            { min: 0 }));
          // 位置ずらし。0 のままなら基準の絵とぴったり重なります。
          pr.appendChild(mk('よこ', p.x || 0, (v) => { p.x = Number(v) || 0; }));
          pr.appendChild(mk('たて', p.y || 0, (v) => { p.y = Number(v) || 0; }));
        }
        const rm = Render.el('button', 'btn tiny', '−');
        rm.title = 'このこまを消す';
        rm.addEventListener('click', () => {
          Model.act(() => { a.patterns.splice(k, 1); });
          renderAnimList();
        });
        pr.appendChild(rm);
        pats.appendChild(pr);
      });
      const addPat = Render.el('button', 'btn tiny', '＋ こまを足す');
      addPat.addEventListener('click', () => {
        Model.act(() => { a.patterns.push({ surface: a.base, wait: 200, method: 'base', x: 0, y: 0 }); });
        renderAnimList();
      });
      pats.appendChild(addPat);
      row.appendChild(pats);

      // このうごきの間だけ有効な当たり判定（animationN.collisionM）
      const cols = Render.div('anim-cols');
      (a.collisions || []).forEach((c, k) => {
        const cr = Render.div('anim-pat');
        cr.appendChild(Render.el('span', 'anim-step', 'あたり'));
        cr.appendChild(mk('名前', c.name, (v) => { c.name = String(v).trim(); }, { type: 'text' }));
        cr.appendChild(pick('かたち', ANIM_SHAPES, c.shape || 'rect', (v) => { c.shape = v; }));
        if (c.shape === 'circle') {
          cr.appendChild(mk('中心よこ', c.x1, (v) => { c.x1 = Number(v) || 0; }));
          cr.appendChild(mk('中心たて', c.y1, (v) => { c.y1 = Number(v) || 0; }));
          cr.appendChild(mk('半径', c.x2, (v) => { c.x2 = Math.max(0, Number(v) || 0); }, { min: 0 }));
        } else if (c.shape === 'polygon') {
          cr.appendChild(mk('かどの位置', c.points || '', (v) => { c.points = String(v); },
            { type: 'text' }));
          cr.appendChild(Render.el('span', 'hint', 'x,y を空白でならべます（3 つ以上）'));
        } else {
          cr.appendChild(mk('左', c.x1, (v) => { c.x1 = Number(v) || 0; }));
          cr.appendChild(mk('上', c.y1, (v) => { c.y1 = Number(v) || 0; }));
          cr.appendChild(mk('右', c.x2, (v) => { c.x2 = Number(v) || 0; }));
          cr.appendChild(mk('下', c.y2, (v) => { c.y2 = Number(v) || 0; }));
        }
        const rm = Render.el('button', 'btn tiny', '−');
        rm.title = 'この当たり判定を消す';
        rm.addEventListener('click', () => {
          Model.act(() => { a.collisions.splice(k, 1); });
          renderAnimList();
        });
        cr.appendChild(rm);
        cols.appendChild(cr);
      });
      const addCol = Render.el('button', 'btn tiny', '＋ 当たり判定を足す');
      addCol.title = 'このうごきが動いている間だけ、ここを触れるようにします';
      addCol.addEventListener('click', () => {
        Model.act(() => {
          if (!Array.isArray(a.collisions)) a.collisions = [];
          a.collisions.push({
            name: 'Anim' + a.id, shape: 'rect',
            x1: 0, y1: 0, x2: 60, y2: 60, points: '',
          });
        });
        renderAnimList();
      });
      cols.appendChild(addCol);
      row.appendChild(cols);

      if (!a.patterns.length) {
        row.appendChild(Render.div('hint', 'こまが無いので、書き出しても動きません。'));
      }
      box.appendChild(row);
    });
  }

  // ------------------------------------------------------------ 着せ替え
  const WHO_LABELS = [['さくら', 0], ['うにゅう', 1]];
  const DRESS_RULES = [['1 つまで（はずせる）', ''], ['必ず 1 つ', 'mustselect'], ['いくつでも', 'multiple']];

  function dressup() {
    const p = Model.project;
    if (!p.dressup || typeof p.dressup !== 'object') p.dressup = { parts: [], rules: {} };
    if (!Array.isArray(p.dressup.parts)) p.dressup.parts = [];
    if (!p.dressup.rules || typeof p.dressup.rules !== 'object') p.dressup.rules = {};
    return p.dressup;
  }

  function renderDressList() {
    const box = $('#dress-list');
    if (!box) return;
    const d = dressup();
    box.textContent = '';
    if (!d.parts.length) {
      box.appendChild(Render.div('hint', 'まだ部品がありません。下のボタンで足せます。'));
      return;
    }

    // うごきの欄と同じ作り（変えたら元にもどすに積んで、描きなおす）
    const mk = (label, value, onInput, opts) => {
      const f = Render.el('label', 'field row');
      f.appendChild(Render.el('span', null, label));
      const inp = Render.el('input');
      inp.type = (opts && opts.type) || 'number';
      if (inp.type === 'checkbox') inp.checked = !!value; else inp.value = value;
      inp.addEventListener('change', () => {
        const snap = Model.snapshot();
        onInput(inp.type === 'checkbox' ? inp.checked : inp.value);
        Model.pushUndo(snap);
        refreshShell();
      });
      f.appendChild(inp);
      return f;
    };
    const pick = (label, list, value, onPick) => {
      const f = Render.el('label', 'field row');
      f.appendChild(Render.el('span', null, label));
      const s = Render.el('select');
      for (const [text, v] of list) {
        const o = Render.el('option', null, text);
        o.value = v;
        s.appendChild(o);
      }
      s.value = value;
      s.addEventListener('change', () => {
        const snap = Model.snapshot();
        onPick(s.value);
        Model.pushUndo(snap);
        refreshShell();
      });
      f.appendChild(s);
      return f;
    };

    d.parts.forEach((part, idx) => {
      const row = Render.div('anim-row');
      const head = Render.div('anim-head');
      head.appendChild(Render.el('span', 'anim-id', `部品 ${idx + 1}`));
      head.appendChild(pick('キャラ', WHO_LABELS, String(part.who), (v) => { part.who = Number(v) === 1 ? 1 : 0; }));
      head.appendChild(mk('カテゴリ', part.category, (v) => { part.category = String(v).trim(); }, { type: 'text' }));
      head.appendChild(mk('名前', part.name, (v) => { part.name = String(v).trim(); }, { type: 'text' }));
      head.appendChild(mk('よこ', part.x, (v) => { part.x = Math.round(Number(v) || 0); }));
      head.appendChild(mk('たて', part.y, (v) => { part.y = Math.round(Number(v) || 0); }));
      head.appendChild(mk('はじめからつける', part.on, (v) => { part.on = !!v; }, { type: 'checkbox' }));

      const file = Render.el('span', 'slot-file' + (part.path ? '' : ' is-auto'),
        part.path ? part.path.split(/[\\/]/).pop() : '絵がありません');
      if (part.path) {
        file.title = part.path;
        // ファイルが動いた・消えたときは、立ち絵の行と同じように知らせる
        const probe = new Image();
        probe.addEventListener('error', () => {
          file.textContent = 'ファイルが見つかりません';
          file.style.color = '#e2664a';
        });
        probe.src = dressUrl(part);
      }
      head.appendChild(file);
      const pickBtn = Render.el('button', 'btn tiny', part.path ? '変える' : 'えらぶ');
      pickBtn.addEventListener('click', () => pickDressImage(part.id));
      head.appendChild(pickBtn);
      const del = Render.el('button', 'btn tiny', '消す');
      del.addEventListener('click', () => {
        Model.act(() => { dressup().parts.splice(idx, 1); });
        refreshShell();
      });
      head.appendChild(del);
      row.appendChild(head);
      box.appendChild(row);
    });

    // カテゴリごとの決まり（SSP の着せ替えメニューで、どうえらべるか）
    const cats = [];
    for (const p of d.parts) {
      const key = p.who + '/' + p.category;
      if (p.category && cats.indexOf(key) < 0) cats.push(key);
    }
    if (cats.length) {
      // 部品の行と同じ枠に入れる（説明＋その下に 1 カテゴリ 1 行）。
      // 見出しを部品の番号と同じ見た目にすると、部品がもう 1 つあるように見えるので、説明の書きかたにする。
      const ruleRow = Render.div('anim-row');
      ruleRow.appendChild(Render.div('hint', 'カテゴリごとのえらびかた（SSP の着せ替えメニューで、どうえらべるか）'));
      const rules = Render.div('anim-pats');
      for (const key of cats) {
        const [w, ...rest] = key.split('/');
        const cat = rest.join('/');
        const r = Render.div('anim-pat');
        r.appendChild(Render.el('span', 'anim-step', `${Number(w) === 1 ? 'うにゅう' : 'さくら'}：${cat}`));
        r.appendChild(pick('えらびかた', DRESS_RULES, d.rules[key] || '', (v) => {
          if (v) d.rules[key] = v; else delete d.rules[key];
        }));
        rules.appendChild(r);
      }
      ruleRow.appendChild(rules);
      box.appendChild(ruleRow);
    }
  }

  // 部品の絵。えらびなおすたびに stamp を変えて、同じパスでも描きなおさせる（立ち絵と同じ）
  function dressUrl(part) {
    return '/api/shell/file?path=' + encodeURIComponent(part.path) + '&v=' + encodeURIComponent(part.stamp || '');
  }

  function addDressPart() {
    Model.act(() => {
      const d = dressup();
      let id = 200;
      while (d.parts.some((p) => p.id === id)) id++;
      d.parts.push({ id, who: 0, category: '服', name: '部品' + (d.parts.length + 1), path: '', x: 0, y: 0, on: true });
    });
    refreshShell();
  }

  async function pickDressImage(partId) {
    let r;
    try {
      r = await api('/api/shell/pick', { method: 'POST', body: {} });
    } catch (e) {
      App.toast(e.message, true);
      return;
    }
    const f = (r.files || [])[0];
    if (!f) return;
    Model.act(() => {
      const part = dressup().parts.find((p) => p.id === partId);
      if (part) { part.path = f.path; part.stamp = String(Date.now()); }
    });
    refreshShell();
    App.toast('画像を割り当てました');
  }

  // ためすの立ち絵に、つけている部品を重ねる。on は { 部品の id: true/false }（無ければ「はじめから」）
  let dressOn = null;
  function renderStageDress() {
    hookStageDress();
    for (const who of [0, 1]) {
      const chara = document.getElementById('chara-' + who);
      if (!chara) continue;
      const stage = chara.parentElement;
      for (const old of stage.querySelectorAll(`.dress-layer[data-who="${who}"]`)) old.remove();
      if (!chara.naturalHeight) continue;
      const scale = chara.clientHeight / chara.naturalHeight;
      let anchor = chara;           // 書いた順に、上へ重ねていく
      for (const part of dressup().parts) {
        if (part.who !== who || !part.path) continue;
        const on = dressOn && part.id in dressOn ? dressOn[part.id] : part.on;
        if (!on) continue;
        const layer = Render.el('img', 'dress-layer');
        layer.dataset.who = String(who);
        layer.alt = '';
        layer.draggable = false;
        layer.src = dressUrl(part);
        layer.style.left = (chara.offsetLeft + part.x * scale) + 'px';
        layer.style.top = (chara.offsetTop + part.y * scale) + 'px';
        layer.style.transform = `scale(${scale})`;
        // 重なり順は、立ち絵のすぐ上（吹き出しより下）
        anchor.after(layer);
        anchor = layer;
      }
    }
  }
  // 立ち絵の絵が変わると大きさも変わるので、読みこみ終わるたびに重ねなおす。
  // 画面ができてから（はじめて描くときに）1 回だけつなぐ。
  let stageHooked = false;
  function hookStageDress() {
    if (stageHooked) return;
    stageHooked = true;
    for (const who of [0, 1]) {
      const chara = document.getElementById('chara-' + who);
      if (chara) chara.addEventListener('load', renderStageDress);
    }
  }

  function addAnimation() {
    Model.act(() => {
      const anims = Model.project.animations;
      let id = 0;
      while (anims.some((a) => a.id === id)) id++;
      anims.push({
        id, base: 0, interval: 'sometimes', every: 4,
        patterns: [
          { surface: 1, wait: 200, method: 'base', x: 0, y: 0 },
          { surface: 0, wait: 200, method: 'base', x: 0, y: 0 },
        ],
      });
    });
    renderAnimList();
  }

  function renderShellSlots() {
    const box = $('#shell-slots');
    if (!box) return;
    const images = shellImages();
    const extra = images
      .map((x) => Number(x.id))
      .filter((id) => !SHELL_SLOTS.some(([sid]) => sid === id))
      .sort((a, b) => a - b);
    const rows = SHELL_SLOTS.concat(extra.map((id) => [id, id >= 10 ? 'うにゅう' : 'さくら']));

    box.textContent = '';
    for (const [id, label] of rows) {
      const img = shellImageOf(id);
      const row = Render.div('shell-slot');

      const thumb = Render.div('thumb');
      const pic = Render.el('img');
      pic.src = shellUrl(id);
      pic.alt = label;
      thumb.appendChild(pic);
      row.appendChild(thumb);

      const info = Render.div('info');
      info.appendChild(Render.div('slot-name', `${label}（${id} 番）`));
      const layered = !!(img && !img.path && img.layers && img.layers.length);
      const file = Render.el('span', 'slot-file' + (img ? '' : ' is-auto'),
        layered ? `絵を重ねて作る（${img.layers.length} 枚）` : (img ? (img.name || img.path) : '自動生成'));
      if (layered && composedMissing(id)) {
        // 重ねる絵が動いた・消えたときも、1 枚の絵の行と同じように知らせる
        file.textContent = 'ファイルが見つかりません';
        file.style.color = '#e2664a';
      }
      if (img && !layered) {
        file.title = img.path;
        // ファイルが動いた・消えたときは、ここで気づけるようにする
        pic.addEventListener('error', () => {
          file.textContent = 'ファイルが見つかりません';
          file.style.color = '#e2664a';
          thumb.textContent = '？';
        });
      }
      info.appendChild(file);
      row.appendChild(info);

      const pickBtn = Render.el('button', 'btn tiny', img && !layered ? '変える' : 'えらぶ');
      pickBtn.title = '1 枚の PNG を立ち絵にする';
      pickBtn.addEventListener('click', () => pickShellImage(id));
      row.appendChild(pickBtn);

      const composeBtn = Render.el('button', 'btn tiny', '重ねて作る');
      composeBtn.title = 'キャラ共通の土台の上に、この表情の絵を重ねて立ち絵を作る';
      composeBtn.addEventListener('click', () => openComposeEditor(id, `${label}（${id} 番）`));
      row.appendChild(composeBtn);

      if (img) {
        const n = (img.collisions || []).length;
        const hitBtn = Render.el('button', 'btn tiny', n ? `当たり判定（${n}）` : '当たり判定');
        hitBtn.title = n ? 'この絵に描いた当たり判定を直す' : 'この絵に当たり判定を描く（描かなければ自動で付けます）';
        hitBtn.addEventListener('click', () => openHitAreaEditor(id, `${label}（${id} 番）`));
        row.appendChild(hitBtn);
      }

      if (img) {
        const clear = Render.el('button', 'btn tiny', 'もどす');
        clear.title = '自動生成にもどす';
        clear.addEventListener('click', () => {
          Model.act(() => {
            const list = shellImages();
            const i = list.findIndex((x) => Number(x.id) === Number(id));
            if (i >= 0) list.splice(i, 1);
          });
          refreshShell();
        });
        row.appendChild(clear);
      }
      box.appendChild(row);
    }
  }

  // ------------------------------------------------- 立ち絵の当たり判定を描く
  // 四角は絵の上をドラッグして描く（つかんで動かす・かどで大きさを変える）。
  // 丸・だ円・多角形は、うごきの当たり判定と同じ数字の欄で入れて、絵の上には形だけ見せる。
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // 当たり判定の名前の見せかた。触れたときのブロックの「どこ」と同じ言葉にする（Head → あたま）。
  const areaLabel = (name) => ((N.AREAS.find(([, v]) => v && v === name) || [])[0]) || name;

  function openHitAreaEditor(surfaceId, title) {
    let img = shellImageOf(surfaceId);
    if (!img) return;
    if (!Array.isArray(img.collisions)) img.collisions = [];
    let selected = img.collisions.length ? 0 : -1;
    let natW = Number(img.w) || 0;
    let natH = Number(img.h) || 0;

    const body = Render.div('hit-editor');
    body.appendChild(Render.el('p', 'hint',
      '絵の上をドラッグすると、四角の当たり判定を足せます。1 つも作らなければ、書き出すときに自動で付けます。'));

    const stage = Render.div('hit-stage');
    const pic = Render.el('img');
    pic.src = shellUrl(surfaceId);
    pic.alt = title;
    pic.draggable = false;
    stage.appendChild(pic);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'hit-overlay');
    stage.appendChild(svg);
    body.appendChild(stage);

    const rows = Render.div('anim-cols');
    body.appendChild(rows);

    // ---- 絵の上の形
    const shapeEl = (c) => {
      let el;
      if (c.shape === 'ellipse') {
        el = document.createElementNS(SVG_NS, 'ellipse');
        el.setAttribute('cx', (c.x1 + c.x2) / 2);
        el.setAttribute('cy', (c.y1 + c.y2) / 2);
        el.setAttribute('rx', Math.abs(c.x2 - c.x1) / 2);
        el.setAttribute('ry', Math.abs(c.y2 - c.y1) / 2);
      } else if (c.shape === 'circle') {
        el = document.createElementNS(SVG_NS, 'circle');
        el.setAttribute('cx', c.x1);
        el.setAttribute('cy', c.y1);
        el.setAttribute('r', Math.max(0, c.x2));
      } else if (c.shape === 'polygon') {
        el = document.createElementNS(SVG_NS, 'polygon');
        const nums = String(c.points || '').match(/-?\d+/g) || [];
        const pts = [];
        for (let k = 0; k + 1 < nums.length; k += 2) pts.push(nums[k] + ',' + nums[k + 1]);
        el.setAttribute('points', pts.join(' '));
      } else {
        el = document.createElementNS(SVG_NS, 'rect');
        el.setAttribute('x', Math.min(c.x1, c.x2));
        el.setAttribute('y', Math.min(c.y1, c.y2));
        el.setAttribute('width', Math.abs(c.x2 - c.x1));
        el.setAttribute('height', Math.abs(c.y2 - c.y1));
      }
      return el;
    };

    function drawShapes() {
      svg.textContent = '';
      if (natW && natH) svg.setAttribute('viewBox', `0 0 ${natW} ${natH}`);
      // 線の太さと文字の大きさは、表示の倍率に合わせる（小さく見せても細くなりすぎない）
      const scale = natW && pic.clientWidth ? natW / pic.clientWidth : 1;
      img.collisions.forEach((c, k) => {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'hit-shape' + (k === selected ? ' is-selected' : ''));
        const el = shapeEl(c);
        el.setAttribute('stroke-width', 2 * scale);
        el.dataset.index = String(k);
        g.appendChild(el);
        const tx = document.createElementNS(SVG_NS, 'text');
        tx.setAttribute('x', Math.min(c.x1, c.shape === 'rect' || c.shape === 'ellipse' ? c.x2 : c.x1) + 4 * scale);
        tx.setAttribute('y', Math.min(c.y1, c.shape === 'rect' || c.shape === 'ellipse' ? c.y2 : c.y1) + 14 * scale);
        tx.setAttribute('font-size', 12 * scale);
        tx.textContent = areaLabel(c.name);
        g.appendChild(tx);
        if (k === selected && c.shape === 'rect') {
          for (const [hx, hy] of [[c.x1, c.y1], [c.x2, c.y1], [c.x1, c.y2], [c.x2, c.y2]]) {
            const h = document.createElementNS(SVG_NS, 'rect');
            const s = 8 * scale;
            h.setAttribute('class', 'hit-handle');
            h.setAttribute('x', hx - s / 2);
            h.setAttribute('y', hy - s / 2);
            h.setAttribute('width', s);
            h.setAttribute('height', s);
            h.dataset.corner = (hx === c.x1 ? 'l' : 'r') + (hy === c.y1 ? 't' : 'b');
            g.appendChild(h);
          }
        }
        svg.appendChild(g);
      });
    }

    // ---- 下の欄（うごきの当たり判定と同じ並び）
    const mk = (label, value, onInput, opts) => {
      const f = Render.el('label', 'field row');
      f.appendChild(Render.el('span', null, label));
      const inp = Render.el('input');
      inp.type = (opts && opts.type) || 'number';
      inp.value = value;
      if (opts && opts.min != null) inp.min = String(opts.min);
      inp.addEventListener('change', () => {
        const snap = Model.snapshot();
        onInput(inp.value);
        Model.pushUndo(snap);
        redraw();
      });
      f.appendChild(inp);
      return f;
    };
    const pick = (label, list, value, onPick) => {
      const f = Render.el('label', 'field row');
      f.appendChild(Render.el('span', null, label));
      const s = Render.el('select');
      for (const [text, v] of list) {
        const o = Render.el('option', null, text);
        o.value = v;
        s.appendChild(o);
      }
      s.value = value;
      s.addEventListener('change', () => {
        const snap = Model.snapshot();
        onPick(s.value);
        Model.pushUndo(snap);
        redraw();
      });
      f.appendChild(s);
      return f;
    };

    function renderRows() {
      rows.textContent = '';
      img.collisions.forEach((c, k) => {
        const cr = Render.div('anim-pat' + (k === selected ? ' is-selected' : ''));
        // クリックでも、Tab で欄に入っても、その形をえらんだことにする
        const choose = () => { if (selected !== k) { selected = k; drawShapes(); markRows(); } };
        cr.addEventListener('pointerdown', choose);
        cr.addEventListener('focusin', choose);
        cr.appendChild(Render.el('span', 'anim-step', 'あたり'));
        // 名前は、触れたときのブロックの「どこ」と同じ言葉でえらぶ。ほかの名前は自分で書ける。
        const known = N.AREAS.some(([, v]) => v && v === c.name);
        const nameOpts = N.AREAS.filter(([, v]) => v).concat(
          known ? [] : [[c.name, c.name]], [['その他（自分で書く）', '__custom__']]);
        cr.appendChild(pick('名前', nameOpts, c.name, (v) => {
          if (v !== '__custom__') { c.name = v; return; }
          const typed = prompt('当たり判定の名前は？（英数字がおすすめです）', known ? '' : c.name);
          // 空にすると、書き出しでも読みなおしでも消えてしまうので、前の名前のままにする
          if (typed != null && typed.trim()) c.name = typed.trim().replace(/,/g, ' ');
        }));
        cr.appendChild(pick('かたち', ANIM_SHAPES, c.shape || 'rect', (v) => { c.shape = v; }));
        const int = (v) => Math.round(Number(v) || 0);
        if (c.shape === 'circle') {
          cr.appendChild(mk('中心よこ', c.x1, (v) => { c.x1 = int(v); }));
          cr.appendChild(mk('中心たて', c.y1, (v) => { c.y1 = int(v); }));
          cr.appendChild(mk('半径', c.x2, (v) => { c.x2 = Math.max(0, int(v)); }, { min: 0 }));
        } else if (c.shape === 'polygon') {
          cr.appendChild(mk('かどの位置', c.points || '', (v) => { c.points = String(v); }, { type: 'text' }));
          cr.appendChild(Render.el('span', 'hint', 'x,y を空白でならべます（3 つ以上）'));
        } else {
          cr.appendChild(mk('左', c.x1, (v) => { c.x1 = int(v); }));
          cr.appendChild(mk('上', c.y1, (v) => { c.y1 = int(v); }));
          cr.appendChild(mk('右', c.x2, (v) => { c.x2 = int(v); }));
          cr.appendChild(mk('下', c.y2, (v) => { c.y2 = int(v); }));
        }
        const rm = Render.el('button', 'btn tiny', '−');
        rm.title = 'この当たり判定を消す';
        rm.addEventListener('click', () => {
          Model.act(() => { img.collisions.splice(k, 1); });
          if (selected >= img.collisions.length) selected = img.collisions.length - 1;
          redraw();
        });
        cr.appendChild(rm);
        rows.appendChild(cr);
      });
      const add = Render.el('button', 'btn tiny', '＋ 当たり判定を足す');
      add.addEventListener('click', () => {
        const w = natW || 100, h = natH || 100;
        addCollision({ x1: Math.round(w * 0.25), y1: Math.round(h * 0.1),
          x2: Math.round(w * 0.75), y2: Math.round(h * 0.3) });
      });
      rows.appendChild(add);
    }
    function markRows() {
      [...rows.querySelectorAll('.anim-pat')].forEach((r, k) => r.classList.toggle('is-selected', k === selected));
    }
    function redraw() { drawShapes(); renderRows(); }

    // まだ使われていない「どこ」の名前（あたま → かお → …）。全部使っていれば Area1, Area2 …
    function nextName() {
      const used = new Set(img.collisions.map((c) => c.name));
      for (const [, value] of N.AREAS) if (value && !used.has(value)) return value;
      let n = 1;
      while (used.has('Area' + n)) n++;
      return 'Area' + n;
    }
    function addCollision(box) {
      Model.act(() => {
        img.collisions.push(Object.assign({ name: nextName(), shape: 'rect', points: '' }, box));
      });
      selected = img.collisions.length - 1;
      redraw();
    }

    // ---- ドラッグ（画面の座標 → 絵の画素）
    const toImage = (e) => {
      const r = pic.getBoundingClientRect();
      const sx = natW / Math.max(1, r.width), sy = natH / Math.max(1, r.height);
      const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
      return { x: clamp((e.clientX - r.left) * sx, natW), y: clamp((e.clientY - r.top) * sy, natH) };
    };
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (!natW || !natH || e.button !== 0) return;
      e.preventDefault();
      const p = toImage(e);
      const t = e.target;
      const snap = Model.snapshot();
      if (t.dataset && t.dataset.corner && selected >= 0) {
        drag = { mode: 'resize', corner: t.dataset.corner, c: img.collisions[selected], snap };
      } else if (t.dataset && t.dataset.index != null) {
        selected = Number(t.dataset.index);
        const c = img.collisions[selected];
        drag = c.shape === 'rect' ? { mode: 'move', c, from: p, start: Object.assign({}, c), snap } : null;
      } else {
        drag = { mode: 'new', from: p, temp: { name: nextName(), shape: 'rect', x1: p.x, y1: p.y, x2: p.x, y2: p.y, points: '' } };
        img.collisions.push(drag.temp);   // ドラッグ中だけ仮に入れる（離したときに 1 回の操作として積む）
        selected = img.collisions.length - 1;
      }
      // 先につかんでから描きなおす（押した形を消してからつかむと、ドラッグが届かなくなる）
      if (drag) svg.setPointerCapture(e.pointerId);
      drawShapes();
      markRows();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = toImage(e);
      if (drag.mode === 'new') {
        drag.temp.x2 = p.x; drag.temp.y2 = p.y;
      } else if (drag.mode === 'move') {
        const dx = p.x - drag.from.x, dy = p.y - drag.from.y;
        const w = drag.start.x2 - drag.start.x1, h = drag.start.y2 - drag.start.y1;
        const x1 = Math.max(0, Math.min(natW - Math.abs(w), drag.start.x1 + dx));
        const y1 = Math.max(0, Math.min(natH - Math.abs(h), drag.start.y1 + dy));
        drag.c.x1 = x1; drag.c.y1 = y1; drag.c.x2 = x1 + w; drag.c.y2 = y1 + h;
      } else if (drag.mode === 'resize') {
        if (drag.corner[0] === 'l') drag.c.x1 = p.x; else drag.c.x2 = p.x;
        if (drag.corner[1] === 't') drag.c.y1 = p.y; else drag.c.y2 = p.y;
      }
      drawShapes();
    });
    const endDrag = () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.mode === 'new') {
        img.collisions.pop();
        const box = {
          x1: Math.min(d.temp.x1, d.temp.x2), y1: Math.min(d.temp.y1, d.temp.y2),
          x2: Math.max(d.temp.x1, d.temp.x2), y2: Math.max(d.temp.y1, d.temp.y2),
        };
        // 小さすぎるもの（ただのクリック）は足さない
        if (box.x2 - box.x1 >= 4 && box.y2 - box.y1 >= 4) addCollision(box);
        else { selected = Math.min(selected, img.collisions.length - 1); redraw(); }
        return;
      }
      // 左上・右下の順にそろえる
      const c = d.c;
      [c.x1, c.x2] = [Math.min(c.x1, c.x2), Math.max(c.x1, c.x2)];
      [c.y1, c.y2] = [Math.min(c.y1, c.y2), Math.max(c.y1, c.y2)];
      Model.pushUndo(d.snap);
      redraw();
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    pic.addEventListener('load', () => {
      natW = pic.naturalWidth || natW;
      natH = pic.naturalHeight || natH;
      drawShapes();
    });
    pic.addEventListener('error', () => {
      // 立ち絵の行と同じ文と色で知らせる
      const msg = Render.div('hint', 'ファイルが見つかりません');
      msg.style.color = '#e2664a';
      stage.replaceChildren(msg);
    });

    // 元にもどす／やり直すと、プロジェクトがまるごと入れかわる。開いている間はそれに付いていく
    const follow = () => {
      const fresh = shellImageOf(surfaceId);
      if (!fresh || fresh === img) return;
      img = fresh;
      if (!Array.isArray(img.collisions)) img.collisions = [];
      if (selected >= img.collisions.length) selected = img.collisions.length - 1;
      redraw();
    };
    Model.onChange(follow);
    // 重ねて作る立ち絵は、絵ができあがるまで 1 点の仮の絵なので、できたら差しかえる
    // （差しかえると load で大きさを読みなおす）
    let composeWarn = null;
    const onComposed = () => {
      const u = shellUrl(surfaceId);
      if (pic.getAttribute('src') !== u) pic.src = u;
      // 重ねる絵が読めないときは、1 枚の絵のときと同じ文と色で知らせる
      if (composedMissing(surfaceId) && !composeWarn) {
        composeWarn = Render.div('hint', 'ファイルが見つかりません');
        composeWarn.style.color = '#e2664a';
        stage.after(composeWarn);
      }
    };
    composeWatchers.add(onComposed);

    renderRows();
    drawShapes();
    N.Dialog.modal(`${title}の当たり判定`, body, [{ label: '閉じる' }], {
      wide: true,
      // 閉じたら、ボタンの「（3）」などを描きなおす
      onClose: () => {
        Model.offChange(follow);
        composeWatchers.delete(onComposed);
        refreshShell();
      },
    });
    onComposed();                        // もうできあがっている絵なら、ここで知らせる
    requestAnimationFrame(drawShapes);   // 大きさが決まってから、線の太さを合わせなおす
  }

  // ------------------------------------------- 立ち絵を絵から重ねて作る（ダイアログ）
  function openComposeEditor(surfaceId, title) {
    const who = Number(surfaceId) >= 10 ? 1 : 0;
    const whoName = who === 1 ? 'うにゅう' : 'さくら';

    const body = Render.div('compose-editor');
    body.appendChild(Render.el('p', 'hint',
      `${whoName}の土台（すべての表情で共通）の手前に、この表情の絵を、奥から順に重ねます。` +
      '土台を直すと、重ねて作ったすべての表情に効きます。この表情の絵が 1 枚もなければ、自動生成にもどります。'));
    const stage = Render.div('hit-stage');
    const pic = Render.el('img');
    pic.alt = title;
    pic.draggable = false;
    stage.appendChild(pic);
    body.appendChild(stage);
    const warn = Render.div('hint');
    warn.style.color = '#e2664a';
    body.appendChild(warn);
    const lists = Render.div('');
    body.appendChild(lists);

    const own = () => {
      const img = shellImageOf(surfaceId);
      return img && !img.path && Array.isArray(img.layers) ? img.layers : null;
    };
    const base = () => {
      const sh = Model.project.shell;
      if (!sh.base || typeof sh.base !== 'object') sh.base = { 0: [], 1: [] };
      if (!Array.isArray(sh.base[who])) sh.base[who] = [];
      return sh.base[who];
    };

    // この表情の絵の並びを用意する（1 枚の絵だった立ち絵は、addLayers が先に確かめてある）
    function ensureOwn() {
      let img = shellImageOf(surfaceId);
      if (img && img.path) {
        img.path = '';
        img.name = '';
        img.layers = [];
      }
      if (!img) {
        img = { id: Number(surfaceId), path: '', name: '', w: 0, h: 0, layers: [], collisions: [] };
        shellImages().push(img);
        shellImages().sort((a, b) => Number(a.id) - Number(b.id));
      }
      if (!Array.isArray(img.layers)) img.layers = [];
      return img.layers;
    }
    // この表情の絵が無くなったら、立ち絵の登録ごと外す（自動生成にもどる）
    function dropIfEmpty() {
      const img = shellImageOf(surfaceId);
      if (img && !img.path && (!img.layers || !img.layers.length)) {
        const list = shellImages();
        list.splice(list.indexOf(img), 1);
      }
    }

    async function addLayers(toBase) {
      // 1 枚の絵の立ち絵を重ねて作るほうへ切りかえるときは、ファイルをえらぶ前に確かめる
      const cur = shellImageOf(surfaceId);
      if (!toBase && cur && cur.path &&
          !confirm(`「${cur.name || cur.path}」の 1 枚の絵をやめて、絵を重ねて作りますか？`)) {
        return;
      }
      let r;
      try {
        r = await api('/api/shell/pick', { method: 'POST', body: {} });
      } catch (e) {
        App.toast(e.message, true);
        return;
      }
      const files = r.files || [];
      if (!files.length) return;
      Model.act(() => {
        const list = toBase ? base() : ensureOwn();
        for (const f of files) list.push({ path: f.path, x: 0, y: 0, stamp: String(Date.now()) });
      });
      refreshShell();
      render();
      App.toast(files.length > 1 ? `${files.length} 枚を割り当てました` : '画像を割り当てました');
    }

    // うごきの欄と同じ作り（変えたら元にもどすに積む）
    const mk = (label, value, onInput) => {
      const f = Render.el('label', 'field row');
      f.appendChild(Render.el('span', null, label));
      const inp = Render.el('input');
      inp.type = 'number';
      inp.value = value;
      inp.addEventListener('change', () => {
        const snap = Model.snapshot();
        onInput(inp.value);
        Model.pushUndo(snap);
        refreshShell();
        render();
      });
      f.appendChild(inp);
      return f;
    };

    function layerRows(list, isBase) {
      const box = Render.div('anim-pats');
      box.appendChild(Render.el('p', 'hint', isBase ? `${whoName}の土台（すべての表情で共通）` : 'この表情で重ねる絵'));
      (list || []).forEach((l, k) => {
        const r = Render.div('anim-pat');
        r.appendChild(Render.el('span', 'anim-step', `${k + 1}`));
        const name = Render.el('span', 'slot-file', l.path.split(/[\\/]/).pop());
        name.title = l.path;
        const probe = new Image();
        probe.addEventListener('error', () => {
          name.textContent = 'ファイルが見つかりません';
          name.style.color = '#e2664a';
        });
        probe.src = layerUrl(l);
        r.appendChild(name);
        r.appendChild(mk('よこ', l.x, (v) => { l.x = Math.round(Number(v) || 0); }));
        r.appendChild(mk('たて', l.y, (v) => { l.y = Math.round(Number(v) || 0); }));
        const move = (d, label, tip) => {
          const b = Render.el('button', 'btn tiny', label);
          b.title = tip;
          b.disabled = k + d < 0 || k + d >= list.length;
          b.addEventListener('click', () => {
            Model.act(() => { const [it] = list.splice(k, 1); list.splice(k + d, 0, it); });
            refreshShell();
            render();
          });
          return b;
        };
        // 並びは奥の絵から順なので、ボタンは重なりの向きで書く（画面の上下とまちがえないように）
        r.appendChild(move(-1, '奥へ', '1 つ奥へ'));
        r.appendChild(move(1, '手前へ', '1 つ手前へ'));
        const rm = Render.el('button', 'btn tiny', '−');
        rm.title = 'この絵を消す';
        rm.addEventListener('click', () => {
          Model.act(() => { list.splice(k, 1); if (!isBase) dropIfEmpty(); });
          refreshShell();
          render();
        });
        r.appendChild(rm);
        box.appendChild(r);
      });
      const add = Render.el('button', 'btn tiny', '＋ 絵を足す');
      add.addEventListener('click', () => addLayers(isBase));
      box.appendChild(add);
      return box;
    }

    function render() {
      lists.textContent = '';
      lists.appendChild(layerRows(base(), true));
      lists.appendChild(layerRows(own(), false));
      const img = shellImageOf(surfaceId);
      // この表情の絵が無いうちは、土台だけの見本を出す（わざと。いま直している土台が見えるように）
      const layered = img && !img.path && img.layers && img.layers.length;
      pic.src = layered ? shellUrl(surfaceId) : (base().length ? baseOnlyUrl(who) : shellUrl(surfaceId));
      // 読めない絵があれば、当たり判定の編集と同じように知らせる
      const missing = layered ? composedMissing(surfaceId) : (base().length ? composedMissing('base' + who) : 0);
      warn.textContent = missing ? 'ファイルが見つかりません' : '';
      warn.style.display = missing ? '' : 'none';     // 何も無いときは、すきまも作らない
    }

    // 重ねた絵ができたとき・元にもどしたときに、見本と並びを描きなおす
    const onComposed = () => render();
    const onModel = () => render();
    composeWatchers.add(onComposed);
    Model.onChange(onModel);
    render();
    N.Dialog.modal(`${title}を重ねて作る`, body, [{ label: '閉じる' }], {
      wide: true,
      onClose: () => {
        composeWatchers.delete(onComposed);
        Model.offChange(onModel);
        refreshShell();
      },
    });
  }

  async function pickShellImage(surfaceId) {
    // 重ねて作った立ち絵を 1 枚の絵にするときは、ファイルをえらぶ前に確かめる
    const cur = shellImageOf(surfaceId);
    if (cur && !cur.path && cur.layers && cur.layers.length &&
        !confirm('重ねて作った絵をやめて、1 枚の絵にしますか？')) {
      return;
    }
    let r;
    try {
      r = await api('/api/shell/pick', { method: 'POST', body: {} });
    } catch (e) {
      App.toast(e.message, true);
      return;
    }
    const files = r.files || [];
    if (!files.length) return;

    // 複数えらんだときは、この番号から順にあてはめる（0,1,2 / 10,11,12 の並び）
    const order = SHELL_SLOTS.map(([id]) => id);
    let at = order.indexOf(Number(surfaceId));
    Model.act(() => {
      const list = shellImages();
      files.forEach((f, n) => {
        let id = Number(surfaceId);
        if (n > 0) {
          if (at < 0 || at + n >= order.length) id = Number(surfaceId) + n;
          else id = order[at + n];
        }
        const one = {
          id, path: f.path, name: f.name, w: f.width, h: f.height, stamp: String(Date.now()), collisions: [],
        };
        const i = list.findIndex((x) => Number(x.id) === id);
        // 絵を描きなおしただけのことが多いので、描いた当たり判定は引きつぐ
        if (i >= 0) { one.collisions = list[i].collisions || []; list[i] = one; } else list.push(one);
      });
      list.sort((a, b) => Number(a.id) - Number(b.id));
    });
    refreshShell();
    App.toast(files.length > 1 ? `${files.length} 枚を割り当てました` : '画像を割り当てました');
  }

  function resetStage() {
    for (const id of ['balloon-0', 'balloon-1']) {
      const b = document.getElementById(id);
      b.querySelector('.balloon-text').textContent = '';
      b.classList.add('is-empty');
    }
    $('#balloon-0 .balloon-name').textContent = Model.project.meta.sakuraName || 'さくら';
    $('#balloon-1 .balloon-name').textContent = Model.project.meta.keroName || 'うにゅう';
    refreshShell();
  }

  async function playSakura(script) {
    const token = ++App.playToken;
    resetStage();
    if (!script) return;
    const ops = Player.parseSakura(script);
    let who = 0;
    let target = balloonOf(0);
    // いまの文字の飾り（\f[…]）。空ならふつうの文字
    let style = {};
    // 着せ替えは、ためすたびに「はじめから」の状態にもどす
    dressOn = null;
    renderStageDress();

    for (const op of ops) {
      if (token !== App.playToken) return;
      switch (op.op) {
        case 'scope':
          who = op.who;
          target = balloonOf(who);
          target.classList.remove('is-empty');
          break;
        case 'surface':
          setSurface(who, op.id);
          break;
        case 'style':
          style = applyStyle(style, op.name, op.value);
          break;
        case 'bind': {
          const part = dressup().parts.find((p) => p.who === (who === 1 ? 1 : 0)
            && p.category === op.category && p.name === op.part);
          if (!part) break;
          if (!dressOn) dressOn = {};
          const now = part.id in dressOn ? dressOn[part.id] : part.on;
          dressOn[part.id] = op.value === '' ? !now : (op.value === '1' || op.value === 'true');
          renderStageDress();
          break;
        }
        case 'note': {
          target.classList.remove('is-empty');
          target.querySelector('.balloon-text').appendChild(Render.el('span', 'balloon-note', op.text));
          break;
        }
        case 'text': {
          target.classList.remove('is-empty');
          let box = target.querySelector('.balloon-text');
          if (Object.keys(style).length) {
            const span = Render.el('span');
            Object.assign(span.style, style);
            box.appendChild(span);
            box = span;
          }
          for (const ch of Array.from(op.text)) {
            if (token !== App.playToken) return;
            box.appendChild(document.createTextNode(ch));
            target.scrollTop = target.scrollHeight;
            await sleep(22);
          }
          break;
        }
        case 'newline':
          target.querySelector('.balloon-text').appendChild(document.createTextNode('\n'));
          break;
        case 'clear':
          target.querySelector('.balloon-text').textContent = '';
          break;
        case 'wait':
          await sleep(Math.min(1200, op.ms));
          break;
        case 'clickwait': {
          const mark = Render.el('span', 'balloon-wait', ' ▼');
          target.querySelector('.balloon-text').appendChild(mark);
          await Promise.race([sleep(2500), waitForStageClick()]);
          mark.remove();
          break;
        }
        case 'choice': {
          const chip = Render.el('span', 'balloon-choice', op.label);
          chip.addEventListener('click', () => {
            // 行き先が On で始まるときは、SSP と同じく、そのイベントのブロックを動かす
            const isEvent = /^On/.test(op.id);
            const fn = Model.project.scripts.find((s) => (isEvent
              ? s.kind === 'event' && s.event === op.id
              : (s.kind === 'function' || s.kind === 'talk') && s.name === op.id));
            if (fn) App.runScript(fn);
            else if (isEvent) App.toast(`「${op.id}」のブロックがありません`, true);
            else App.toast(`「${op.id}」というトークが見つかりません`, true);
          });
          target.querySelector('.balloon-text').appendChild(chip);
          break;
        }
        case 'end':
        case 'close':
          return;
        default:
          break;
      }
    }
  }

  // \f[…] を、吹き出しの文字の見た目（CSS）に直す。
  // 大きさの ％ は、ふだんの大きさに対して。default は飾りを全部はずす。
  function applyStyle(cur, name, value) {
    const on = value === '1' || value === 'true';
    const next = Object.assign({}, cur);
    const set = (key, v) => { if (v) next[key] = v; else delete next[key]; };
    switch (name) {
      case 'default': return {};
      case 'bold': set('fontWeight', on ? 'bold' : ''); break;
      case 'italic': set('fontStyle', on ? 'italic' : ''); break;
      case 'underline':
      case 'strike': {
        const lines = new Set(String(next.textDecoration || '').split(' ').filter(Boolean));
        const word = name === 'underline' ? 'underline' : 'line-through';
        if (on) lines.add(word); else lines.delete(word);
        set('textDecoration', [...lines].join(' '));
        break;
      }
      case 'color': set('color', value === 'default' ? '' : value); break;
      case 'height': {
        const m = /^(\d+)%$/.exec(value);
        set('fontSize', value === 'default' ? '' : (m ? `${m[1]}%` : (Number(value) ? `${Number(value)}px` : '')));
        break;
      }
      default: break;
    }
    return next;
  }

  function waitForStageClick() {
    return new Promise((resolve) => {
      const stage = $('#stage');
      const fn = () => { stage.removeEventListener('click', fn); resolve(); };
      stage.addEventListener('click', fn);
    });
  }

  N.Shell = { refreshShell, addAnimation, addDressPart, pickShellImage, resetStage, playSakura, surfaceChoices };

})(window.NASHI);
