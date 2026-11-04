/* 受け口（コード.gs）とのやりとり（予約フォーム・お問い合わせと応募のフォームで使う）
   ・★店舗アプリ/バグる/予約ボード/board/api.js に同じものの写しがある。受け口とのやりとりを変えたら、両方を直す
   ・受け口の場所は js/config.js（作る.py が書き出す）の BAGURU.reserveApi
   ・★Google は、受け口が動いたあと返事を受け取る段で、ときどき 404 や形の違う返事を返す（Task Board で実際にあった）。
     2回まで黙って送り直す。予約は「受付の印（rid）」を付けて送るので、2回届いても1件にしかならない */
(function (global) {
  'use strict';

  var NEED = { avail: 'days', reserve: 'no', contact: 'sent', ping: 'now', load: 'rows', save: 'row', decide: 'row', customers: 'list', customer: 'customer',
    saveCustomer: 'customer', saveTables: 'tables', saveConf: 'conf' };

  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function fail(code, data) { var e = new Error(code); e.code = code; e.data = data || {}; return e; }

  async function post(payload) {
    var url = (global.BAGURU && global.BAGURU.reserveApi) || '';
    if (!url) throw fail('not_ready');
    var last = fail('no_answer');
    for (var i = 0; i < 3; i++) {
      if (i) await wait(800 * i);
      try {
        var res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });
        var obj = null;
        try { obj = JSON.parse(await res.text()); } catch (e) { obj = null; }
        if (!obj) { last = fail('no_answer'); continue; }
        if (!obj.ok) throw fail(obj.error || 'refused', obj);
        if (NEED[payload.action] && !(NEED[payload.action] in obj)) { last = fail('no_answer'); continue; }
        return obj;
      } catch (e) {
        if (e.code && e.code !== 'no_answer') throw e;     // 受け口が断ったものは送り直さない
        last = e.code ? e : fail('offline');
      }
    }
    throw last;
  }

  function rid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }

  var WD = '日月火水木金土';
  function weekday(ymd) { var p = ymd.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
  function md(ymd) { var p = ymd.split('-'); return Number(p[1]) + '/' + Number(p[2]); }
  function jp(ymd) { var p = ymd.split('-'); return Number(p[1]) + '月' + Number(p[2]) + '日（' + WD.charAt(weekday(ymd)) + '）'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  global.BaguruApi = {
    post: post, rid: rid, ready: function () { return !!(global.BAGURU && global.BAGURU.reserveApi); },
    weekday: weekday, wd: function (ymd) { return WD.charAt(weekday(ymd)); }, md: md, jp: jp, esc: esc
  };
})(window);
