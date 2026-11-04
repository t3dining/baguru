/* バグるのホームページの管理画面と、その受け口（会社の Google アカウントのウェブアプリ）
   ・ウェブアプリのアドレスを開くと、管理画面（HTML のファイル「画面」。作る.py が 管理/画面/ から作る）を出す
     ★管理画面はホームページには置かない。このアドレスを知っている人だけが開ける（中身を変えるには合言葉も要る）
   ・管理画面から頼まれて（google.script.run で api を呼ぶ）、会社の GitHub のホームページの置き場所（GITHUB_REPO）に書き込む
     書き込むと、GitHub がページを作り直して公開する（ホームページの .github/workflows/publish.yml）
   ・合言葉と GitHub の鍵は「スクリプト プロパティ」に置く（PIN・GITHUB_TOKEN・GITHUB_REPO）。★コードには書かない
   ・予約ボードの受け口（店舗アプリ/バグる/予約ボード/受け口/コード.gs）とは別のもの。合言葉も別
   ・品の形の決まり（TYPE_KEYS・cleanItem_ など）と文章の決まり（mergeTexts_）は 管理/にせの受け口.py と同じにしておく。片方を変えたら、もう片方も直す
   ・置きかたは 受け口の作りかた.md */

var VERSION = '2026-11-04b';
var SITE_URL = 'https://t3dining.github.io/baguru';   // ホームページの場所（作る.py の SITE_URL と同じ。タブの小さな絵に使う）
var BRANCH = 'main';
var WORKFLOW = 'publish.yml';
var MAX_FAIL = 8, FAIL_WINDOW_MS = 30 * 60 * 1000;     // 8回まちがえたら30分入れない
var FILES = { menu: 'データ/menu.json', news: 'データ/news.json', texts: 'データ/texts.json' };
var ONE_LINE = { title: 80, desc: 200, hero: 40, herosub: 80 };   // 改行できない文の種類と字数の上限（kanri.js・にせの受け口.py と同じ）
var TEXT_MAX = 1000;
var ORDER = ['id', 'name', 'sub', 'photo', 'alt', 'limit', 'badges', 'copy', 'price', 'prices', 'note', 'tip', 'status'];
var TYPE_KEYS = {
  'plist': ['name', 'sub', 'price'],
  'pic-set': ['name', 'sub', 'price'],
  'pic-card': ['photo', 'alt', 'name', 'price', 'note'],
  'mh': ['id', 'photo', 'alt', 'name', 'badges', 'copy', 'prices', 'tip'],
  'card': ['photo', 'alt', 'name', 'copy', 'prices'],
  'duo': ['photo', 'alt', 'limit', 'name', 'copy', 'prices'],
  'mini': ['photo', 'alt', 'name', 'prices']
};
var LIMITS = { id: 40, name: 80, sub: 120, alt: 200, limit: 30, copy: 600, price: 40, note: 200 };
var NEWS_CATS = ['お知らせ', 'イベント', 'テイクアウト', 'メニュー', '営業日'];
var LINKS = ['menu.html', 'takeout.html', 'reserve.html', 'access.html', 'concept.html', 'recruit.html', 'contact.html', 'news.html'];
var PHOTO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.jpg$/;
var NEW_PHOTO = /^u-\d{8}-\d{6}-[a-z0-9]{4}\.jpg$/;

/* ============ 最初に1回（エディタで setup を選んで「実行」） ============ */

function setup() {
  var p = props();
  var pin = p.getProperty('PIN');
  if (!pin) { pin = makePin_(); p.setProperty('PIN', pin); }
  if (!p.getProperty('GITHUB_REPO')) p.setProperty('GITHUB_REPO', 't3dining/baguru');
  Logger.log('――――――――――――――――――――――――');
  Logger.log('ホームページの管理の受け口（版 ' + VERSION + '）');
  Logger.log('このアカウント: ' + (Session.getEffectiveUser().getEmail() || '（取れませんでした）'));
  Logger.log('書き込む先: ' + repo_() + '（' + BRANCH + '）');
  if (!p.getProperty('GITHUB_TOKEN')) {
    Logger.log('★GitHub の鍵（GITHUB_TOKEN）がまだ入っていません。スクリプト プロパティに入れてから、もう一度 setup を実行してください');
  } else {
    try {
      var r = gh_('GET', '/repos/' + repo_());
      Logger.log('GitHub につながりました: ' + r.full_name + (r.permissions && r.permissions.push ? '（書き込めます）' : '（★書き込めません。鍵の権限を確かめてください）'));
      readFile_('menu');
      Logger.log('データ/menu.json を読めました');
    } catch (e) {
      Logger.log('★GitHub につながりませんでした: ' + e.message);
    }
  }
  Logger.log('管理画面の合言葉: ' + pin);
  Logger.log('――――――――――――――――――――――――');
}

