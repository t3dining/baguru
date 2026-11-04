/* 管理画面の「ページで直す」で使う道具（管理画面の中に、このページを ?edit で開いたときだけ main.js が読む）
   ・作る.py が文のまわりに付けた印（<!--t:キー--> 〜 <!--/t-->）を探して、<bg-t> で包んで点線で囲み、押せるようにする
     メニューの字（名前・説明・値段など。データ/menu.json）にも印がある（<!--m:群.番号.欄--> 〜 <!--/m-->。キーは「m:群.番号.欄」）
     （span でなく bg-t にするのは、ページの CSS（「.st-no span」など）が付かないように。付くと、直す画面でだけ形が変わってしまう）
   ・押したら、その文が入っている枠（いちばん近い、行の箱。p・li・dd・h3 など）をまるごと管理画面に知らせる（2026-11-04。バグるマネージと同じ）
     枠の中の並び（直せる文・直せない字・改行）と、枠の幅・字の形・字の大きさ。管理画面は、それと同じ形の直す欄を作る（だから改行の場所がページと同じ）
   ・管理画面から来た文を、その場で入れかえて見せる（保存は管理画面がする）
   ・文の改行・**太字**・{{TEL}} と、文節の切れ目（<wbr>）の入れ方は、作る.py の rich・add_wbr と同じにする
     文節の切れ目は BudouX（js/budoux-ja.json。作る.py が 道具/budoux_ja.json を写す）で、作る.py の phrases と同じ計算（管理画面の kanri.js にも同じものがある）
   ・★管理画面から来た文は字として入れる（innerHTML は使わない）。知らせを受けるのは、親の画面（管理画面）からだけ
   ・この道具が出す知らせは、ページに出ている字と形だけなので、宛先は絞らない */
