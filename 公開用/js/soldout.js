/* テイクアウトのページの品切れ（2026-11-08 ko-dai さんの指示：「アプリで品切れ設定ができるようにしてください。公式アプリにもホームページにもテイクアウトページで反映されるように」）
   ・品切れは、Order受付の「品切れの設定」（バグるマネージの「売り切れ」と同じ）で決める。受け口の appContent の content に入る
       items[商品id].soldOut … 商品　／　choices['グループid/名前'].soldOut … 選ぶもの（ソース・味・セット・トッピング）
   ・ページの品には、作る.py が data-app="id …" を付ける（app_ids）。どれかが品切れなら「売り切れ」を出す
     （例：デミソースハンバーグBOX は hbox か sauce/デミソース のどちらかが品切れなら売り切れ）
   ・味・セット・トッピングは、data-app-choices="taste|set|topping" の所に「品切れ中：…」と出す
   ・管理画面の「売り切れ」（menu.json）は、作る.py がもとから出している。どちらかが売り切れなら売り切れ
   ・読めないとき（つながらない・古い受け口）は、何もしない */
(function () {
  'use strict';
  var A = window.BaguruApi;
  var els = document.querySelectorAll('[data-app]'), lists = document.querySelectorAll('[data-app-choices]');
  if (!A || !A.ready() || (!els.length && !lists.length)) return;

  function mark(el) {
    if (el.classList.contains('is-soldout') && el.querySelector('.sold')) return;
    el.classList.add('is-soldout');
    var h = el.querySelector('h3, h4, .nm');
    if (h && !h.querySelector('.sold')) {
      var s = document.createElement('span');
      s.className = 'sold';
      s.textContent = '売り切れ';
      var small = h.querySelector('small');   // 一覧の品は、名前のすぐ後ろ（小さい説明の前）に
      if (small) h.insertBefore(s, small); else h.appendChild(s);
    }
  }

  A.post({ action: 'appContent' }).then(function (r) {
    var c = (r && r.content) || {}, items = c.items || {}, ch = c.choices || {};
    var off = function (id) { var o = id.indexOf('/') > 0 ? ch[id] : items[id]; return !!(o && o.soldOut === true); };
    Array.prototype.forEach.call(els, function (el) {
      var ids = (el.getAttribute('data-app') || '').split(/\s+/).filter(Boolean);
      if (ids.some(off)) mark(el);
    });
    Array.prototype.forEach.call(lists, function (el) {
      var g = el.getAttribute('data-app-choices') + '/';
      var names = Object.keys(ch).filter(function (k) { return k.indexOf(g) === 0 && ch[k] && ch[k].soldOut === true; })
        .map(function (k) { return k.slice(g.length); });
      el.textContent = names.length ? '品切れ中：' + names.join('・') : '';
      el.hidden = !names.length;
    });
  }).catch(function () { /* 読めないときは、そのまま */ });
})();