function makePin_() {
  var chars = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

/* ============ 頼みごと ============ */

/** ウェブアプリのアドレスを開いたとき：管理画面を出す */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('画面')
    .setTitle('ホームページの管理｜バグる')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')   // maximum-scale：iPhone で直す欄を押しても大きくならないように
    .setFaviconUrl(SITE_URL + '/img/icon-192.png');
}

/** 管理画面からの頼みごと（google.script.run.api）。答えは にせの受け口.py の /api/kanri と同じ形 */
function api(req) { return handle_(req || {}); }

/** 同じ頼みごとを POST でも受ける（ふだんは使わない） */
function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return out({ ok: false, error: 'bad_json' }); }
  return out(handle_(req));
}

function handle_(req) {
  try {
    if (isLocked_()) return { ok: false, error: 'locked' };
    if (!checkPin_(req.pin)) { countFail_(); return { ok: false, error: 'bad_pin' }; }
    clearFail_();
    if (req.action === 'ping') return { ok: true, now: Date.now(), version: VERSION };
    if (!props().getProperty('GITHUB_TOKEN')) return { ok: false, error: 'not_setup' };
    var acts = { load: load_, save: save_, history: history_, restore: restore_, status: status_ };
    if (acts[req.action]) return acts[req.action](req);
    return { ok: false, error: 'unknown_action' };
  } catch (err) {
    if (err && err.code) return { ok: false, error: err.code };
    return { ok: false, error: String(err && err.message || err).slice(0, 200) };
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function bad_(code) { var e = new Error(code); e.code = code; return e; }

function load_() {
  var m = readFile_('menu'), n = readFile_('news'), t = readFile_('texts');
  return { ok: true, menu: m.data, news: n.data, texts: t.data, sha: { menu: m.sha, news: n.sha, texts: t.sha } };
}

function save_(req) {
  var what = req.what;
  if (!FILES.hasOwnProperty(what)) throw bad_('bad_data');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cur = readFile_(what);
    if (req.sha !== cur.sha) return { ok: false, error: 'conflict' };
    var inc = req.data && typeof req.data === 'object' ? req.data : {};
    var data = what === 'menu' ? mergeMenu_(cur.data, inc) : what === 'texts' ? mergeTexts_(cur.data, inc) : cleanNews_(inc);
    var photos = cleanPhotos_(req.photos);
    if (what === 'menu') checkPhotos_(data, photos);
    var files = photos.map(function (p) { return { path: 'データ/写真/' + p.name, base64: p.data }; });
    files.push({ path: FILES[what], base64: Utilities.base64Encode(JSON.stringify(data, null, 1) + '\n', Utilities.Charset.UTF_8) });
    var c = commit_(files, '管理画面：' + (clean_(req.note, 120) || '変えました'));
    return { ok: true, data: data, sha: c.blobs[FILES[what]], commit: c.commit };
  } finally {
    lock.releaseLock();
  }
}

/** 最近の変更（データ/ を変えたもの）。新しい順に15件 */
function history_() {
  var list = gh_('GET', '/repos/' + repo_() + '/commits?sha=' + BRANCH + '&per_page=15&path=' + encodeURIComponent('データ'));
  return { ok: true, list: list.map(function (c) {
    return { commit: c.sha, date: c.commit.committer.date, message: c.commit.message.split('\n')[0].replace(/^管理画面：/, '') };
  }) };
}

/** そのときの menu.json・news.json・texts.json に戻す（写真は消さない） */
function restore_(req) {
  if (!/^[0-9a-f]{40}$/.test(String(req.commit || ''))) throw bad_('bad_data');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var m = readFile_('menu', req.commit), n = readFile_('news', req.commit), files = [{ path: FILES.menu, base64: m.raw }, { path: FILES.news, base64: n.raw }];
    try { files.push({ path: FILES.texts, base64: readFile_('texts', req.commit).raw }); }
    catch (e) { if (!/^github 404/.test(e.message)) throw e; }   // 文章ができる前の形には texts.json がない。そのときは今の文章のまま
    var c = commit_(files, '管理画面：' + (clean_(req.note, 120) || '前に戻しました'));
    return { ok: true, commit: c.commit };
  } finally {
    lock.releaseLock();
  }
}

