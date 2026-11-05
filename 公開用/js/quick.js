/* 即予約「いますぐ行く（15分以内）」（ご予約のページ。2026-11-05）
   ・15分以内に来店する方だけの、すぐ確定するネット予約。決めごとは 店舗アプリ/バグる/即予約の決めごと.md
   ・受け口（予約ボードと同じ）の nowAvail で「いま何名まで入れるか」を読み、quickReserve で送る。席は受け口が選ぶ
   ・受け口が受けていないとき（予約ボードのスイッチが「止めている」・受付時間の外・休み・受け口がまだ古い・つながらない）は、
     この画面も、上の「いますぐ行く」のボタンも出さない
   ・送る前に「15分以内にお越しになれる方だけ」「取り消し・遅れるときはお電話で」を見せ、「15分以内にお店に行けます」に印を付けてもらう
   ・送ったあとは「予約が確定しました。○時○分までにお越しください」・予約番号・店の電話
   ・送るときに「受付の印（rid）」を付ける。返事が途中で切れて送り直しても、1件にしかならない
   ・★作る.py の QUICK_ON が True のときだけ、ページに入る */
(function () {
  'use strict';
  var A = window.BaguruApi;
  var sec = document.getElementById('quick');
  if (!sec || !A) return;
  var $ = function (id) { return document.getElementById(id); };
  var TEL = (window.BAGURU && window.BAGURU.tel) || '';
  var EVERY = 60000;                // いまの空きを読み直す間隔（来店時刻が1分ごとに進むため）
  var PEOPLE_MAX = 15;              // 選べる人数（ネット予約と同じ。それより多い方はお電話で）
  var state = { avail: null, people: 0, rid: '', sending: false, done: false, closed: false };

  var MSG = {
    not_accepting: 'ただいま「いますぐ行く」の予約は受け付けていません。日時を選ぶネット予約か、お電話でどうぞ。',
    full: 'いま、席が埋まりました。人数を選び直すか、お電話でどうぞ。',
    bad_people: '人数を選んでください。',
    need_name: 'お名前を入れてください。',
    bad_tel: '電話番号を正しく入れてください（例：090-1234-5678）。',
    bad_email: 'メールアドレスの形が違います（入れなくても予約できます）。',
    bad_kana: 'フリガナはカタカナで入れてください。',
    need_ok: '「15分以内にお店に行けます」に印を付けてください。',
    too_many_bookings: '同じ電話番号でのご予約が多いため、受け付けられませんでした。お電話でどうぞ。',
    busy: '同じ電話番号で、まだお越しになっていない予約があるか、ただいま混み合っています。お電話でどうぞ。',
    offline: 'つながりませんでした。電波の良い所で、もう一度お試しください。',
    no_answer: 'つながりませんでした。時間を置いてもう一度お試しいただくか、お電話でどうぞ。'
  };
  function message(e) {
    var d = e.data || {};
    if (e.code === 'too_many') return 'いまは' + (d.maxPeople || '') + '名までお受けできます。人数を選び直すか、お電話でどうぞ。';
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
  function showAll(on) {
    sec.hidden = !on;
    Array.prototype.forEach.call(document.querySelectorAll('[data-quick-btn]'), function (b) { b.hidden = !on; });
  }

  /* ---------- いまの空き ---------- */
  function load() {
    if (state.done || state.sending) return Promise.resolve();
    return A.post({ action: 'nowAvail' }).then(function (a) {
      state.avail = a;
      if (!a.accepting) { if (!state.closed) showAll(false); else draw(); return; }
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

  function draw() {
    var a = state.avail || {}, now = $('q-now'), form = $('q-form');
    now.textContent = '';
    var list = peopleList();
    if (state.closed || !a.accepting) {
      now.appendChild(line('quick-full', 'ただいま「いますぐ行く」の予約は受け付けていません。'));
      var p = line('', '日時を選ぶネット予約か、お電話（');
      p.appendChild(telLink()); p.appendChild(document.createTextNode('）でどうぞ。'));
      now.appendChild(p);
      form.hidden = true;
      return;
    }
    if (!list.length) {
      now.appendChild(line('quick-full', 'いまは満席です。'));
      var q = line('', '少し時間を置くか、お電話（');
      q.appendChild(telLink()); q.appendChild(document.createTextNode('）でお問い合わせください。'));
      now.appendChild(q);
      form.hidden = true;
      return;
    }
    var cap = line('quick-cap', 'いま ');
    var b = document.createElement('b'); b.textContent = Math.max.apply(null, list) + '名';
    cap.appendChild(b); cap.appendChild(document.createTextNode(' まで入れます'));
    now.appendChild(cap);
    var at = line('quick-at', '');
    var t = document.createElement('b'); t.textContent = hm(a.arriveBy);
    at.appendChild(t); at.appendChild(document.createTextNode(' までにお越しください'));
    now.appendChild(at);
    now.appendChild(line('quick-note', 'いま予約したときの時刻です（' + (a.minutes || 15) + '分後）'));
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
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return MSG.bad_email;
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
    btn.disabled = true; btn.textContent = '送っています…';
    var body = { action: 'quickReserve', rid: state.rid, people: v.people, name: v.name, tel: v.tel, website: v.website };
    if (v.email) body.email = v.email;
    A.post(body).then(function (r) {
      state.done = true;
      $('q-by').textContent = hm(r.arriveBy || r.time);
      $('q-no').textContent = r.no;
      $('q-what').textContent = r.people + '名　' + r.name + ' 様';
      $('q-mailed').hidden = !r.mailed;
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
      btn.disabled = false; btn.textContent = 'この内容で予約する';
    });
  });

  // 開いているあいだは1分ごとに、画面に戻ったときにも読み直す（来店時刻と空きが変わるため）
  setInterval(function () { if (document.visibilityState === 'visible') load(); }, EVERY);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });
  load();
})();
