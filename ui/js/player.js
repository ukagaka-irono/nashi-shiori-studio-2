/* なしスタジオ - さくらスクリプトの再生（「ためす」タブの動きと吹き出し）
 *
 * ここはブロックを実行しません。**実行するのは栞そのもの**です。
 * 画面は POST /api/preview（studio/src/preview.cpp → shiori/src/interp.cpp）に頼み、
 * 返ってきたさくらスクリプトを、ここで「操作の列」にほどいて再生します。
 *
 * 以前はブロックを動かす規則を JavaScript でもう一度書いていましたが、
 * 片方だけ直すと静かにズレるので、やめました（docs/maintenance.md）。
 */
'use strict';

(function (N) {

  function fmtNum(v) {
    if (!isFinite(v)) return '0';
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1e10) / 1e10);
  }

  // 栞は「はい/いいえ」を数の 1 / 0 として持っている（program.h の Value::Bool）ので、
  // 画面に出すときも 1 / 0 にそろえる。
  const toStr = (v) => (
    v == null ? ''
      : typeof v === 'boolean' ? (v ? '1' : '0')
        : typeof v === 'number' ? fmtNum(v) : String(v));

  // \![…] のうち、プレビューで「こうなります」と見せたいもの。ほかは何も出さない。
  const INPUT_KINDS = {
    inputbox: '文字', dateinput: '日付', timeinput: '時刻', sliderinput: '数', passwordinput: 'パスワード',
  };
  function describeCommand(a) {
    if (a[0] === 'sound') {
      if (a[1] === 'stop') return '♪ 音を止める';
      if (a[1] === 'loop') return `♪ ${a[2] || ''} をくりかえし鳴らす`;
      if (a[1] === 'play') return `♪ ${a[2] || ''} を鳴らす`;
      return '';
    }
    if (a[0] === 'set' && a[1] === 'alpha') return `濃さ ${a[2]}％`;
    if (a[0] === 'get' && a[1] === 'property') return `（SSP に ${a[3] || ''} をたずねる）`;
    if (a[0] === 'move') return 'キャラが動く';
    if (a[0] === 'open' && INPUT_KINDS[a[1]]) return `（${INPUT_KINDS[a[1]]}の入力欄が開く）`;
    if (a[0] === 'open' && a[1] === 'browser') return `（ブラウザで ${a[2] || ''} を開く）`;
    return '';
  }

  // ------------------------------------------------------- SakuraScript 解析
  /** プレビュー再生のために、さくらスクリプトを操作の列に分解する */
  function parseSakura(s) {
    const ops = [];
    let i = 0;
    let text = '';
    // %property[…] は SSP が出すときに置きかえる。ためすときは、何が入るかを〈 〉で見せる。
    const flush = () => {
      if (!text) return;
      ops.push({ op: 'text', text: text.replace(/%property\[([^\]]*)\]/g, '〈$1〉') });
      text = '';
    };
    // [ … ] の中身。\] と \\ は 1 文字として読む（SSP と同じ）。
    const readBracket = () => {
      if (s[i] !== '[') return null;
      let j = i + 1;
      let body = '';
      while (j < s.length && s[j] !== ']') {
        if (s[j] === '\\' && (s[j + 1] === ']' || s[j + 1] === '\\')) { body += s[j + 1]; j += 2; continue; }
        body += s[j++];
      }
      if (j >= s.length) return null;
      i = j + 1;
      return body;
    };
    // , で分ける。"…" でくくった中の , は区切りにしない（"" は " 1 つ）。
    const splitArgs = (a) => {
      const out = [''];
      let quoted = false;
      for (let k = 0; k < a.length; k++) {
        const ch = a[k];
        if (ch === '"') {
          if (quoted && a[k + 1] === '"') { out[out.length - 1] += '"'; k++; continue; }
          quoted = !quoted;
          continue;
        }
        if (ch === ',' && !quoted) { out.push(''); continue; }
        out[out.length - 1] += ch;
      }
      return out;
    };

    while (i < s.length) {
      const c = s[i];
      if (c !== '\\') { text += c; i++; continue; }
      i++;
      const t = s[i];
      if (t === undefined) break;
      if (t === '\\') { text += '\\'; i++; continue; }
      i++;
      switch (t) {
        case '0': case '1': flush(); ops.push({ op: 'scope', who: Number(t) }); break;
        case 'h': flush(); ops.push({ op: 'scope', who: 0 }); break;
        case 'u': flush(); ops.push({ op: 'scope', who: 1 }); break;
        case 'p': { const a = readBracket(); flush(); ops.push({ op: 'scope', who: Number(a) || 0 }); break; }
        case 's': { const a = readBracket(); flush(); ops.push({ op: 'surface', id: Number(a) || 0 }); break; }
        case 'n': {
          if (s[i] === '[') readBracket();
          flush(); ops.push({ op: 'newline' });
          break;
        }
        case 'c': flush(); ops.push({ op: 'clear' }); break;
        case 'e': flush(); ops.push({ op: 'end' }); break;
        case '-': flush(); ops.push({ op: 'close' }); break;
        case 'x': flush(); ops.push({ op: 'clickwait' }); break;
        case 'b': { readBracket(); break; }
        case 'q': {
          // \q[見出し,行き先,Reference…]。行き先のあとに続く引数は、見出しに入れない。
          const a = splitArgs(readBracket() || '');
          flush();
          ops.push({ op: 'choice', label: a[0], id: a.length > 1 ? a[1] : '' });
          break;
        }
        case 'w': {
          const n = Number(s[i]);
          if (!isNaN(n)) { i++; flush(); ops.push({ op: 'wait', ms: n * 50 }); }
          break;
        }
        case '_': {
          let kind = s[i]; i++;
          // \__w[…] / \__q[…] のように _ が 2 つ続くもの
          if (kind === '_') { kind = '_' + s[i]; i++; }
          const a = readBracket();
          if (kind === 'w' || kind === '__w') {
            // \__w[animation,ID] はアニメーションを待つ。プレビューでは待たない。
            const ms = Number(a);
            if (Number.isFinite(ms)) { flush(); ops.push({ op: 'wait', ms }); }
          }
          else if (kind === 'a') { flush(); ops.push({ op: 'link', url: a }); }
          else if (kind === 'v') { flush(); ops.push({ op: 'sound', file: a }); }
          break;
        }
        case 'f': {
          // 文字の飾り。\f[bold,1] / \f[color,#d03030] / \f[height,150%] / \f[default]
          const a = splitArgs(readBracket() || '');
          flush();
          ops.push({ op: 'style', name: a[0], value: a.length > 1 ? a.slice(1).join(',') : '' });
          break;
        }
        case '!': {
          // 画面のプレビューでは再現しないものを、吹き出しに小さく書いておく
          const a = splitArgs(readBracket() || '');
          const note = describeCommand(a);
          if (note) { flush(); ops.push({ op: 'note', text: note }); }
          break;
        }
        default: {
          if (s[i] === '[') readBracket();
          break;
        }
      }
    }
    flush();
    return ops;
  }

  N.Player = { parseSakura, toStr };

})(window.NASHI);