/** その変更がホームページに出たか（GitHub の「作って公開する」の動き） */
function status_(req) {
  var c = String(req.commit || '');
  var runs = (gh_('GET', '/repos/' + repo_() + '/actions/workflows/' + WORKFLOW + '/runs?branch=' + BRANCH + '&per_page=10').workflow_runs) || [];
  var run = runs.filter(function (x) { return x.head_sha === c; })[0];
  if (!run || run.status !== 'completed') return { ok: true, state: 'working' };
  if (run.conclusion === 'success') return { ok: true, state: 'done' };
  if (run.conclusion === 'cancelled') {
    // あとの変更にまとめられたときは、あとのほうが出れば出たことになる
    var later = runs.filter(function (x) { return x.created_at > run.created_at && x.status === 'completed' && x.conclusion === 'success'; })[0];
    return { ok: true, state: later ? 'done' : 'working' };
  }
  return { ok: true, state: 'failed' };
}

/* ============ 品の形の決まり（にせの受け口.py の clean_item などと同じ） ============ */

function clean_(v, n) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (s.length > n) throw bad_('bad_data');
  return s;
}

function cleanItem_(kind, it) {
  if (!it || typeof it !== 'object') throw bad_('bad_data');
  var o = {}, keys = TYPE_KEYS[kind];
  keys.concat(['status']).forEach(function (k) {
    var v = it[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
    if (k === 'badges') {
      var bs = (Array.isArray(v) ? v.slice(0, 4) : []).filter(function (b) { return b && clean_(b.text, 30); })
        .map(function (b) { return { text: clean_(b.text, 30), color: b.color === 'ember' || b.color === 'brass' ? b.color : '' }; });
      if (bs.length) o[k] = bs;
    } else if (k === 'prices') {
      var ps = (Array.isArray(v) ? v.slice(0, 8) : []).filter(function (r) { return r && clean_(r.price, 40); })
        .map(function (r) { return { label: clean_(r.label, 40), price: clean_(r.price, 40) }; });
      if (ps.length) o[k] = ps;
    } else if (k === 'tip') {
      if (v && typeof v === 'object' && clean_(v.text, 300)) o[k] = { label: clean_(v.label, 20), text: clean_(v.text, 300) };
    } else if (k === 'status') {
      if (v === 'soldout' || v === 'paused') o[k] = v;
    } else if (k === 'id') {
      if (!/^[a-z0-9-]{1,40}$/.test(String(v))) throw bad_('bad_data');
      o[k] = String(v);
    } else if (k === 'photo') {
      if (!PHOTO_NAME.test(String(v))) throw bad_('bad_data');
      o[k] = String(v);
    } else if (k === 'copy') {   // 説明は改行できる（2026-11-04。にせの受け口.py と同じ）
      var c = String(v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim();
      if (c.length > LIMITS.copy) throw bad_('bad_data');
      o[k] = c;
    } else {
      o[k] = clean_(v, LIMITS[k]);
    }
  });
  if (!o.name || (keys.indexOf('photo') >= 0 && !o.photo) || (keys.indexOf('price') >= 0 && !o.price) ||
      (keys.indexOf('prices') >= 0 && !o.prices) || (kind === 'mh' && !o.id)) throw bad_('bad_data');
  var sorted = {};
  ORDER.forEach(function (k) { if (o.hasOwnProperty(k)) sorted[k] = o[k]; });
  return sorted;
}

/** 今のメニューに、管理画面から来た品だけを入れる（群の並び・名前・形は変えさせない） */
function mergeMenu_(cur, inc) {
  var got = {};
  (Array.isArray(inc.groups) ? inc.groups : []).forEach(function (g) { if (g && g.id) got[g.id] = g; });
  var outM = JSON.parse(JSON.stringify(cur));
  outM.groups.forEach(function (g) {
    var x = got[g.id];
    if (!x) return;
    if (!Array.isArray(x.items) || x.items.length > 60) throw bad_('bad_data');
    g.items = x.items.map(function (it) { return cleanItem_(g.type, it); });
    if (g.type === 'pic-set') {
      if (!PHOTO_NAME.test(String(x.photo || ''))) throw bad_('bad_data');
      g.photo = String(x.photo);
      var alt = clean_(x.alt, 200);
      if (alt) g.alt = alt; else delete g.alt;
    }
  });
  return outM;
}

/** 今の文章に、管理画面から来た文だけを入れる（ページ・まとまり・並び・キーは変えさせない） */
function mergeTexts_(cur, inc) {
  var got = {}, arr = function (v) { return Array.isArray(v) ? v : []; };
  arr(inc.pages).forEach(function (p) {
    arr(p && p.parts).forEach(function (part) {
      arr(part && part.texts).forEach(function (x) { if (x && typeof x.key === 'string') got[x.key] = x.text; });
    });
  });
  var outT = JSON.parse(JSON.stringify(cur));
  outT.pages.forEach(function (p) {
    p.parts.forEach(function (part) {
      part.texts.forEach(function (x) {
        if (!got.hasOwnProperty(x.key)) return;
        var v = String(got[x.key] == null ? '' : got[x.key]).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim();
        var n = ONE_LINE[x.tag];
        if (n) v = v.replace(/\s*\n\s*/g, '');
        if (!v || v.length > (n || TEXT_MAX)) throw bad_('bad_data');
        x.text = v;
      });
    });
  });
  return outT;
}

function cleanNews_(inc) {
  var items = inc.items;
  if (!Array.isArray(items) || items.length > 200) throw bad_('bad_data');
  var ids = {};
  return { items: items.map(function (n) {
    if (!n || typeof n !== 'object') throw bad_('bad_data');
    var id = String(n.id || ''), date = String(n.date || '');
    if (!/^n-[a-z0-9-]{1,40}$/.test(id) || ids[id] || !okYmd_(date)) throw bad_('bad_data');
    ids[id] = true;
    var x = { id: id, date: date, cat: NEWS_CATS.indexOf(n.cat) >= 0 ? n.cat : 'お知らせ', title: clean_(n.title, 120),
      body: String(n.body || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim() };
    if (!x.title || x.body.length > 3000) throw bad_('bad_data');
    if (n.link && LINKS.indexOf(n.link.href) >= 0) x.link = { href: n.link.href, text: clean_(n.link.text, 60) || '詳しくはこちら' };
    return x;
  }) };
}

function okYmd_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return d.toISOString().slice(0, 10) === s;
}

/** 管理画面で切り取った写真（JPEG・3枚まで・1枚 1.5MB まで） */
function cleanPhotos_(photos) {
  if (photos == null) return [];
  if (!Array.isArray(photos) || photos.length > 3) throw bad_('bad_photo');
  return photos.map(function (p) {
    var name = String(p && p.name || ''), bytes;
    try { bytes = Utilities.base64Decode(String(p.data || '')); } catch (e) { throw bad_('bad_photo'); }
    if (!NEW_PHOTO.test(name) || bytes.length > 1500000 || bytes.length < 3 || bytes[0] !== -1 || bytes[1] !== -40 || bytes[2] !== -1) throw bad_('bad_photo');
    return { name: name, data: String(p.data) };
  });
}

/** メニューの写真が、どれも GitHub にあるか（または今送られてきたか） */
function checkPhotos_(menu, photos) {
  var have = {};
  photos.forEach(function (p) { have[p.name] = true; });
  var tree = gh_('GET', '/repos/' + repo_() + '/git/trees/' + BRANCH + '?recursive=1').tree || [];
  tree.forEach(function (t) {
    var m = t.path.match(/^(?:公開用\/img|データ\/写真)\/([^\/]+\.jpg)$/);
    if (m) have[m[1]] = true;
  });
  menu.groups.forEach(function (g) {
    if (g.photo && !have[g.photo]) throw bad_('bad_photo');
    g.items.forEach(function (it) { if (it.photo && !have[it.photo]) throw bad_('bad_photo'); });
  });
}

/* ============ GitHub ============ */

function repo_() { return props().getProperty('GITHUB_REPO') || 't3dining/baguru'; }
function enc_(path) { return path.split('/').map(encodeURIComponent).join('/'); }

function gh_(method, path, body) {
  var opt = {
    method: method, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + props().getProperty('GITHUB_TOKEN'), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch('https://api.github.com' + path, opt), code = res.getResponseCode(), txt = res.getContentText();
  if (code >= 400) {
    var e = new Error('github ' + code + ' ' + txt.slice(0, 200));
    e.code = code === 409 || code === 422 ? 'github_conflict' : 'github';
    throw e;
  }
  return txt ? JSON.parse(txt) : {};
}

/** データのファイルを読む。{data, sha（ファイルの印）, raw（base64 のまま）} */
function readFile_(name, ref) {
  var r = gh_('GET', '/repos/' + repo_() + '/contents/' + enc_(FILES[name]) + '?ref=' + encodeURIComponent(ref || BRANCH));
  var raw = String(r.content || '').replace(/\s/g, '');
  var text = Utilities.newBlob(Utilities.base64Decode(raw)).getDataAsString('UTF-8');
  return { data: JSON.parse(text), sha: r.sha, raw: raw };
}

/** いくつかのファイルを、1つの変更として書き込む。{commit, blobs: {path: ファイルの印}} */
function commit_(files, message) {
  var r = repo_(), last = null;
  for (var n = 0; n < 2; n++) {
    var head = gh_('GET', '/repos/' + r + '/git/ref/heads/' + BRANCH).object.sha;
    var base = gh_('GET', '/repos/' + r + '/git/commits/' + head).tree.sha;
    var blobs = {};
    var tree = files.map(function (f) {
      var b = gh_('POST', '/repos/' + r + '/git/blobs', { content: f.base64, encoding: 'base64' });
      blobs[f.path] = b.sha;
      return { path: f.path, mode: '100644', type: 'blob', sha: b.sha };
    });
    var t = gh_('POST', '/repos/' + r + '/git/trees', { base_tree: base, tree: tree });
    var c = gh_('POST', '/repos/' + r + '/git/commits', { message: message, tree: t.sha, parents: [head] });
    try {
      gh_('PATCH', '/repos/' + r + '/git/refs/heads/' + BRANCH, { sha: c.sha, force: false });
      return { commit: c.sha, blobs: blobs };
    } catch (e) {
      if (e.code !== 'github_conflict') throw e;     // そのあいだに、ほかの変更が入った。もう一度、新しいほうの上に作る
      last = e;
    }
  }
  throw bad_('github');
}

/* ============ 合言葉（予約ボードの受け口と同じしくみ） ============ */

function props() { return PropertiesService.getScriptProperties(); }
function checkPin_(pin) { var want = props().getProperty('PIN'); return !!want && String(pin || '') === want; }
function isLocked_() { return Number(props().getProperty('LOCK_UNTIL') || 0) > Date.now(); }
function countFail_() {
  var p = props(), now = Date.now();
  var t = Number(p.getProperty('FAIL_T') || 0), n = Number(p.getProperty('FAIL_N') || 0);
  if (now - t > FAIL_WINDOW_MS) { t = now; n = 0; }
  n++;
  p.setProperty('FAIL_T', String(t)); p.setProperty('FAIL_N', String(n));
  if (n >= MAX_FAIL) { p.setProperty('LOCK_UNTIL', String(now + FAIL_WINDOW_MS)); p.setProperty('FAIL_N', '0'); }
}
function clearFail_() { var p = props(); if (p.getProperty('FAIL_N')) { p.deleteProperty('FAIL_N'); p.deleteProperty('FAIL_T'); } }
