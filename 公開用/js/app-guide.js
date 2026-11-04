/* 公式アプリのページ（app.html）
   ・見ている端末（iPhone・Android）の手順を先に出して、「お使いの端末」の印を付ける（css/style.css の .install.is-you）
   ・LINE・Instagram・Facebook の中で開いたときは、上に「ブラウザで開き直して」の知らせを出す（中ではホーム画面に追加できないため）
   ★端末の見分け方は、店舗アプリ/バグる/js/install.js の ENV と同じ考え方 */
(function () {
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // iPad は Mac のふりをする
  var android = /Android/.test(ua);
  var inApp = /\bLine\/|Instagram|FBAN|FBAV|FB_IAB/i.test(ua);
  var os = ios ? 'ios' : android ? 'android' : '';
  if (os) {
    var card = document.querySelector('.install[data-os="' + os + '"]');
    if (card) {
      card.classList.add('is-you');
      card.parentNode.insertBefore(card, card.parentNode.firstElementChild);
    }
  }
  if (inApp) {
    var n = document.querySelector('.app-iab');
    if (n) n.hidden = false;
  }
})();
