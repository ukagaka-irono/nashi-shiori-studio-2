/* なしスタジオ - 動いているゴーストとの連携（SSTP）
 *
 * SSP を見つけて、いま組んでいるトークをその場のゴーストに喋らせたり、
 * 書き出したゴーストを SSP に入れたりします。
 *
 * app.js より**あとに**読みこまれるので、app.js の中身は N.App 経由で使います。
 * 逆に app.js からここを呼ぶときは、読みこみ順の都合で N.Ssp.xxx() の形になります。
 */
'use strict';

(function (N) {

  const Model = N.Model;
  const Render = N.Render;
  const App = N.App;
  const $ = N.$;
  const api = App.api;
  const escapeHtml = App.escapeHtml;
  const refsFor = App.refsFor;
  const runPreview = App.runPreview;
  const renderRunVars = App.renderRunVars;
  const T = N.I18n.T;

  // -------------------------------------------------------------- SSP 連携
  function currentScript() {
    const id = $('#run-target').value;
    return Model.project.scripts.find((s) => s.id === id) || null;
  }

  function describeSsp(ssp) {
    if (!ssp) return { text: T('SSP: 確認できません'), ok: false };
    if (ssp.sstp) {
      return {
        text: ssp.ghost ? T('SSP: つながっています（{ghost}）', { ghost: ssp.ghost }) : T('SSP: つながっています'),
        ok: true,
      };
    }
    if (ssp.running) return { text: T('SSP: 起動中（SSTP の応答なし）'), ok: false };
    if (ssp.exe) return { text: T('SSP: 見つかりました（停止中）'), ok: false };
    return { text: T('SSP: 見つかりません'), ok: false };
  }

  async function refreshSsp() {
    let ssp = null;
    try { ssp = await api('/api/ssp'); } catch (e) { /* 表示だけ更新する */ }
    App.ssp = ssp;

    const badge = $('#ssp-status');
    const info = describeSsp(ssp);
    badge.textContent = info.text;
    badge.classList.toggle('is-off', !info.ok);
    $('#btn-run-ssp').disabled = !info.ok;
    $('#btn-send-event').disabled = !info.ok;
    $('#btn-send-comm').disabled = !info.ok;

    const box = $('#ssp-info');
    if (box) {
      box.className = 'status-line ' + (info.ok ? 'status-ok' : 'status-ng');
      let text = info.text;
      if (ssp && ssp.ghostDir) text += `\n${ssp.ghostDir}`;
      else text += '\n' + T('下の欄に ssp.exe の場所を入れてください。');
      box.textContent = text;
      box.style.whiteSpace = 'pre-wrap';
    }
    const install = $('#btn-ssp-install');
    if (install) install.disabled = !(ssp && ssp.ghostDir);
    const launch = $('#btn-ssp-launch');
    if (launch) launch.disabled = !(ssp && ssp.exe) || (ssp && ssp.running);
    if (ssp && ssp.exe && !$('#ssp-path').value) $('#ssp-path').value = ssp.exe;
    return ssp;
  }

  async function sendScriptToSsp() {
    const script = currentScript();
    if (!script) { App.toast(T('実行するかたまりがありません'), true); return; }
    let res;
    try {
      res = await runPreview(script);
    } catch (e) { App.toast(e.message, true); return; }
    App.sessionVars = res.vars || {};
    $('#script-preview').textContent = res.script || T('（なにも出力されませんでした）');
    renderRunVars();
    if (!res.script) { App.toast(T('出力がありませんでした'), true); return; }
    try {
      await api('/api/ssp/script', { method: 'POST', body: { script: res.script } });
      App.toast(T('SSP のゴーストに送りました'));
    } catch (e) {
      App.toast(e.message, true);
      refreshSsp();
    }
  }

  async function sendEventToSsp() {
    const script = currentScript();
    if (!script) return;
    if (script.kind !== 'event') {
      App.toast(T('イベントのかたまりを選んでください'), true);
      return;
    }
    try {
      await api('/api/ssp/notify', { method: 'POST', body: { event: script.event, refs: refsFor(script) } });
      App.toast(T('{event} を送りました（SSP に入れたゴーストが反応します）', { event: script.event }));
    } catch (e) {
      App.toast(e.message, true);
      refreshSsp();
    }
  }

  // 他のゴーストのふりをして、動いているゴーストに話しかける。
  // 「話しかけられたとき」のブロックを、本物のゴーストで試すためのもの。
  async function sendCommToSsp() {
    const script = currentScript();
    const isComm = script && script.kind === 'event' && script.event === 'OnCommunicate';
    // 「話しかけられたとき」を選んでいれば、その条件どおりの内容で話しかける
    const sender = (isComm && script.from) || T('ほかのゴースト');
    const sentence = (isComm && script.contains) || T('こんにちは');
    try {
      await api('/api/ssp/communicate', { method: 'POST', body: { sentence, sender } });
      App.toast(T('「{sender}」が「{sentence}」と話しかけました', { sender, sentence }));
    } catch (e) {
      App.toast(e.message, true);
      refreshSsp();
    }
  }

  async function installToSsp() {
    const box = $('#ssp-result');
    if (!N.Dialog.confirmIfErrors(T('それでも SSP に入れますか？'))) { box.textContent = T('やめました。'); return; }
    box.textContent = T('SSP に入れています…');
    try {
      const r = await N.Dialog.withForeignCheck((overwriteForeign) => api('/api/ssp/install', {
        method: 'POST',
        body: {
          project: Model.project,
          includeShell: $('#export-shell').checked,
          overwriteShell: $('#export-overwrite').checked,
          overwriteForeign,
          activate: true,
        },
      }));
      if (!r) { box.textContent = T('やめました。'); return; }
      N.Dialog.rememberFolder(r.folder);
      const notes = {
        reload: T('入れ直して、栞を読み込み直しました。すぐ反映されています。'),
        'reload-shell': T('入れ直して、栞とシェル（立ち絵・当たり判定・着せ替え）・バルーンのうち書きかえたものを読み込み直しました。すぐ反映されています。'),
        change: T('SSP のゴーストを切り替えました。切り替わらないときは、新しいゴーストなので SSP を再起動してください。'),
        none: T('書き出しました。SSP を起動（または再起動）すると反映されます。'),
        failed: T('書き出しましたが、SSP への指示は届きませんでした。'),
        'unsafe-name': T('書き出しました。ゴースト名に [ ] \\ " , が入っているので、自動では切り替えませんでした。SSP のメニューから切り替えてください。'),
      };
      box.innerHTML =
        T('<b>{folder}</b> を入れました（{files} ファイル）', { folder: escapeHtml(r.folder), files: r.files }) + '<br>' +
        `<code>${escapeHtml(r.root)}</code><br>${escapeHtml(notes[r.action] || '')}`;
      const kept = N.Dialog.skippedNote(r.skipped);
      if (kept) box.appendChild(kept);
      const lost = N.Dialog.missingNote(r.missing);
      if (lost) {
        box.appendChild(lost);
        App.toast(T('SSP に入れました。見つからない絵が {n} 枚あります', { n: r.missing.length }), true);
      } else {
        App.toast(T('SSP に入れました'));
      }
      refreshSsp();
    } catch (e) {
      box.textContent = '';
      box.appendChild(Render.div('status-line status-ng', e.message));
      App.toast(e.message, true);
    }
  }

  N.Ssp = { refreshSsp, sendScriptToSsp, sendEventToSsp, sendCommToSsp, installToSsp };

})(window.NASHI);