(function () {
  'use strict';

  var up = window.parent;
  if (up === window) return;
  // Google の受け口が出す管理画面の場所（n-…-0lu-script.googleusercontent.com の形。2026-11-04 に本物で確かめた。前は「.script.」の形だけを受けていて、打った文がページに出なかった）
  var FROM = /^https:\/\/[a-z0-9-]+[.-]script\.googleusercontent\.com$/;
  var JA = /[぀-ヿ㐀-鿿！-｠]/;
  // 管理画面の直す欄に写す字の形（枠と、枠の中の字のかたまりごと）
  var CS_FRAME = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'wordBreak', 'overflowWrap', 'lineBreak',
    'textAlign', 'textTransform', 'fontFeatureSettings', 'color', 'whiteSpace'];
  var CS_PIECE = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'color', 'textDecorationLine', 'textTransform',
    'verticalAlign', 'whiteSpace', 'display', 'paddingLeft', 'paddingRight', 'marginLeft', 'marginRight', 'backgroundColor', 'borderRadius'];
  var spans = {}, model = null, base = 0, frameOn = null;
  var tel = (window.BAGURU && window.BAGURU.tel) || '';

  var css = document.createElement('style');
  css.textContent = 'bg-t{outline:1px dashed rgba(199,54,29,.6);outline-offset:2px;border-radius:2px;cursor:pointer}' +
    'bg-t:hover{background:rgba(199,54,29,.10)}' +
    '.bg-frame{outline:2px solid #c7361d!important;outline-offset:4px;border-radius:2px}' +
    '.bg-frame bg-t{outline-color:transparent;background:rgba(199,54,29,.10)}';
  document.head.appendChild(css);

  /** 印のあいだを <bg-t data-t="キー"> で包む */
  function wrap() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT), starts = [], c;
    while ((c = walker.nextNode())) if (/^t:[a-z0-9-]+$/.test(c.data) || /^m:[a-z0-9-]+(\.[a-z0-9]+)+$/.test(c.data)) starts.push(c);
    starts.forEach(function (mark) {
      var key = mark.data.charAt(0) === 'm' ? mark.data : mark.data.slice(2), span = document.createElement('bg-t'), n = mark.nextSibling, next;
      span.setAttribute('data-t', key);
      while (n && !(n.nodeType === 8 && (n.data === '/t' || n.data === '/m'))) { next = n.nextSibling; span.appendChild(n); n = next; }
      mark.parentNode.insertBefore(span, mark.nextSibling);
      (spans[key] = spans[key] || []).push(span);
    });
    // よくある質問の答えも見えるように開く
    document.querySelectorAll('details').forEach(function (d) { d.open = true; });
  }

  /** 文節に分ける（作る.py の phrases と同じ。字は1文字ずつ数える） */
  function phrases(text) {
    var s = Array.from(text), out = [];
    if (!s.length) return out;
    function g(k, key) { return (model[k] && model[k][key]) || 0; }
    function sl(a, b) { return s.slice(a, b).join(''); }
    out.push(s[0]);
    for (var i = 1; i < s.length; i++) {
      var sc = base;
      if (i > 2) sc += g('UW1', s[i - 3]) + g('TW1', sl(i - 3, i));
      if (i > 1) sc += g('UW2', s[i - 2]) + g('BW1', sl(i - 2, i)) + g('TW2', sl(i - 2, i + 1));
      sc += g('UW3', s[i - 1]) + g('UW4', s[i]) + g('BW2', sl(i - 1, i + 1));
      if (i + 1 < s.length) sc += g('UW5', s[i + 1]) + g('BW3', sl(i, i + 2)) + g('TW3', sl(i - 1, i + 2));
      if (i + 2 < s.length) sc += g('UW6', s[i + 2]) + g('TW4', sl(i, i + 3));
      if (sc > 0) out.push(s[i]); else out[out.length - 1] += s[i];
    }
    return out;
  }

  /** 字のかたまりを入れる。日本語なら文節ごとに <wbr> をはさむ（作る.py の add_wbr と同じ） */
  function putText(box, chunk) {
    if (!chunk) return;
    var parts = model && JA.test(chunk) ? phrases(chunk) : [chunk];
    parts.forEach(function (p, i) {
      if (i) box.appendChild(document.createElement('wbr'));
      box.appendChild(document.createTextNode(p));
    });
  }

  /** 文を入れかえる：** で囲んだところは <b>、改行は <br>（作る.py の rich と同じ）。メニューの字（m:）は ** を太字にしない（作る.py の mt と同じ） */
  function render(span, text, plain) {
    text = String(text).replace(/\{\{TEL\}\}/g, tel);
    while (span.firstChild) span.removeChild(span.firstChild);
    if (plain) {
      text.split('\n').forEach(function (line, j) { if (j) span.appendChild(document.createElement('br')); putText(span, line); });
      return;
    }
    text.split(/\*\*([\s\S]+?)\*\*/).forEach(function (piece, i) {
      var box = span;
      if (i % 2) { box = document.createElement('b'); span.appendChild(box); }
      piece.split('\n').forEach(function (line, j) {
        if (j) box.appendChild(document.createElement('br'));
        putText(box, line);
      });
    });
  }

  /* ---------- 枠（押した文が入っている、行の箱） ---------- */

  function shown(el) { return getComputedStyle(el).display; }
  function blockOf(el) {
    while (el && el !== document.body && /^(inline|contents)/.test(shown(el)) && !/^inline-(block|flex|grid)$/.test(shown(el))) el = el.parentElement;
    return el || document.body;
  }
  function styleOf(el, keys) { var cs = getComputedStyle(el), o = {}; keys.forEach(function (k) { o[k] = String(cs[k] || ''); }); return o; }
  function bgOf(el) {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      var c = getComputedStyle(el).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)) return c;
    }
    return '#ffffff';
  }
  function firstLeft(node) {
    var r = document.createRange();
    r.selectNodeContents(node);
    var rc = Array.prototype.filter.call(r.getClientRects(), function (x) { return x.width > 0; })[0];
    return rc ? rc.left : null;
  }

  /** 枠の中の並び：[{k: キー} | {t: 直せない字} | {br: true}]（どれにも cs＝字の形）。行の箱が中にあれば、そこで区切り、押した文のある区切りだけ */
  function frameInfo(sp) {
    var box = blockOf(sp.parentElement), runs = [[]], mine = 0;
    function add(p, node) {
      p.cs = styleOf(node.nodeType === 1 ? node : node.parentElement, CS_PIECE);
      // 字だけのかたまりは、まわりの箱の形（display・すき間・地の色）を持たない（持たせると、直す欄で1つずつ行が分かれてしまう）
      if (node.nodeType !== 1 || !/^inline-(block|flex|grid)$/.test(p.cs.display)) ['display', 'paddingLeft', 'paddingRight', 'marginLeft', 'marginRight', 'backgroundColor', 'borderRadius'].forEach(function (k) { delete p.cs[k]; });
      p.node = node;
      runs[runs.length - 1].push(p);
    }
    (function walk(node) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          var t = n.nodeValue.replace(/\s+/g, ' ');
          if (t) add({ t: t }, n);
          continue;
        }
        if (n.nodeType !== 1) continue;
        var d = shown(n);
        if (d === 'none' || /^(SCRIPT|STYLE|WBR|svg|IMG|INPUT|SELECT|TEXTAREA|IFRAME)$/i.test(n.nodeName)) continue;
        if (n.nodeName === 'BG-T') { if (n === sp) mine = runs.length - 1; add({ k: n.getAttribute('data-t') }, n); continue; }
        if (n.nodeName === 'BR') { add({ br: true }, n); continue; }
        if (!/^inline/.test(d)) { runs.push([]); continue; }          // 中の行の箱：ここで区切る（その中は別の枠）
        if (/^inline-(block|flex|grid)$/.test(d)) {                     // 札など：中に直せる文が1つなら、その文。無ければ直せない字
          var inner = n.querySelectorAll('bg-t');
          if (inner.length === 1) { if (inner[0] === sp) mine = runs.length - 1; add({ k: inner[0].getAttribute('data-t') }, n); }
          else if (!inner.length && n.textContent.trim()) add({ t: n.textContent.replace(/\s+/g, ' ').trim() }, n);
          else walk(n);
          continue;
        }
        walk(n);
      }
    })(box);
    var run = runs[mine] || [];
    while (run.length && run[0].t && !run[0].t.trim()) run.shift();                       // はじめと終わりの空白は出ない
    while (run.length && run[run.length - 1].t && !run[run.length - 1].t.trim()) run.pop();
    if (run.length && run[0].t) run[0].t = run[0].t.replace(/^\s+/, '');
    if (run.length && run[run.length - 1].t) run[run.length - 1].t = run[run.length - 1].t.replace(/\s+$/, '');
    var cs = getComputedStyle(box), rect = box.getBoundingClientRect(), px = function (v) { return parseFloat(v) || 0; };
    var left = rect.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
    var st = styleOf(box, CS_FRAME);
    st.w = rect.width - px(cs.borderLeftWidth) - px(cs.borderRightWidth) - px(cs.paddingLeft) - px(cs.paddingRight);
    st.bg = bgOf(box);
    var fl = run.length ? firstLeft(run[0].node) : null;
    st.indent = fl === null ? 0 : Math.max(0, Math.round((fl - left) * 100) / 100);
    // 1行で、字の長さに合わせて縮む枠（flex の中の字など）は、打った字に合わせて、枠が広がれる所まで広げる（バグるマネージの fit と同じ）
    var rects = [];
    run.forEach(function (p) {
      var rg = document.createRange();
      rg.selectNodeContents(p.node);
      Array.prototype.forEach.call(rg.getClientRects(), function (x) { if (x.width > 0) rects.push(x); });
    });
    if (rects.length && rects.every(function (x) { return Math.abs(x.top - rects[0].top) < 3; })) {
      var used = Math.max.apply(null, rects.map(function (x) { return x.right; })) - Math.min.apply(null, rects.map(function (x) { return x.left; }));
      var par = box.parentElement;
      if (st.w - used - st.indent < 1.5 && par) {
        var pcs = getComputedStyle(par);
        st.fit = true;
        st.max = par.getBoundingClientRect().width - px(pcs.paddingLeft) - px(pcs.paddingRight) - px(pcs.borderLeftWidth) - px(pcs.borderRightWidth);
      }
    }
    var pieces = run.map(function (p) { var o = { cs: p.cs }; if (p.k) o.k = p.k; else if (p.br) o.br = true; else o.t = p.t; return o; });
    return { box: box, pieces: pieces, st: st };
  }

  function light(box) {
    if (frameOn) frameOn.classList.remove('bg-frame');
    frameOn = box;
    if (box) box.classList.add('bg-frame');
  }
  function center(el) {
    // このページの中だけを動かす（scrollIntoView だと外の管理画面まで動く）。ページの CSS はなめらかに動くので、ここでは、すぐに動かす
    var r = el.getBoundingClientRect(), root = document.documentElement, was = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, window.scrollY + r.top + r.height / 2 - window.innerHeight / 2);
    root.style.scrollBehavior = was;
  }

  function tell(msg) { msg.bg = 'edit'; up.postMessage(msg, '*'); }

  // ページの中では、リンクやボタンを動かさない。点線の文を押したら、その枠をまるごと管理画面に知らせる
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    var sp = t && t.closest('bg-t');
    if (t && (sp || t.closest('a, button, summary, label'))) e.preventDefault();
    if (!sp) return;
    var f = frameInfo(sp);
    light(f.box);
    tell({ type: 'pick', key: sp.getAttribute('data-t'), frame: { pieces: f.pieces, st: f.st } });
  }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

  window.addEventListener('message', function (e) {
    if (e.source !== up || !(e.origin === location.origin || FROM.test(e.origin))) return;
    var d = e.data || {};
    if (d.bg !== 'kanri') return;
    if (d.type === 'set') {
      Object.keys(d.texts || {}).forEach(function (k) { (spans[k] || []).forEach(function (sp) { render(sp, d.texts[k], k.slice(0, 2) === 'm:'); }); });
    } else if (d.type === 'pick') {
      // 管理画面が直している枠（開き直したとき・全ページ共通を選んだとき）。frame があれば、枠の形も知らせ直す
      var sp = (spans[String(d.key || '')] || [])[0];
      if (!sp) return light(null);
      var f = frameInfo(sp);
      light(f.box);
      center(f.box);
      if (d.want) tell({ type: 'pick', key: d.key, frame: { pieces: f.pieces, st: f.st } });
    }
  });

  function ready() {
    wrap();
    var page = (document.body.className.match(/\bpage-([a-z]+)/) || [])[1] || '';
    tell({ type: 'ready', page: page, keys: Object.keys(spans), tel: tel });   // tel：直す欄の {{TEL}} に出す電話番号
  }
  fetch('js/budoux-ja.json').then(function (r) { return r.json(); }).then(function (m) {
    model = m;
    Object.keys(m).forEach(function (k) { Object.keys(m[k]).forEach(function (x) { base -= m[k][x]; }); });
    base *= 0.5;
  }).catch(function () { /* 読めなくても、文の入れかえはできる（改行のところが少し変わるだけ） */ }).then(ready);
})();
