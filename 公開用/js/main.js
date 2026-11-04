/* 炭焼ハンバーグ バグる（サンプル）の動き
   ・スマホのメニューを開く／閉じる
   ・今日の営業時間と、いま営業中かを出す。定休日・臨時休業・臨時営業は T3Works のマネージから読む（下の「定休日」）
   ・飾りと動き：スクロールで現れる・火の粉・透かしの英字と写真を少し動かす・ヘッダーの下の進み具合の線 */
(function () {
  'use strict';

  var body = document.body;

  /* ---------- バグる Owner（オーナー用の入口。店舗アプリ/バグる/バグるOwner/）から開いたとき ----------
     ・?from=owner で開いたら、このタブの sessionStorage の bg.fromOwner に控え、上に「🏠 ホーム」を出す（公式アプリ・Order受付と同じ印）
     ・戻り先は、バグる Owner が sessionStorage の bg.owner に控えたアドレス（同じ t3dining.github.io なので読める）。無ければ公開先 */
  var ownerHome = document.querySelector('.owner-home'), fromOwner = false;
  try {
    if (/[?&]from=owner\b/.test(location.search)) sessionStorage.setItem('bg.fromOwner', '1');
    fromOwner = sessionStorage.getItem('bg.fromOwner') === '1';
  } catch (e) { fromOwner = /[?&]from=owner\b/.test(location.search); }
  if (ownerHome && fromOwner) {
    ownerHome.hidden = false;
    body.classList.add('from-owner');
    ownerHome.addEventListener('click', function (e) {
      var to = '';
      try { to = sessionStorage.getItem('bg.owner') || ''; } catch (x) { to = ''; }
      if (to) { e.preventDefault(); location.href = to; }
    });
  }
  var toggle = document.querySelector('.nav-toggle');
  function closeNav() {
    body.classList.remove('nav-open');
    if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'メニューを開く'); }
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      // 開くメニューは、ヘッダーのすぐ下から。上の「サンプル」の帯が見えているときもヘッダーを隠さない
      var nav = document.getElementById('gnav'), hd = document.querySelector('.hd');
      if (nav && hd) nav.style.top = Math.max(0, hd.getBoundingClientRect().bottom) + 'px';
      var open = body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && body.classList.contains('nav-open')) { closeNav(); toggle.focus(); }
    });
    document.querySelectorAll('.gnav a').forEach(function (a) { a.addEventListener('click', closeNav); });
    window.addEventListener('resize', function () { if (window.innerWidth >= 768) closeNav(); });
  }

  /* ---------- 定休日・臨時休業・臨時営業 ----------
     ・決めるのは T3Works のマネージ（⚙ 設定 → 定休日）。読む先は config.js の BAGURU.daysUrl（T3Works の同期の口の /days/baguru。合言葉の要らない口）
       返事 … { ok: true, store: 'baguru', closedDows: [2] | null, exceptions: { 'YYYY-MM-DD': 'open' | 'closed' } }（今日から60日先まで）
     ・読みに行くのは、この端末で30分に1回まで（T3Works の口の1日の上限を、店舗アプリと分け合う）。
       読めないときは前に読めた分、それも無ければ CLOSED_DOWS（火曜定休）で動く
     ・決める順番は店舗アプリ（店舗アプリ/バグる/js/common.js の isClosedDay）と同じ：その日だけの指定 → 祝日は営業 → 休みの曜日
     ・ページの印（作る.py と ページ/）：data-days="dows" … 「火曜日」の字／data-days="note" … 「祝日…は営業」（休みの曜日が無ければ隠す）／
       data-days="special" … これから60日の、いつもとちがう日（休みの曜日に開ける日・臨時休業の日）。無ければ隠す */
  var DAYS_KEY = 'baguru-days', DAYS_EVERY = 30 * 60000, CLOSED_DOWS = [2];
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function pad(n) { return ('0' + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function mdw(d) { return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEK[d.getDay()] + '）'; }

  // 祝日（法律の決まりから計算する。振替休日・国民の休日も入る）。店舗アプリの holidaysOf と同じ
  var HOL = {};
  function holidaysOf(y) {
    if (HOL[y]) return HOL[y];
    function monday(m, n) { var w = new Date(y, m - 1, 1).getDay(); return 1 + (8 - w) % 7 + (n - 1) * 7; }
    var e = y - 1980;
    var spring = Math.floor(20.8431 + 0.242194 * e - Math.floor(e / 4));
    var autumn = Math.floor(23.2488 + 0.242194 * e - Math.floor(e / 4));
    var days = [[1, 1], [1, monday(1, 2)], [2, 11], [2, 23], [3, spring], [4, 29], [5, 3], [5, 4], [5, 5],
      [7, monday(7, 3)], [8, 11], [9, monday(9, 3)], [9, autumn], [10, monday(10, 2)], [11, 3], [11, 23]]
      .map(function (md) { return new Date(y, md[0] - 1, md[1]); });
    var set = {};
    days.forEach(function (d) { set[ymd(d)] = true; });
    days.forEach(function (d) { if (set[ymd(addDays(d, 2))]) set[ymd(addDays(d, 1))] = true; });   // 国民の休日
    days.forEach(function (d) {                                                                    // 振替休日
      if (d.getDay() !== 0) return;
      var n = addDays(d, 1);
      while (set[ymd(n)]) n = addDays(n, 1);
      set[ymd(n)] = true;
    });
    return (HOL[y] = set);
  }
  function isHoliday(d) { return !!holidaysOf(d.getFullYear())[ymd(d)]; }

  var days = null;
  try { days = JSON.parse(localStorage.getItem(DAYS_KEY) || 'null'); } catch (e) { days = null; }
  function closedDows() { return days && Array.isArray(days.closedDows) ? days.closedDows : CLOSED_DOWS; }
  function exceptionOn(d) { return (days && days.exceptions && days.exceptions[ymd(d)]) || null; }
  function isClosedDay(d) {
    var ex = exceptionOn(d);
    if (ex) return ex === 'closed';
    if (isHoliday(d)) return false;
    return closedDows().indexOf(d.getDay()) >= 0;
  }
  /** これから n 日のうち、いつもとちがう日。祝日の火曜（いつも営業）は入れない */
  function specialDays(n) {
    var out = [], today = new Date();
    for (var i = 0; i < n; i++) {
      var d = addDays(today, i), usual = closedDows().indexOf(d.getDay()) >= 0 && !isHoliday(d), closed = isClosedDay(d);
      if (closed !== usual) out.push({ date: d, open: !closed });
    }
    return out;
  }
  /** 返事を確かめて、使える形だけを残す（形がちがえば null） */
  function readDays(j) {
    if (!j || j.ok !== true || j.store !== 'baguru' || !j.exceptions || typeof j.exceptions !== 'object') return null;
    var dows = j.closedDows;
    if (dows !== null && !(Array.isArray(dows) && dows.every(function (n) { return n === Math.floor(n) && n >= 0 && n <= 6; }))) return null;
    var ex = {};
    Object.keys(j.exceptions).forEach(function (k) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && (j.exceptions[k] === 'open' || j.exceptions[k] === 'closed')) ex[k] = j.exceptions[k];
    });
    return { closedDows: dows, exceptions: ex, at: Date.now() };
  }
  function loadDays() {
    var url = window.BAGURU && window.BAGURU.daysUrl;
    if (!url || !window.fetch || (days && Date.now() - days.at < DAYS_EVERY)) return;
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var d = readDays(j);
      if (!d) return;
      days = d;
      try { localStorage.setItem(DAYS_KEY, JSON.stringify(d)); } catch (e) { /* 覚えられなくても、このページでは使う */ }
      renderDays();
      renderToday();
    }).catch(function () { /* 読めないときは、前に読めた分のまま */ });
  }

  function renderDays() {
    var w = closedDows();
    document.querySelectorAll('[data-days="dows"]').forEach(function (el) {
      el.textContent = w.length ? w.map(function (n) { return WEEK[n]; }).join('・') + '曜日' : 'なし';
    });
    document.querySelectorAll('[data-days="note"]').forEach(function (el) { el.hidden = !w.length; });
    var list = specialDays(61);   // T3Works の口が返すのと同じ「今日から60日先まで」
    document.querySelectorAll('[data-days="special"]').forEach(function (box) {
      var ul = box.querySelector('ul');
      ul.textContent = '';
      list.slice(0, 8).forEach(function (s) {
        var li = document.createElement('li'), k = document.createElement('span');
        k.className = 'k' + (s.open ? ' is-open' : '');
        k.textContent = s.open ? '営業します' : 'お休み';
        li.appendChild(document.createTextNode(mdw(s.date)));
        li.appendChild(k);
        ul.appendChild(li);
      });
      if (list.length > 8) { var more = document.createElement('li'); more.textContent = 'ほか' + (list.length - 8) + '日'; ul.appendChild(more); }
      box.hidden = !list.length;
    });
  }

  // 営業時間：月・水〜金は昼と夜、土・日・祝日はとおし。ラストオーダーは閉店の30分前
  var WEEKDAY = [['11:00', '15:00'], ['17:00', '22:30']];
  var WEEKEND = [['11:00', '22:30']];
  function hoursOf(d) {
    if (isClosedDay(d)) return null;
    var w = d.getDay();
    return (w === 0 || w === 6 || isHoliday(d)) ? WEEKEND : WEEKDAY;
  }
  function toMin(t) { var p = t.split(':'); return Number(p[0]) * 60 + Number(p[1]); }

  function renderToday() {
    var els = document.querySelectorAll('[data-today]');
    if (!els.length) return;
    var now = new Date(), h = hoursOf(now), m = now.getHours() * 60 + now.getMinutes();
    var text, label, open = false;
    if (!h) {
      text = exceptionOn(now) === 'closed' ? '本日は臨時休業' : '本日は定休日';
      label = '';
      for (var n = 1; n <= 14; n++) {
        var d = addDays(now, n);
        if (hoursOf(d)) { label = n === 1 ? '明日は営業' : '次の営業は ' + mdw(d); break; }
      }
    } else {
      text = h.map(function (r) { return r[0] + '–' + r[1]; }).join(' / ');
      label = '本日の営業は終了';
      for (var i = 0; i < h.length; i++) {
        var s = toMin(h[i][0]), e = toMin(h[i][1]);
        if (m < s) { label = h[i][0] + 'から営業'; break; }
        if (m < e - 30) { label = '営業中'; open = true; break; }
        if (m < e) { label = 'ラストオーダー終了'; break; }
      }
    }
    els.forEach(function (el) {
      el.textContent = text;
      if (!label) return;
      var b = document.createElement('span');
      b.className = 'status' + (open ? ' is-open' : '');
      b.textContent = label;
      el.appendChild(b);
    });
  }
  renderDays();
  renderToday();
  loadDays();
  setInterval(function () { renderToday(); loadDays(); }, 60000);

  /* ---------- 飾りと動き ----------
     ・「動きを減らす」設定の端末では、現れる動き・火の粉・透かしを動かすのはしない（進み具合の線だけ） */
  var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var canIO = 'IntersectionObserver' in window;

  // スクロールで現れるもの。[どれ, 出かた]。前に書いたものが先（写真の幕は、ほかの書き方より先に決める）
  var RV = [
    ['.howto-img, .chapter figure, .mh figure, .in-main, .in-gallery > figure, .landmark > figure, .pic-fig', 'rv-mask'],
    ['.sh', ''], ['.today-list > li', ''], ['.hb-grid > li', ''], ['.sauce', ''], ['.style-grid > .st', ''],
    ['.steps > li', 'rv-left'], ['.chapter > div, .mh > div', ''], ['.cards > .card', ''], ['.duo > .duo-item', ''],
    ['.band-in', ''], ['.news-list > li', ''], ['.news-art', ''], ['.access > .map', 'rv-left'], ['.access .info > div', 'rv-right'],
    ['.crew-in', ''], ['.flow > li', ''], ['.points > .point', ''], ['.notice', ''], ['.faq details', ''], ['.grid5 > .mini', ''],
    ['.order', ''], ['.rc-pay > div', ''], ['.req', ''], ['.port > *', ''], ['.seat-list', '']
  ];
  var pending = [];
  function reveal() {
    var els = [];
    RV.forEach(function (r) {
      document.querySelectorAll(r[0]).forEach(function (el) {
        // 予約・問い合わせのフォームの中は動かさない（入力の途中で見えなくならないように）
        if (el.classList.contains('rv') || el.closest('form, .rsv-confirm, .rsv-done, .form-done')) return;
        el.classList.add('rv');
        if (r[1]) el.classList.add(r[1]);
        els.push(el);
      });
    });
    var io = new IntersectionObserver(function (entries) {
      // 同じときに画面に入ったものは、上から（同じ高さなら左から）順に、少しずつずらして出す
      var shown = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
      shown.sort(function (a, b) {
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return (Math.round(ra.top) - Math.round(rb.top)) || (ra.left - rb.left);
      });
      shown.forEach(function (el, i) {
        el.style.setProperty('--rv-d', (Math.min(i, 6) * 0.09).toFixed(2) + 's');
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    els.forEach(function (el) { io.observe(el); });
    pending = els;
  }
  // 速くスクロールしたときやリンクで下へ飛んだときに、出ないまま画面の上へ過ぎたものは、すぐ出しておく
  function passed() {
    var done = [];
    pending = pending.filter(function (el) {
      if (el.classList.contains('in')) return false;
      if (el.getBoundingClientRect().bottom < 0) { done.push(el); return false; }
      return true;
    });
    return done;
  }

  // 火の粉：黒い面の下から、ふわっと上がって消える粒。粒ごとに場所・大きさ・速さを変える
  function sparks() {
    document.querySelectorAll('.hero-txt, .phero, .band').forEach(function (box) {
      var wrap = document.createElement('span');
      wrap.className = 'sparks';
      wrap.setAttribute('aria-hidden', 'true');
      var n = box.classList.contains('hero-txt') ? 18 : 12;
      for (var i = 0; i < n; i++) {
        var p = document.createElement('i');
        p.style.cssText = '--x:' + (Math.random() * 100).toFixed(1) + '%;--s:' + (3 + Math.random() * 4).toFixed(1) + 'px'
          + ';--t:' + (5 + Math.random() * 6).toFixed(1) + 's;--d:-' + (Math.random() * 10).toFixed(1) + 's'
          + ';--dx:' + Math.round((Math.random() - 0.5) * 120) + 'px;--h:' + Math.round(220 + Math.random() * 320) + 'px';
        wrap.appendChild(p);
      }
      var inner = box.querySelector('.phero-in, .band-in');
      box.insertBefore(wrap, inner && inner.parentNode === box ? inner : null);
      if (canIO) new IntersectionObserver(function (es) { wrap.classList.toggle('is-off', !es[0].isIntersecting); }).observe(box);
    });
  }

  // スクロールに合わせて：ヘッダーの下の進み具合の線・透かしの英字を横に・帯の写真を少しゆっくり
  var hd = document.querySelector('.hd');
  var drifts = still ? [] : [].slice.call(document.querySelectorAll('.sec[data-deco], .phero, .band'));
  var ticking = false;
  function onScroll() {
    ticking = false;
    // 先に位置を全部読んでから、まとめて書く（読み書きを交互にすると、スクロールが重くなる）
    var y = window.pageYOffset, vh = window.innerHeight, max = document.documentElement.scrollHeight - vh;
    var moves = [];
    drifts.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      // 画面のまん中に来たとき 0、下にあるとき +1、上に行ったとき -1
      var k = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2)));
      moves.push(el.hasAttribute('data-deco') ? [el, '--dx', (k * 70).toFixed(1)] : [el, '--py', (k * -0.06 * r.height).toFixed(1)]);
    });
    var done = passed();
    if (hd) {
      hd.style.setProperty('--prog', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
      hd.classList.toggle('is-scrolled', y > 8);
    }
    moves.forEach(function (m) { m[0].style.setProperty(m[1], m[2]); });
    done.forEach(function (el) { el.style.setProperty('--rv-d', '0s'); el.classList.add('in'); });
  }
  function requestScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); } }
  window.addEventListener('scroll', requestScroll, { passive: true });
  window.addEventListener('resize', requestScroll);
  if (!still && canIO) { reveal(); sparks(); }
  onScroll();

  /* ---------- 管理画面の「ページで直す」 ----------
     ・管理画面の中に ?edit で開かれたときだけ js/edit.js を読む（ふだんのお客さまには読ませない） */
  if (/[?&]edit\b/.test(location.search) && window.parent !== window) {
    var me = document.querySelector('script[src*="js/main.js"]'), ed = document.createElement('script');
    ed.src = 'js/edit.js' + (me && me.src.indexOf('?') > 0 ? me.src.slice(me.src.indexOf('?')) : '');
    body.appendChild(ed);
  }

})();
