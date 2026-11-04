/* お問い合わせ・採用の応募のフォーム（お問い合わせのページ・採用のページ）
   ・送り先は受け口（コード.gs の contact）。受け口が、タブ「設定」の「問い合わせ・応募の送り先」にメールで届ける
   ・送るときに「受付の印（rid）」を付ける。返事が途中で切れて送り直しても、メールは1通にしかならない */
(function () {
  'use strict';
  var A = window.BaguruApi;
  var TEL = (window.BAGURU && window.BAGURU.tel) || '';
  var MSG = {
    not_ready: 'フォームはただいま準備中です。お電話でどうぞ。',
    need_name: 'お名前を入れてください。',
    need_email: 'メールアドレスを入れてください（お返事をお送りします）。',
    need_email_job: 'メールアドレスを入れてください（ご連絡に使います）。',
    bad_email: 'メールアドレスの形が違います。',
    need_tel: '電話番号を入れてください（お店から折り返しご連絡します）。',
    bad_tel: '電話番号を正しく入れてください（例：090-1234-5678）。',
    need_message: 'お問い合わせの内容を入れてください。',
    busy: 'ただいま混み合っています。少し時間を置いて、もう一度お試しください。',
    not_sent: '送れませんでした。お手数ですが、お電話でお知らせください。',
    offline: 'つながりませんでした。電波の良い所で、もう一度お試しください。',
    no_answer: 'つながりませんでした。時間を置いてもう一度お試しいただくか、お電話でどうぞ。'
  };
  function text(code) { return (MSG[code] || MSG.no_answer) + (TEL && (code === 'not_sent' || code === 'no_answer' || code === 'not_ready') ? '（' + TEL + '）' : ''); }

  document.querySelectorAll('form[data-contact]').forEach(function (form) {
    var kind = form.dataset.contact, rid = A.rid();
    var done = form.parentNode.querySelector('.form-done');
    var msg = form.querySelector('.form-msg');
    var btn = form.querySelector('button[type=submit]');
    var label = btn.textContent;
    function say(t) { msg.textContent = t || ''; msg.hidden = !t; if (t) msg.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    function val(name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = { action: 'contact', kind: kind, rid: rid, name: val('name'), email: val('email'), tel: val('tel'),
        topic: val('topic'), time: val('time'), message: val('message'), website: val('website'),
        jobs: Array.prototype.filter.call(form.querySelectorAll('input[name=jobs]'), function (c) { return c.checked; }).map(function (c) { return c.value; }) };
      if (!v.name) return say(MSG.need_name);
      if (kind === '採用' && !v.tel) return say(MSG.need_tel);
      if (kind === '採用' && !/^0\d{9,10}$/.test(v.tel.replace(/[^\d]/g, ''))) return say(MSG.bad_tel);
      if (!v.email) return say(kind === '採用' ? MSG.need_email_job : MSG.need_email);
      if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return say(MSG.bad_email);
      if (v.tel && !/^0\d{9,10}$/.test(v.tel.replace(/[^\d]/g, ''))) return say(MSG.bad_tel);
      if (kind !== '採用' && !v.message) return say(MSG.need_message);
      if (!A.ready()) return say(text('not_ready'));
      say('');
      btn.disabled = true; btn.textContent = '送っています…';
      A.post(v).then(function () {
        form.reset(); rid = A.rid();
        form.hidden = true;
        if (done) { done.hidden = false; done.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }).catch(function (err) {
        say(text(err.code));
      }).then(function () { btn.disabled = false; btn.textContent = label; });
    });
    if (done) {
      var again = done.querySelector('[data-again]');
      if (again) again.addEventListener('click', function () { done.hidden = true; form.hidden = false; });
    }
  });
})();
