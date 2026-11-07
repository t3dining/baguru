/* 即予約「今すぐ行く（15分以内）」（ご予約のページ。2026-11-05）
   ・言い方は公式アプリにそろえる（2026-11-06 ko-dai さんの「そろえて公開する」：今すぐ・お席を押さえる）
   ・15分以内に来店する方だけの、すぐ確定するネット予約。決めごとは 店舗アプリ/バグる/即予約の決めごと.md
   ・受け口（予約ボードと同じ）の nowAvail で「いま何名まで入れるか」を読み、quickReserve で送る。席は受け口が選ぶ
   ・受け口が受けていないとき（予約ボードのスイッチが「止めている」・受付時間の外・休み・受け口がまだ古い・つながらない）は、
     この画面も、上の「今すぐ行く」のボタンも出さない
   ・送る前に「15分以内にお越しになれる方だけ」「取り消し・遅れるときはお電話で」を見せ、「15分以内にお店に行けます」に印を付けてもらう
   ・送ったあとは「予約が確定しました。○時○分までにお越しください」・予約番号・店の電話
   ・送るときに「受付の印（rid）」を付ける。返事が途中で切れて送り直しても、1件にしかならない
   ・★作る.py の QUICK_ON が True のときだけ、ページに入る
   ・バグる Owner の中（新しい場所の Owner の hp.html にはめ込まれ、Owner から来たとき。main.js の in-owner）だけ、
     Owner が預かっている公式アプリのテスト用アカウントの鍵を postMessage でもらい、nowAvail・quickReserve に member・key を足す。
     受け口（2026-11-06b〜）は、テスト用の会員なら、スイッチが止まっていても・受付時間の外でも・休みの日でも受け、答えに test: true を付ける。
     （2026-11-06 ko-dai さんの指示「オーナーから開いたホームページもいつでも即予約ができるようにしてください」。バグるOwner のセッションに頼まれた）
     知らせ：ここ → Owner { type: 'baguru-hp', kind: 'testAuth-hello' }、Owner → ここ { type: 'baguru-owner', kind: 'testAuth', auth: { no, key } | null }
     ★鍵は覚えない（変数だけ。アドレスにも載せない）。お客さまがふつうに開いたとき（枠の外）は何も変えない */
