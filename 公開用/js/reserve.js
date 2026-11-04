/* ネット予約のフォーム（ご予約のページ）
   人数 → 日にち（カレンダー） → 時間 → お客様のこと → 確認 → 受け付けました
   ・送るのは「リクエスト」。お店が予約ボードで承認すると、確定のメールが届く（メールアドレスは必須）
   ・空き状況は受け口（avail）から読む。お客様の情報は送るだけで、ここには残さない
   ・送るときに「受付の印（rid）」を付ける。返事が途中で切れて送り直しても、リクエストは1件にしかならない */
(function () {
  'use strict';
  var A = window.BaguruApi, esc = A.esc;
  var form = document.getElementById('rsv');
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var TEL = (window.BAGURU && window.BAGURU.tel) || '';

  var state = { avail: null, people: 0, date: '', time: '', rid: '', month: '' };

  var MSG = {
    not_ready: 'ネット予約はただいま準備中です。お電話でご予約ください。',
    not_accepting: 'ネット予約はただいま受け付けていません。お電話でどうぞ。',
    full: 'この時間は、今、満席になりました。他の時間を選んでください。',
    no_slot: 'この時間は予約を受け付けていません。他の時間を選んでください。',
    out_of_range: 'この日はネット予約の受付期間の外です。',
    bad_date: '日にちと時間を選んでください。',
    bad_people: '人数を選んでください。',
    need_name: 'お名前を入れてください。',
    bad_tel: '電話番号を正しく入れてください（例：090-1234-5678）。',
    need_email: 'メールアドレスを入れてください（確定のお知らせをお送りします）。',
    bad_email: 'メールアドレスの形が違います。',
    too_many_bookings: '同じ電話番号でのご予約・リクエストが多いため、受け付けられませんでした。お電話でどうぞ。',
    busy: 'ただいま混み合っています。少し時間を置いて、もう一度お試しください。',
    offline: 'つながりませんでした。電波の良い所で、もう一度お試しください。',
    no_answer: 'つながりませんでした。時間を置いてもう一度お試しいただくか、お電話でどうぞ。',
    taken_time: '選んでいた時間が、今、埋まりました。他の時間を選んでください。',
    taken_day: '選んでいた日が、今、埋まりました。他の日を選んでください。'
  };
  function message(e) {
    var d = e.data || {};
    if (e.code === 'too_late') return 'この時間のネット予約は締め切りました（来店の' + d.leadHours + '時間前まで）。お電話でどうぞ。';
    if (e.code === 'too_many') return d.maxPeople + '名を超えるご予約は、お電話でお受けします。';
    return MSG[e.code] || MSG.no_answer;
  }
  function show(el, on) { el.hidden = !on; }
  function say(text) { var m = $('r-msg'); m.textContent = text || ''; show(m, !!text); if (text) m.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  function off(text) {
    form.querySelectorAll('.rsv-step, #r-next, .consent').forEach(function (el) { show(el, false); });
    var o = form.querySelector('[data-off]');
    o.innerHTML = esc(text) + (TEL ? '<br><a class="btn btn-ember" href="tel:' + TEL.replace(/-/g, '') + '">電話する ' + esc(TEL) + '</a>' : '');
    show(o, true);
  }

  /* ---------- 空き状況 ---------- */
  // その時刻に、選んだ人数が入れるか（受け口が、電話の予約も入った台帳から、空いている席を数えて返す）
  function fits(s) {
    if (s.late || s.left <= 0) return false;
    if (s.single === undefined) return true;
    var p = state.people || 1, maxTable = state.avail.maxTable || 0;
    return p <= s.single || (p > maxTable && p <= s.group);
  }
  // その時刻に、選んだ人数が入れる空き卓（卓に入らない人数は、空いているグループ）がいくつあるか。受け口が数を返さないときは null
  function options(s) {
    if (!s.n) return null;
    var p = state.people || 1, caps = state.avail.caps || [], maxTable = state.avail.maxTable || 0;
    if (p <= maxTable) {
      for (var i = 0; i < caps.length; i++) if (caps[i] >= p) return s.n[i] || 0;
      return 0;
    }
    return (s.g || []).filter(function (c) { return c >= p; }).length;
  }
  // 「残りわずか」でないか：入れる卓が2つ以上（数が無いときは、受けられる組数で見る）
  function plenty(s) {
    var o = options(s);
    return o === null ? s.left >= Math.min(2, state.avail.cap) : o >= 2;
  }
  function dayMark(d) {
    if (d.type === 'closed') return { m: '休', cls: 'is-closed', ok: false };
    var open = d.slots.filter(fits);
    // 締め切りの時間を過ぎただけの日（その日の夜など）は、満席と言わない
    if (!open.length && d.slots.every(function (s) { return s.late; })) return { m: '－', cls: 'is-closed', ok: false, sr: ' 受付終了' };
    if (!open.length) return { m: '×', cls: 'is-full', ok: false };
    return open.some(plenty) ? { m: '○', cls: '', ok: true } : { m: '△', cls: 'is-few', ok: true };
  }
  function slotMark(s) {
    if (s.late) return '－';
    if (!fits(s)) return '×';
    return plenty(s) ? '○' : '△';
  }

  // 選べる人数は15名まで（公式アプリと同じ。2026-11-04 ko-dai さんの指示。横5×縦3。16名以上はお電話で）。受け口の「1組の最大人数」がこれより少なければ、そちらに合わせる
  var PEOPLE_MAX = 15;
  function peopleMax() { return Math.min(PEOPLE_MAX, Number(state.avail.maxPeople) || PEOPLE_MAX); }

  function renderPeople() {
    var max = peopleMax(), h = '', tel = (window.BAGURU && window.BAGURU.tel) || '';
    if (state.people > max) state.people = 0;
    for (var n = 1; n <= max; n++) {
      h += '<label class="chip"><input type="radio" name="people" value="' + n + '"' + (state.people === n ? ' checked' : '') + '><span>' + n + '名</span></label>';
    }
    $('r-people').innerHTML = h;
    // 「16名以上のご予約は、お電話（0565-85-7955）でお問い合わせください。」（公式アプリと同じ文。電話番号は押すとかけられる）
    var note = $('r-people-note'), a = document.createElement('a');
    note.textContent = (max + 1) + '名以上のご予約は、';
    a.href = 'tel:' + tel.replace(/-/g, '');
    a.textContent = 'お電話（' + tel + '）';
    note.appendChild(a);
    note.appendChild(document.createTextNode('でお問い合わせください。'));
  }

  // 年月（'2026-10'）を n か月動かす
  function addMonth(ym, n) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + (m < 9 ? '0' : '') + (m + 1);
  }

  // 日にちは、ひと月ずつのカレンダーで見せる（前の月・次の月のボタンで動かす）
  function renderDays() {
    var days = state.avail.days;
    if (!days.length) { $('r-days').innerHTML = '<p class="hint">受け付けている日がありません。</p>'; return; }
    var byDate = {};
    days.forEach(function (d) { byDate[d.date] = d; });
    var minYm = days[0].date.slice(0, 7), maxYm = days[days.length - 1].date.slice(0, 7);
    if (!state.month || state.month < minYm || state.month > maxYm) state.month = state.date ? state.date.slice(0, 7) : minYm;
    var ym = state.month, y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7));
    var last = new Date(Date.UTC(y, mo, 0)).getUTCDate(), pad = A.weekday(ym + '-01');
    var h = '<div class="cal-nav">'
      + '<button type="button" class="cal-move" data-month="-1"' + (ym <= minYm ? ' disabled' : '') + '><span aria-hidden="true">‹</span>前の月</button>'
      + '<p class="cal-title" aria-live="polite">' + y + '年<b>' + mo + '</b>月</p>'
      + '<button type="button" class="cal-move" data-month="1"' + (ym >= maxYm ? ' disabled' : '') + '>次の月<span aria-hidden="true">›</span></button>'
      + '</div><div class="cal-head">';
    '日月火水木金土'.split('').forEach(function (w, i) { h += '<span class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</span>'; });
    h += '</div><div class="cal">';
    for (var i = 0; i < pad; i++) h += '<span class="cal-pad"></span>';
    for (var day = 1; day <= last; day++) {
      var date = ym + '-' + (day < 10 ? '0' : '') + day, d = byDate[date], w = A.weekday(date);
      var wcls = (w === 0 || (d && d.holiday)) ? ' sun' : w === 6 ? ' sat' : '';
      if (!d) {   // 今日より前と、受け付ける日より先は、数字だけ
        h += '<span class="cal-out' + wcls + '"><b>' + day + '</b></span>';
        continue;
      }
      var mk = dayMark(d);
      h += '<label class="cal-day' + (mk.cls ? ' ' + mk.cls : '') + wcls + (date === days[0].date ? ' is-today' : '') + '">'
        + '<input type="radio" name="date" value="' + d.date + '"' + (mk.ok ? '' : ' disabled') + (state.date === d.date ? ' checked' : '') + '>'
        + '<span><b>' + day + '</b><i>' + mk.m + '</i></span>'
        + '<span class="sr">' + A.jp(d.date) + (mk.sr || (mk.ok ? (mk.m === '△' ? ' 残りわずか' : ' 空きあり') : (mk.m === '休' ? ' 定休日' : ' 満席'))) + '</span></label>';
    }
    h += '</div><p class="cal-key"><span><i>○</i>空きあり</span><span><i class="few">△</i>残りわずか</span><span><i>×</i>満席</span><span><i>休</i>定休日</span></p>';
    $('r-days').innerHTML = h;
  }

  function renderTimes() {
    var box = $('r-times');
    var d = state.avail && state.avail.days.filter(function (x) { return x.date === state.date; })[0];
    if (!d) { box.innerHTML = '<p class="hint">先に日にちを選んでください。</p>'; return; }
    // 時刻は1時間ごとにまとめて並べる（10分きざみだと数が多いので、何時かを左に出す）
    var h = '<p class="times-day">' + esc(A.jp(d.date)) + '</p>', hour = '';
    d.slots.forEach(function (s) {
      var mk = slotMark(s), ok = fits(s), hh = s.t.slice(0, 2);
      if (hh !== hour) {
        h += (hour ? '</div></div>' : '') + '<div class="times-hour"><p class="times-h">' + Number(hh) + '時</p><div class="times-grid">';
        hour = hh;
      }
      h += '<label class="chip time' + (!ok ? ' is-full' : mk === '△' ? ' is-few' : '') + '">'
        + '<input type="radio" name="time" value="' + s.t + '"' + (ok ? '' : ' disabled') + (state.time === s.t ? ' checked' : '') + '>'
        + '<span>' + s.t + '<i>' + mk + '</i></span></label>';
    });
    box.innerHTML = h + (hour ? '</div></div>' : '');
  }

  // 空き状況を読む。quiet は、開いたままのときの読み直し（変わっていなければ描き直さない。つながらなくても今の表示のまま）
  var REFRESH_MS = 3 * 60 * 1000, loadedAt = 0, loading = false, lastSig = '';
  function load(quiet) {
    if (!A.ready()) { off(MSG.not_ready); return Promise.resolve(); }
    loading = true;
    return A.post({ action: 'avail' }).then(function (a) {
      loadedAt = Date.now();
      var sig = JSON.stringify(a);
      if (quiet && sig === lastSig) return;
      lastSig = sig;
      state.avail = a;
      if (!a.accepting) { off(MSG.not_accepting); return; }
      // 選んでいた日・時間が埋まっていたら外す
      var had = { date: state.date, time: state.time };
      dropUnfit();
      renderPeople(); renderDays(); renderTimes();
      if (quiet && had.date && !state.date) say(MSG.taken_day);
      else if (quiet && had.time && !state.time) say(MSG.taken_time);
    }).catch(function (e) {
      if (quiet) return;
      $('r-days').innerHTML = '<p class="hint">' + esc(message(e)) + ' <button type="button" class="linkbtn" id="r-retry">読み込み直す</button></p>';
      $('r-retry').onclick = function () { load(); };
    }).then(function () { loading = false; });
  }

  // 開いたままでも、見ているあいだは3分ごとに読み直す（ほかのタブから戻ったときは1分たっていれば）。確認の画面・送ったあとは読み直さない
  function refresh(age) {
    if (document.hidden || form.hidden || loading || !state.avail) return;
    if (Date.now() - loadedAt >= age) load(true);
  }
  setInterval(function () { refresh(REFRESH_MS); }, 30 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(60 * 1000); });

  /** 選んでいた日・時間に入れなくなったら外す（埋まったとき・人数を変えたとき） */
  function dropUnfit() {
    var d = state.avail.days.filter(function (x) { return x.date === state.date; })[0];
    if (!d || !dayMark(d).ok) { state.date = ''; state.time = ''; }
    else if (!d.slots.some(function (s) { return s.t === state.time && fits(s); })) state.time = '';
  }

  // 前の月・次の月
  $('r-days').addEventListener('click', function (e) {
    var b = e.target.closest('[data-month]');
    if (!b || b.disabled || !state.month) return;
    var dir = b.dataset.month;
    state.month = addMonth(state.month, Number(dir));
    renderDays();
    var nb = $('r-days').querySelector('[data-month="' + dir + '"]');
    (nb && !nb.disabled ? nb : $('r-days').querySelector('[data-month]:not(:disabled)') || $('r-days')).focus();
  });

  form.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'people') { state.people = Number(t.value); dropUnfit(); renderDays(); renderTimes(); }
    if (t.name === 'date') { state.date = t.value; state.time = ''; renderTimes(); $('r-times').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (t.name === 'time') state.time = t.value;
    if (t.name === 'dessert') { showPlate(); if (dessertOn()) $('r-plate').focus(); }
    say('');
  });

  /* ---------- 確認 ---------- */
  // デザートプレート（要予約・税込1,100円）。「注文する」にチェックを入れたときだけ、プレートに書くメッセージの欄を出す
  function dessertOn() { return $('r-dessert').checked; }
  function showPlate() { $('r-plate-box').hidden = !dessertOn(); }

  function values() {
    return {
      people: state.people, date: state.date, time: state.time,
      name: $('r-name').value.trim(), tel: $('r-tel').value.trim(), email: $('r-email').value.trim(),
      note: $('r-note').value.trim(), website: $('r-website').value,
      dessert: dessertOn(), plateMsg: dessertOn() ? $('r-plate').value.trim() : ''
    };
  }
  function check(v) {
    if (!v.people) return MSG.bad_people;
    if (!v.date || !v.time) return MSG.bad_date;
    if (!v.name) return MSG.need_name;
    if (!/^0\d{9,10}$/.test(v.tel.replace(/[^\d]/g, ''))) return MSG.bad_tel;
    if (!v.email) return MSG.need_email;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return MSG.bad_email;
    return '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!state.avail) { say('空き状況を読み込んでいます。少しお待ちください。'); return; }
    var v = values(), err = check(v);
    if (err) { say(err); return; }
    say('');
    state.rid = A.rid();   // 確認の画面を開くたびに新しい印。送り直しのときは同じ印を使う
    $('r-summary').innerHTML =
      '<div><dt>日時</dt><dd>' + esc(A.jp(v.date)) + ' ' + esc(v.time) + '</dd></div>'
      + '<div><dt>人数</dt><dd>' + v.people + '名</dd></div>'
      + '<div><dt>お名前</dt><dd>' + esc(v.name) + ' 様</dd></div>'
      + '<div><dt>電話番号</dt><dd>' + esc(v.tel) + '</dd></div>'
      + '<div><dt>メール</dt><dd>' + esc(v.email) + '</dd></div>'
      + '<div><dt>デザートプレート</dt><dd>' + (v.dessert ? '注文する（税込1,100円）' + (v.plateMsg ? '<br>メッセージ：「' + esc(v.plateMsg) + '」' : '<br>メッセージ：なし') : '注文しない') + '</dd></div>'
      + (v.note ? '<div><dt>ご要望</dt><dd>' + esc(v.note) + '</dd></div>' : '');
    show(form, false); show($('r-confirm'), true); show($('r-done'), false);
    $('booking').scrollIntoView({ behavior: 'smooth' });
  });

  $('r-back').addEventListener('click', function () {
    show($('r-confirm'), false); show(form, true);
    $('booking').scrollIntoView({ behavior: 'smooth' });
  });

  $('r-send').addEventListener('click', function () {
    var btn = $('r-send'), v = values();
    btn.disabled = true; btn.textContent = '送っています…';
    $('r-cmsg').hidden = true;
    A.post(Object.assign({ action: 'reserve', rid: state.rid }, v)).then(function (r) {
      $('r-no').textContent = r.no;
      $('r-done-what').textContent = A.jp(r.date) + ' ' + r.time + '　' + r.people + '名　' + r.name + ' 様';
      $('r-mailed').hidden = !r.mailed;
      $('r-unmailed').hidden = !!r.mailed;
      show($('r-confirm'), false); show($('r-done'), true);
      $('booking').scrollIntoView({ behavior: 'smooth' });
      form.reset(); showPlate(); state.people = 0; state.date = ''; state.time = '';
      load();
    }).catch(function (e) {
      if (e.code === 'full' || e.code === 'too_late' || e.code === 'no_slot') {
        // 枠が埋まったときは、空き状況を読み直して時間を選び直してもらう
        state.time = '';
        show($('r-confirm'), false); show(form, true);
        load().then(function () { say(message(e)); });
        return;
      }
      var m = $('r-cmsg'); m.textContent = message(e); m.hidden = false;
    }).then(function () {
      btn.disabled = false; btn.textContent = 'この内容で送る';
    });
  });

  $('r-again').addEventListener('click', function () {
    show($('r-done'), false); show(form, true);
    $('booking').scrollIntoView({ behavior: 'smooth' });
  });

  load();
})();
