/* なしスタジオ - プロジェクトのデータモデルと Undo */
'use strict';

(function (N) {

  const T = N.I18n.T;
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // こまの重ねかた（SERIKO の描画メソッド）。書き出しでもこの名前だけ通します。
  // start / stop は別のうごきを動かす／止める、import は APNG などを差しこむ指定です。
  const ANIM_METHODS = ['overlay', 'overlayfast', 'base', 'replace',
    'interpolate', 'asis', 'reduce', 'move',
    'blend-multiply', 'blend-screen', 'blend-overlay', 'blend-add',
    'start', 'stop', 'import'];
  const ANIM_SHAPES = ['rect', 'ellipse', 'circle', 'polygon'];

  // 重ねる絵の並び（立ち絵を重ねて作るとき）。パスの無いものは落とす。
  function normalizeLayers(list) {
    return (Array.isArray(list) ? list : [])
      .filter((l) => l && l.path)
      .map((l) => ({
        path: String(l.path),
        x: Number(l.x) || 0, y: Number(l.y) || 0,
        stamp: l.stamp ? String(l.stamp) : '',
      }));
  }

  // 当たり判定の並び（立ち絵にも、うごきにも使う）。名前の無いものは落とす。
  function normalizeCollisions(list) {
    return (Array.isArray(list) ? list : [])
      .filter((c) => c && String(c.name || '').trim())
      .map((c) => ({
        name: String(c.name).trim(),
        shape: ANIM_SHAPES.indexOf(c.shape) >= 0 ? c.shape : 'rect',
        x1: Number(c.x1) || 0, y1: Number(c.y1) || 0,
        x2: Number(c.x2) || 0, y2: Number(c.y2) || 0,
        points: c.points ? String(c.points) : '',
      }));
  }

  let seq = 0;
  function uid(prefix) {
    seq++;
    return (prefix || 'id') + '_' + Date.now().toString(36).slice(-4) + seq.toString(36);
  }

  const Model = {
    project: null,
    undoStack: [],
    redoStack: [],
    listeners: [],
    dirty: false,

    uid,
    clone,

    // ------------------------------------------------------------ lifecycle
    newProject() {
      return {
        format: 'nashi/1',
        meta: {
          name: T('なしゴースト'),
          sakuraName: T('さくら'),
          keroName: T('うにゅう'),
          craftman: '',
          craftmanUrl: '',
          homeUrl: '',
          version: '1.0.0',
          description: '',
        },
        settings: {
          randomTalkInterval: 180,
          randomTalkEnabled: true,
          noRepeatCount: 0,
          // 句読点のあとに少し間を置く。新しく作るゴーストだけ入（前からあるプロジェクトは、無ければ切のまま）
          autoWait: true,
          defaultSurfaceSakura: 0,
          defaultSurfaceKero: 10,
        },
        shell: {
          balloonEnabled: false, balloonColor: '#fffdf5',
          sakuraColor: '#f08cae', sakuraCloth: '#6e82c8',
          keroColor: '#8fd18a', keroCloth: '#e8b45c',
          images: [],       // { id, path, name, w, h } 用意した立ち絵（layers なら重ねて作る）
          base: { 0: [], 1: [] },   // 重ねて作る立ち絵の、キャラ共通の土台
        },
        // 着せ替え（MAYUNA）。部品の絵を、そのキャラのすべての表情に重ねる。
        dressup: { parts: [], rules: {} },
        variables: [],
        scripts: [],
      };
    },

    normalize(p) {
      const base = Model.newProject();
      const out = Object.assign(base, p || {});
      out.meta = Object.assign(base.meta, (p && p.meta) || {});
      out.settings = Object.assign(base.settings, (p && p.settings) || {});
      // 自動の間は、書いていないプロジェクト（前の版で作ったもの・取りこんだもの）では切のまま（話す速さを変えない）
      if (!(p && p.settings && 'autoWait' in p.settings)) out.settings.autoWait = false;
      out.shell = Object.assign(base.shell, (p && p.shell) || {});
      // 立ち絵は「1 枚の絵（path）」か「絵を重ねて作る（layers）」のどちらか
      out.shell.images = (Array.isArray(out.shell.images) ? out.shell.images : [])
        .filter((x) => x && Number.isFinite(Number(x.id))
          && (x.path || (Array.isArray(x.layers) && x.layers.length)))
        .map((x) => ({
          id: Number(x.id), path: x.path ? String(x.path) : '',
          name: x.name ? String(x.name) : (x.path ? String(x.path).split(/[\\/]/).pop() : ''),
          w: Number(x.w) || 0, h: Number(x.h) || 0,
          // 重ねる絵（そのキャラ共通の土台の上に、下から順に）
          layers: normalizeLayers(x.layers),
          // この絵に描いた当たり判定（無ければ、書き出すときに自動で付ける）
          collisions: normalizeCollisions(x.collisions),
        }))
        .sort((a, b) => a.id - b.id);
      // キャラ共通の土台（"0" = さくら / "1" = うにゅう）。重ねて作る立ち絵の、いちばん下に入る
      const baseIn = (p && p.shell && p.shell.base) || {};
      out.shell.base = { 0: normalizeLayers(baseIn[0]), 1: normalizeLayers(baseIn[1]) };
      // 着せ替えの部品。id はうごき（0〜127）とぶつからないよう 200 から。
      const dress = (p && p.dressup && typeof p.dressup === 'object') ? p.dressup : {};
      // 「キャラ/カテゴリ」ごとの決まり: なし = 1 つまで（はずせる）/ mustselect / multiple
      out.dressup = { parts: [], rules: {} };
      const seenIds = {};
      for (const x of (Array.isArray(dress.parts) ? dress.parts : [])) {
        const id = Number(x && x.id);
        if (!Number.isFinite(id) || id < 200 || seenIds[id]) continue;   // 同じ番号は 1 つだけ
        seenIds[id] = 1;
        out.dressup.parts.push({
          id,
          who: Number(x.who) === 1 ? 1 : 0,
          category: String(x.category || '').trim(),
          name: String(x.name || '').trim(),
          path: x.path ? String(x.path) : '',
          x: Number(x.x) || 0, y: Number(x.y) || 0,
          on: !!x.on,
          stamp: x.stamp ? String(x.stamp) : '',   // 絵をえらびなおした時刻（描きなおしの目印）
        });
      }
      for (const key of Object.keys(dress.rules || {})) {
        const v = dress.rules[key];
        if (v === 'mustselect' || v === 'multiple') out.dressup.rules[key] = v;
      }
      out.variables = Array.isArray(out.variables) ? out.variables : [];
      out.variables = out.variables
        .filter((v) => v && v.name)
        .map((v) => ({ name: String(v.name), value: v.value == null ? 0 : v.value }));
      // うごき（SERIKO のアニメーション）。書き出すと surfaces.txt に入ります。
      out.animations = (Array.isArray(out.animations) ? out.animations : [])
        .map((a, i) => ({
          id: Number.isFinite(Number(a && a.id)) ? Number(a.id) : i,
          base: Number(a && a.base) || 0,
          interval: (a && a.interval) ? String(a.interval) : 'never',
          every: Number(a && a.every) || 4,
          patterns: (Array.isArray(a && a.patterns) ? a.patterns : [])
            .map((p) => ({
              surface: Number(p && p.surface) || 0,
              wait: Number.isFinite(Number(p && p.wait)) ? Number(p.wait) : 200,
              method: ANIM_METHODS.indexOf(p && p.method) >= 0 ? p.method : 'base',
              x: Number(p && p.x) || 0,
              y: Number(p && p.y) || 0,
              file: p && p.file ? String(p.file) : '',
            })),
          // このうごきの間だけ有効な当たり判定
          collisions: normalizeCollisions(a && a.collisions),
        }));

      out.scripts = Array.isArray(out.scripts) ? out.scripts : [];
      let y = 40;
      out.scripts = out.scripts.map((s) => {
        const script = Object.assign({ kind: 'event', blocks: [] }, s);
        script.id = script.id || uid('s');
        script.blocks = Array.isArray(script.blocks) ? script.blocks : [];
        if (typeof script.x !== 'number') script.x = 60;
        if (typeof script.y !== 'number') { script.y = y; y += 180; }
        // 付箋（メモ）。ゴーストの動きには入らない（書き出す ghost.json にも入らない）
        if (script.kind === 'note' && typeof script.text !== 'string') script.text = '';
        if (script.kind === 'talk' && script.weight == null) script.weight = 1;
        if (script.kind === 'talk' && typeof script.group !== 'string') script.group = '';
        if ((script.kind === 'talk' || script.kind === 'function') && !script.name) {
          script.name = script.kind === 'talk' ? T('トーク') : T('なまえのないトーク');
        }
        if (script.kind === 'event') {
          if (!script.event) script.event = 'OnBoot';
          // SSP に OnHourChange は無い。以前の版が書いていた名前を、本物に直す。
          if (script.event === 'OnHourChange') script.event = 'OnHourTimeSignal';
          // マウス系イベントのしぼり込み（当たった場所・相手）
          if (typeof script.area !== 'string') script.area = '';
          if (typeof script.who !== 'number') script.who = -1;
          // ゴースト間通信のしぼり込み（だれが・なんと言ったら）
          if (typeof script.from !== 'string') script.from = '';
          if (typeof script.contains !== 'string') script.contains = '';
          // くりかえしの間隔（1 なら毎秒）
          script.everySec = Math.max(1, Math.floor(Number(script.everySec) || 1));
          // 読み込んだゴーストの filter を、編集できる形にほどく
          if (s.filter && typeof s.filter === 'object') {
            if (typeof s.filter.area === 'string') script.area = s.filter.area;
            if (typeof s.filter.who === 'number') script.who = s.filter.who;
            if (typeof s.filter.from === 'string') script.from = s.filter.from;
            if (typeof s.filter.contains === 'string') script.contains = s.filter.contains;
            delete script.filter;
          }
        }
        return script;
      });
      return out;
    },

    init(project) {
      Model.project = Model.normalize(project);
      Model.undoStack = [];
      Model.redoStack = [];
      Model.dirty = false;
      Model.emit();
    },

    // --------------------------------------------------------------- events
    onChange(fn) { Model.listeners.push(fn); },
    offChange(fn) {
      const i = Model.listeners.indexOf(fn);
      if (i >= 0) Model.listeners.splice(i, 1);
    },
    emit() { Model.listeners.forEach((fn) => fn(Model.project)); },

    /**
     * Undo 用の控え。JSON の文字で持つ（オブジェクトのまま複製するより速く、メモリも小さい。
     * 「変わったか」も文字どうしを比べるだけで分かる）。
     */
    snapshot() { return JSON.stringify(Model.project); },

    /** すべての変更はこれを通す（Undo 用のスナップショットを取る） */
    act(fn) {
      const snap = Model.snapshot();
      let result;
      try {
        result = fn();
      } catch (e) {
        console.error(e);
        Model.project = JSON.parse(snap);
        Model.emit();
        throw e;
      }
      if (result === false) return false;   // 変更なし
      Model.undoStack.push(snap);
      if (Model.undoStack.length > 80) Model.undoStack.shift();
      Model.redoStack = [];
      Model.dirty = true;
      Model.emit();
      return result;
    },

    /** 入力欄の編集など、すでに書き換えたあとで Undo 履歴だけ積みたいとき */
    pushUndo(snapshot) {
      if (!snapshot) return;
      // 控えは Model.snapshot() の文字。古い呼びかたのオブジェクトも受ける
      const snap = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
      if (snap === Model.snapshot()) return;
      Model.undoStack.push(snap);
      if (Model.undoStack.length > 80) Model.undoStack.shift();
      Model.redoStack = [];
      Model.dirty = true;
      Model.emit();
    },

    undo() {
      if (!Model.undoStack.length) return false;
      Model.redoStack.push(Model.snapshot());
      Model.project = JSON.parse(Model.undoStack.pop());
      Model.dirty = true;
      Model.emit();
      return true;
    },

    redo() {
      if (!Model.redoStack.length) return false;
      Model.undoStack.push(Model.snapshot());
      Model.project = JSON.parse(Model.redoStack.pop());
      Model.dirty = true;
      Model.emit();
      return true;
    },

    // -------------------------------------------------------------- scripts
    addScript(kind, opts) {
      const s = Object.assign({
        id: uid('s'),
        kind,
        x: 60, y: 60,
        blocks: [],
      }, opts || {});
      if (kind === 'event') {
        if (!s.event) s.event = 'OnBoot';
        if (typeof s.area !== 'string') s.area = '';
        if (typeof s.who !== 'number') s.who = -1;
        if (typeof s.from !== 'string') s.from = '';
        if (typeof s.contains !== 'string') s.contains = '';
        if (typeof s.everySec !== 'number') s.everySec = 1;
      }
      if (kind === 'talk') { s.name = s.name || T('トーク'); if (s.weight == null) s.weight = 1; }
      if (kind === 'function') s.name = s.name || T('あたらしいトーク');
      Model.project.scripts.push(s);
      return s;
    },

    removeScript(script) {
      const i = Model.project.scripts.indexOf(script);
      if (i >= 0) Model.project.scripts.splice(i, 1);
    },

    scriptTitle(s) {
      if (!s) return '';
      if (s.kind === 'event') {
        const found = N.EVENTS.find((e) => e[1] === s.event);
        let label = found ? found[0] : (s.event || T('イベント'));
        if (s.event === 'OnSecondChange') {
          const n = Math.max(1, Number(s.everySec) || 1);
          return n > 1 ? T('{n}秒ごとにくりかえす', { n }) : label;
        }
        if (N.MOUSE_EVENTS[s.event]) {
          // 仮シェルの名前に無いもの（うごきで足した当たり判定）は、そのまま出す
          const area = (N.AREAS.find((a) => a[1] === (s.area || '')) || [])[0] || s.area;
          const who = (N.WHO_ANY.find((w) => w[1] === (s.who == null ? -1 : s.who)) || [])[0];
          if (s.area || (s.who != null && s.who >= 0)) label = T('{who}の{area}が{label}', { who, area, label });
        }
        if (s.event === 'OnCommunicate' && (s.from || s.contains)) {
          const who = s.from ? s.from : T('だれか');
          label = s.contains
            ? T('{who}に「{text}」と{label}', { who, text: s.contains, label })
            : T('{who}に{label}', { who, label });
        }
        return label;
      }
      if (s.kind === 'talk') {
        const g = String(s.group || '').trim();
        const name = s.name || '';
        return g ? T('ランダムトーク「{name}」（{group}）', { name, group: g }) : T('ランダムトーク「{name}」', { name });
      }
      if (s.kind === 'function') return T('「{name}」', { name: s.name || '' });
      if (s.kind === 'note') {
        const first = String(s.text || '').split('\n')[0].trim();
        if (!first) return T('メモ');
        return T('メモ「{text}」', { text: first.length > 20 ? first.slice(0, 20) + '…' : first });
      }
      return T('ブロックのかたまり');
    },

    functionNames() {
      return Model.project.scripts
        .filter((s) => s.kind === 'function' || s.kind === 'talk')
        .map((s) => s.name)
        .filter((n, i, a) => n && a.indexOf(n) === i);
    },

    // ------------------------------------------------------------ variables
    addVariable(name, value) {
      name = String(name || '').trim();
      if (!name) return null;
      if (Model.project.variables.some((v) => v.name === name)) return null;
      const v = { name, value: value == null ? 0 : value };
      Model.project.variables.push(v);
      return v;
    },

    renameVariable(oldName, newName) {
      newName = String(newName || '').trim();
      if (!newName || oldName === newName) return false;
      if (Model.project.variables.some((v) => v.name === newName)) return false;
      const v = Model.project.variables.find((x) => x.name === oldName);
      if (!v) return false;
      v.name = newName;
      Model.forEachVarRef((b, arg) => { if (b[arg] === oldName) b[arg] = newName; });
      return true;
    },

    /**
     * 変数の名前が入る欄（「変数名」の欄: 入れる・変える・中身・たずねて入れる先 など）をすべて訪ねる。
     * fn(block, argName)。名前の付けかえ・使っている数・チェックが、同じ欄を見るように 1 か所にまとめる。
     */
    forEachVarRef(fn) {
      Model.walkBlocks((b) => {
        const d = N.getDef(b);
        for (const arg in (d && d.args) || {}) {
          if (d.args[arg].kind === 'varname' && typeof b[arg] === 'string') fn(b, arg);
        }
      });
    },

    /** その変数を使っている欄の数 */
    countVariableUses(name) {
      let n = 0;
      Model.forEachVarRef((b, arg) => { if (b[arg] === name) n++; });
      return n;
    },

    /**
     * トークの名前を変えたとき、そのトークをよぶブロック（よぶ・◯秒後によぶ・選択肢）も付けかえる。
     * 同じ名前のトークがまだほかにあれば、よぶ先は消えていないので何もしない。付けかえた数を返す。
     */
    renameTalkRefs(oldName, newName, renamed) {
      if (!oldName || oldName === newName) return 0;
      const stillThere = Model.project.scripts.some((s) =>
        s !== renamed && (s.kind === 'talk' || s.kind === 'function') && s.name === oldName);
      if (stillThere) return 0;
      let n = 0;
      Model.walkBlocks((b) => {
        const d = N.getDef(b);
        for (const arg in (d && d.args) || {}) {
          if (d.args[arg].kind === 'funcname' && b[arg] === oldName) { b[arg] = newName; n++; }
        }
      });
      return n;
    },

    removeVariable(name) {
      const i = Model.project.variables.findIndex((v) => v.name === name);
      if (i >= 0) Model.project.variables.splice(i, 1);
    },

    variableNames() { return Model.project.variables.map((v) => v.name); },

    // --------------------------------------------------------------- blocks
    /** すべてのブロックを訪問する。visit(block, stack, index) */
    walkBlocks(visit) {
      const walkStack = (stack) => {
        if (!Array.isArray(stack)) return;
        stack.forEach((b, i) => {
          if (!b || typeof b !== 'object') return;
          visit(b, stack, i);
          walkInner(b);
        });
      };
      const walkInner = (b) => {
        const d = N.getDef(b);
        if (d) {
          for (const s of d.subs || []) walkStack(b[s.key]);
          if (d.dynamic && Array.isArray(b[d.dynamic])) b[d.dynamic].forEach(walkStack);
          for (const name in (d.args || {})) {
            const v = b[name];
            if (v && typeof v === 'object' && v.type) { visit(v, null, -1); walkInner(v); }
          }
        }
      };
      Model.project.scripts.forEach((s) => walkStack(s.blocks));
    },

    countBlocks() {
      let n = 0;
      Model.walkBlocks(() => { n++; });
      return n;
    },
  };

  N.Model = Model;

})(window.NASHI);