(function () {
  'use strict';
  var A = window.BaguruApi;
  var sec = document.getElementById('quick');
  if (!sec || !A) return;
  var $ = function (id) { return document.getElementById(id); };
  var TEL = (window.BAGURU && window.BAGURU.tel) || '';
  var EVERY = 15000;                // 今の空きを読み直す間隔。予約ボードのスイッチの入り切りが早く出るように15秒（2026-11-06 ko-dai さんの指示。前は1分）。画面を見ていないときは読まない
  var PEOPLE_MAX = 15;              // 選べる人数（ネット予約と同じ。それより多い方はお電話で）
  var state = { avail: null, people: 0, rid: '', sending: false, done: false, closed: false, test: false };

  /* ---------- バグる Owner の中：テスト用アカウント ---------- */
  var inOwner = document.body.classList.contains('in-owner');   // main.js が付ける（枠の中・Owner から・?edit でない）
  var OWNER_ORIGIN = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.origin : 'https://t3dining-store.github.io';
  var auth = null;          // { no, key }。この変数だけに持つ
  var ready = !inOwner;     // Owner の中では、鍵の返事（または1.5秒）を待ってから最初の nowAvail を送る
  var TEST_BEFORE = 'テスト用アカウント：今すぐの予約を止めているとき・受付時間の外でも試せます（席の空きは本物と同じ。お店の予約ボードに届くので、試したら予約ボードで取り消してください）';
  var TEST_AFTER = 'テスト用アカウントの試しの予約です。お店の予約ボードに「試」の印で届いています。確かめたら、予約ボードで取り消してください。';
  var NO_TEST = 'いつでも即予約を試すには、先に Owner の「公式アプリ」でテスト用アカウントを作ってください。';
  function askAuth() {
    if (!inOwner) return Promise.resolve();
    return new Promise(function (done) {
      var over = false;
      function end() { if (over) return; over = true; window.removeEventListener('message', onMsg); ready = true; done(); }
      function onMsg(e) {
        if (e.source !== window.parent || e.origin !== OWNER_ORIGIN) return;
        var d = e.data;
        if (!d || d.type !== 'baguru-owner' || d.kind !== 'testAuth') return;
        var a = d.auth, no = a && (typeof a.no === 'string' || typeof a.no === 'number') ? String(a.no) : '';
        auth = no && typeof a.key === 'string' && no.length <= 64 && a.key.length && a.key.length <= 256 ? { no: no, key: a.key } : null;
        end();
      }
      window.addEventListener('message', onMsg);
      try { window.parent.postMessage({ type: 'baguru-hp', kind: 'testAuth-hello' }, OWNER_ORIGIN); } catch (x) { end(); return; }
      setTimeout(end, 1500);
    });
  }
  function withAuth(body) {
    if (auth) { body.member = auth.no; body.key = auth.key; }
    return body;
  }
  // Owner の中だけの一言（テスト用アカウントで試せること・作り方の案内）
  function ownerNote() {
    if (!inOwner) return;
    var now = $('q-now'), p = line('quick-test', state.test ? TEST_BEFORE : auth ? '' : NO_TEST);
    if (p.textContent) now.insertBefore(p, now.firstChild);
  }

  var MSG = {
    not_accepting: '今は、今すぐ席を押さえるご予約を受け付けていません。日時を選ぶネット予約か、お電話でどうぞ。',
    full: '今、席が埋まりました。人数を選び直すか、お電話でどうぞ。',
    bad_people: '人数を選んでください。',
    need_name: 'お名前を入れてください。',
    bad_tel: '電話番号を正しく入れてください（例：090-1234-5678）。',
    need_email: 'メールアドレスを入れてください（確定のメールをお送りします）。',   // 2026-11-08 から必須（ko-dai さんの指示「予約も注文も必ずメールが送られるように」）
    bad_email: 'メールアドレスの形が違います。',
    bad_kana: 'フリガナはカタカナで入れてください。',
    need_ok: '「15分以内にお店に行けます」に印を付けてください。',
    too_many_bookings: '同じ電話番号でのご予約が多いため、受け付けられませんでした。お電話でどうぞ。',
    busy: '同じ電話番号で、まだお越しになっていない予約があるか、ただいま混み合っています。お電話でどうぞ。',
    offline: 'つながりませんでした。電波の良い所で、もう一度お試しください。',
    no_answer: 'つながりませんでした。時間を置いてもう一度お試しいただくか、お電話でどうぞ。'
  };
  function message(e) {
    var d = e.data || {};
    if (e.code === 'too_many') return '今は' + (d.maxPeople || '') + '名までお受けできます。人数を選び直すか、お電話でどうぞ。';
    return MSG[e.code] || MSG.no_answer;
  }
  function say(t) { var m = $('q-msg'); m.textContent = t || ''; m.hidden = !t; }
  function telLink() {
    var a = document.createElement('a');
    a.href = 'tel:' + TEL.replace(/-/g, '');
    a.textContent = TEL;
    return a;
  }
  // '18:05' → '18時05分'
  function hm(s) {
    var p = String(s || '').split(':');
    return p.length < 2 ? String(s || '') : Number(p[0]) + '時' + p[1] + '分';
  }
  function topButtons(on) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-quick-btn]'), function (b) { b.hidden = !on; });
  }
  function showAll(on) {
    sec.hidden = !on;
    topButtons(on);
  }

  /* ---------- いまの空き ---------- */
  function load() {
    if (state.done || state.sending || !ready) return Promise.resolve();
    return A.post(withAuth({ action: 'nowAvail' })).then(function (a) {
      state.avail = a;
      state.test = !!a.test;
      // 受けていない（予約ボードで止めている・受付時間の外・休み）ときも、画面は隠さずに「受け付けていません」と電話のボタンを出す
      // （2026-11-06 ko-dai さんの「そろえる」。公式アプリと同じ）。上の「今すぐ行く」のボタンだけは隠す。入れていた字は残る
      if (!a.accepting) { sec.hidden = false; topButtons(false); draw(); return; }   // Owner の中では、受けていないことと案内を出す
      state.closed = false;
      showAll(true);
      draw();
    }).catch(function () {
      // 受け口がまだ古い（unknown_action）・つながらない：初めてなら出さない。出していたら、そのまま（次に読み直す）
      if (!state.avail) showAll(false);
    });
  }

  function peopleList() {
    var a = state.avail || {};
    return (a.people || []).map(Number).filter(function (n) { return n > 0 && n <= PEOPLE_MAX; });
  }

  function draw() { drawMain(); ownerNote(); }
  function drawMain() {
    var a = state.avail || {}, now = $('q-now'), form = $('q-form');
    now.textContent = '';
    var list = peopleList();
    if (state.closed || !a.accepting) {
      // 公式アプリと同じ文：「今は、今すぐ席を押さえるご予約を受け付けていません」と、電話のボタン
      var off = line('quick-full', '今は、今すぐ席を押さえるご予約を');
      var offTail = document.createElement('bg-lp'); offTail.textContent = '受け付けていません。';   // 「受け付け／ていません」と割れないように
      off.appendChild(document.createElement('wbr')); off.appendChild(offTail);
      now.appendChild(off);
      var bs = document.createElement('div');
      bs.className = 'btns center quick-off-btns';
      var call = document.createElement('a');
      call.className = 'btn btn-ember'; call.href = 'tel:' + TEL.replace(/-/g, ''); call.textContent = '電話する ' + TEL;
      var net = document.createElement('a');
      net.className = 'btn btn-line'; net.href = '#booking'; net.textContent = '日時を選んでネット予約';
      bs.appendChild(call); bs.appendChild(net);
      now.appendChild(bs);
      form.hidden = true;
      return;
    }
    if (!list.length) {
      now.appendChild(line('quick-full', '今は満席です。'));
      var q = line('', '少し時間を置くか、お電話（');
      q.appendChild(telLink()); q.appendChild(document.createTextNode('）でお問い合わせください。'));
      now.appendChild(q);
      form.hidden = true;
      return;
    }
    var cap = line('quick-cap', '今 ');
    var b = document.createElement('b'); b.textContent = Math.max.apply(null, list) + '名';
    cap.appendChild(b); cap.appendChild(document.createTextNode(' まで入れます'));
    now.appendChild(cap);
    // 「押さえたら ○時○分（今から15分）までにお越しください」（公式アプリと同じ言い方）
    var at = line('quick-at', '押さえたら ');
    var t = document.createElement('b'); t.textContent = hm(a.arriveBy);
    at.appendChild(t); at.appendChild(document.createTextNode('（今から' + (a.minutes || 15) + '分）'));
    var tail = document.createElement('bg-lp');     // 「までにお越しください」は割らない（css の bg-lp。作る.py の最後の文節と同じ）
    tail.textContent = 'までにお越しください';
    at.appendChild(document.createElement('wbr')); at.appendChild(tail);
    now.appendChild(at);
    form.hidden = false;
    renderPeople(list);
    // 受け口はもっと入れても、ここで選べるのは15名まで。それより多い方はお電話で（ネット予約と同じ）
    var more = $('q-people-note');
    more.textContent = '';
    if (Number(a.maxPeople) > PEOPLE_MAX) {
      more.appendChild(document.createTextNode((PEOPLE_MAX + 1) + '名以上は、お電話（'));
      more.appendChild(telLink());
      more.appendChild(document.createTextNode('）でどうぞ。'));
    }
  }
  function line(cls, text) { var p = document.createElement('p'); if (cls) p.className = cls; p.textContent = text; return p; }

  function renderPeople(list) {
    if (list.indexOf(state.people) < 0) state.people = 0;
    var box = $('q-people');
    box.textContent = '';
    list.forEach(function (n) {
      var l = document.createElement('label'), i = document.createElement('input'), s = document.createElement('span');
      l.className = 'chip';
      i.type = 'radio'; i.name = 'q-people'; i.value = String(n); i.checked = state.people === n;
      s.textContent = n + '名';
      l.appendChild(i); l.appendChild(s);
      box.appendChild(l);
    });
  }
  $('q-people').addEventListener('change', function (e) {
    if (e.target && e.target.name === 'q-people') { state.people = Number(e.target.value) || 0; state.rid = ''; }
  });
  ['q-name', 'q-tel', 'q-email'].forEach(function (id) { $(id).addEventListener('input', function () { state.rid = ''; }); });

  /* ---------- 送る ---------- */
  function values() {
    return {
      people: state.people, name: $('q-name').value.trim(), tel: $('q-tel').value.trim(),
      email: $('q-email').value.trim(), website: $('q-website').value
    };
  }
  function check(v) {
    if (!v.people) return MSG.bad_people;
    if (!v.name) return MSG.need_name;
    if (!/^0\d{9,10}$/.test(v.tel.replace(/[^\d]/g, ''))) return MSG.bad_tel;
    if (!v.email) return MSG.need_email;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return MSG.bad_email;
    if (!$('q-ok').checked) return MSG.need_ok;
    return '';
  }

  $('q-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.sending) return;
    var v = values(), err = check(v);
    if (err) { say(err); return; }
    say('');
    if (!state.rid) state.rid = A.rid();     // 同じ内容の送り直しは同じ印（2回届いても1件）
    var btn = $('q-send');
    state.sending = true;
    btn.disabled = true; btn.textContent = '押さえています…';
    var body = withAuth({ action: 'quickReserve', rid: state.rid, people: v.people, name: v.name, tel: v.tel, website: v.website });
    body.email = v.email;
    A.post(body).then(function (r) {
      state.done = true;
      $('q-by').textContent = hm(r.arriveBy || r.time);
      $('q-no').textContent = r.no;
      $('q-what').textContent = r.people + '名　' + r.name + ' 様';
      $('q-mailed').hidden = !r.mailed;
      if (r.test) { var tp = line('quick-test', TEST_AFTER); $('q-done').insertBefore(tp, $('q-done').querySelector('h3').nextSibling); }
      $('q-form').hidden = true;
      $('q-now').hidden = true;
      $('q-done').hidden = false;
      sec.scrollIntoView({ behavior: 'smooth' });
    }).catch(function (e) {
      if (e.code !== 'offline' && e.code !== 'no_answer') state.rid = '';   // 断られたときは、次は新しい印で
      if (e.code === 'not_accepting') { state.closed = true; state.sending = false; say(''); draw(); return; }
      say(message(e));
      if (e.code === 'full' || e.code === 'too_many') { state.sending = false; load(); }
    }).then(function () {
      state.sending = false;
      btn.disabled = false; btn.textContent = '今すぐ席を押さえる（予約を確定）';
    });
  });

  // 開いているあいだは15秒ごとに、画面に戻ったときにも読み直す（スイッチの入り切り・来店時刻・空きが変わるため）
  setInterval(function () { if (document.visibilityState === 'visible') load(); }, EVERY);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });
  askAuth().then(load);
})();
