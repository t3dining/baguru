#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
にせの受け口（ホームページの管理画面を、この Mac の中だけで試すためのもの）

    python3 にせの受け口.py [ポート] [ホームページのフォルダ]      （ふだんは 管理画面を試す.command から動かす）

  ・ホームページの 公開用/ を http://localhost:8134/ で配り、/api/kanri に来た頼みごとに答えます
    管理画面は http://localhost:8134/kanri/（管理/画面/ を配る。本物では Google の受け口が出し、ホームページには置かない）
  ・答え方は本物の受け口（受け口/コード.gs）と同じです。GitHub に書く代わりに、このフォルダの データ/ に書いて、作る.py で作り直します
    ★なので、ここで保存すると、この Mac のホームページのデータが本当に変わります
  ・合言葉は にせの合言葉.txt（この Mac の中だけで使う試しの合言葉）
  ・「前に戻す」の形は 管理/にせのデータ/履歴/ に残ります
  ・品の形の決まり（clean_item など）と文章の決まり（merge_texts）は、コード.gs と同じにしておく。片方を変えたら、もう片方も直す

  ★この Mac の外からは開けません（127.0.0.1 だけで待つ）
"""

import base64
import datetime
import functools
import hashlib
import http.server
import json
import random
import re
import shutil
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8134
ROOT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else HERE.parent      # ホームページのフォルダ
DATA = ROOT / 'データ'
MOCK = ROOT / '管理' / 'にせのデータ'
ADMIN = ROOT / '管理' / '画面'                       # 管理画面（/kanri/ で配る）
HIST = MOCK / '履歴'
PINFILE = HERE / 'にせの合言葉.txt'
LOCK = threading.Lock()
MAX_FAIL, FAIL_WINDOW = 8, 30 * 60      # 8回まちがえたら30分入れない（コード.gs と同じ）
FAILS = {'n': 0, 't': 0, 'until': 0}
BUILDS = {}                             # 変更の印 → 'done' / 'failed'

# ---- 品の形の決まり（コード.gs の TYPE_KEYS・LIMITS と同じ） ----
ORDER = ['id', 'name', 'sub', 'photo', 'alt', 'limit', 'badges', 'copy', 'price', 'prices', 'note', 'tip', 'status']
TYPE_KEYS = {
    'plist': ['name', 'sub', 'price'],
    'pic-set': ['name', 'sub', 'price'],
    'pic-card': ['photo', 'alt', 'name', 'price', 'note'],
    'mh': ['id', 'photo', 'alt', 'name', 'badges', 'copy', 'prices', 'tip'],
    'card': ['photo', 'alt', 'name', 'copy', 'prices'],
    'duo': ['photo', 'alt', 'limit', 'name', 'copy', 'prices'],
    'mini': ['photo', 'alt', 'name', 'prices'],
}
LIMITS = {'id': 40, 'name': 80, 'sub': 120, 'alt': 200, 'limit': 30, 'copy': 600, 'price': 40, 'note': 200}
NEWS_CATS = ['お知らせ', 'イベント', 'テイクアウト', 'メニュー', '営業日']
LINKS = ['menu.html', 'takeout.html', 'reserve.html', 'access.html', 'concept.html', 'recruit.html', 'contact.html', 'news.html']
PHOTO_NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.jpg$')
NEW_PHOTO = re.compile(r'^u-\d{8}-\d{6}-[a-z0-9]{4}\.jpg$')
DATAS = ('menu', 'news', 'texts')
ONE_LINE = {'title': 80, 'desc': 200, 'hero': 40, 'herosub': 80}   # 改行できない文の種類と字数の上限（kanri.js・コード.gs と同じ）
TEXT_MAX = 1000


class Bad(Exception):
    pass


def s_(v, n):
    v = re.sub(r'[\x00-\x1f\x7f]', '', str(v if v is not None else '')).strip()
    if len(v) > n:
        raise Bad('bad_data')
    return v


def clean_item(kind, it):
    if not isinstance(it, dict):
        raise Bad('bad_data')
    out = {}
    for k in TYPE_KEYS[kind] + ['status']:
        v = it.get(k)
        if v in (None, '', []):
            continue
        if k == 'badges':
            bs = [{'text': s_(b.get('text'), 30), 'color': b.get('color') if b.get('color') in ('ember', 'brass') else ''} for b in v[:4] if isinstance(b, dict) and s_(b.get('text'), 30)]
            if bs:
                out[k] = bs
        elif k == 'prices':
            ps = [{'label': s_(r.get('label'), 40), 'price': s_(r.get('price'), 40)} for r in v[:8] if isinstance(r, dict) and s_(r.get('price'), 40)]
            if ps:
                out[k] = ps
        elif k == 'tip':
            if isinstance(v, dict) and s_(v.get('text'), 300):
                out[k] = {'label': s_(v.get('label'), 20), 'text': s_(v.get('text'), 300)}
        elif k == 'status':
            if v in ('soldout', 'paused'):
                out[k] = v
        elif k == 'id':
            if not re.match(r'^[a-z0-9-]{1,40}$', str(v)):
                raise Bad('bad_data')
            out[k] = v
        elif k == 'photo':
            if not PHOTO_NAME.match(str(v)):
                raise Bad('bad_data')
            out[k] = v
        else:
            out[k] = s_(v, LIMITS[k])
    keys = TYPE_KEYS[kind]
    if not out.get('name') or ('photo' in keys and not out.get('photo')) or ('price' in keys and not out.get('price')) \
            or ('prices' in keys and not out.get('prices')) or (kind == 'mh' and not out.get('id')):
        raise Bad('bad_data')
    return {k: out[k] for k in ORDER if k in out}


def merge_menu(cur, inc):
    """今のメニューに、管理画面から来た品だけを入れる（群の並び・名前・形は変えさせない）"""
    got = {g.get('id'): g for g in (inc.get('groups') or []) if isinstance(g, dict)}
    out = json.loads(json.dumps(cur))
    for g in out['groups']:
        x = got.get(g['id'])
        if not x:
            continue
        items = x.get('items') or []
        if not isinstance(items, list) or len(items) > 60:
            raise Bad('bad_data')
        g['items'] = [clean_item(g['type'], it) for it in items]
        if g['type'] == 'pic-set':
            if not PHOTO_NAME.match(str(x.get('photo') or '')):
                raise Bad('bad_data')
            g['photo'] = x['photo']
            alt = s_(x.get('alt'), 200)
            if alt:
                g['alt'] = alt
            else:
                g.pop('alt', None)
    return out


def clean_news(inc):
    items = inc.get('items')
    if not isinstance(items, list) or len(items) > 200:
        raise Bad('bad_data')
    out, ids = [], set()
    for n in items:
        if not isinstance(n, dict):
            raise Bad('bad_data')
        nid, date = str(n.get('id') or ''), str(n.get('date') or '')
        if not re.match(r'^n-[a-z0-9-]{1,40}$', nid) or nid in ids or not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
            raise Bad('bad_data')
        try:
            datetime.date.fromisoformat(date)
        except ValueError:
            raise Bad('bad_data')
        ids.add(nid)
        x = {'id': nid, 'date': date, 'cat': n.get('cat') if n.get('cat') in NEWS_CATS else 'お知らせ', 'title': s_(n.get('title'), 120),
             'body': re.sub(r'[\x00-\x09\x0b-\x1f\x7f]', '', str(n.get('body') or '')).strip()}
        if not x['title'] or len(x['body']) > 3000:
            raise Bad('bad_data')
        lk = n.get('link')
        if isinstance(lk, dict) and lk.get('href') in LINKS:
            x['link'] = {'href': lk['href'], 'text': s_(lk.get('text'), 60) or '詳しくはこちら'}
        out.append(x)
    return {'items': out}


def merge_texts(cur, inc):
    """今の文章に、管理画面から来た文だけを入れる（ページ・まとまり・並び・キーは変えさせない）"""
    got = {}
    for p in inc.get('pages') if isinstance(inc.get('pages'), list) else []:
        for part in p.get('parts') if isinstance(p, dict) and isinstance(p.get('parts'), list) else []:
            for x in part.get('texts') if isinstance(part, dict) and isinstance(part.get('texts'), list) else []:
                if isinstance(x, dict) and isinstance(x.get('key'), str):
                    got[x['key']] = x.get('text')
    out = json.loads(json.dumps(cur))
    for p in out['pages']:
        for part in p['parts']:
            for x in part['texts']:
                if x['key'] not in got:
                    continue
                v = re.sub(r'[\x00-\x09\x0b-\x1f\x7f]', '', str(got[x['key']] if got[x['key']] is not None else '')).strip()
                n = ONE_LINE.get(x['tag'])
                if n:
                    v = re.sub(r'\s*\n\s*', '', v)
                if not v or len(v) > (n or TEXT_MAX):
                    raise Bad('bad_data')
                x['text'] = v
    return out


def photo_names(menu):
    for g in menu['groups']:
        if g.get('photo'):
            yield g['photo']
        for it in g['items']:
            if it.get('photo'):
                yield it['photo']


# ---- ファイル ----

def dump(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=1) + '\n').encode('utf-8')


def blob_sha(b):
    return hashlib.sha1(b'blob %d\0' % len(b) + b).hexdigest()


def read(name):
    b = (DATA / (name + '.json')).read_bytes()
    return json.loads(b), blob_sha(b)


def snapshot(message):
    cid = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    d = HIST / cid
    d.mkdir(parents=True)
    for n in DATAS:
        shutil.copy2(DATA / (n + '.json'), d / (n + '.json'))
    (d / 'info.json').write_text(json.dumps({'date': datetime.datetime.now().astimezone().isoformat(), 'message': message}, ensure_ascii=False), encoding='utf-8')
    return cid


def build(cid):
    p = subprocess.run([sys.executable, str(ROOT / '作る.py')], cwd=str(ROOT), capture_output=True, text=True)
    BUILDS[cid] = 'done' if p.returncode == 0 else 'failed'
    print('  作り直しました' if p.returncode == 0 else '  ★作り直せませんでした:\n' + (p.stderr or p.stdout)[-800:])


# ---- 頼みごと ----

def handle(req):
    if FAILS['until'] > time.time():
        return {'ok': False, 'error': 'locked'}
    if str(req.get('pin') or '') != PINFILE.read_text(encoding='utf-8').strip():
        now = time.time()
        if now - FAILS['t'] > FAIL_WINDOW:
            FAILS['t'], FAILS['n'] = now, 0
        FAILS['n'] += 1
        if FAILS['n'] >= MAX_FAIL:
            FAILS['until'], FAILS['n'] = now + FAIL_WINDOW, 0
        return {'ok': False, 'error': 'bad_pin'}
    FAILS['n'] = 0
    a = req.get('action')
    if a == 'ping':
        return {'ok': True, 'now': int(time.time() * 1000)}
    if a == 'load':
        got = {n: read(n) for n in DATAS}
        return dict({n: got[n][0] for n in DATAS}, ok=True, sha={n: got[n][1] for n in DATAS})
    if a == 'save':
        what = req.get('what')
        if what not in DATAS:
            return {'ok': False, 'error': 'bad_data'}
        cur, sha = read(what)
        if req.get('sha') != sha:
            return {'ok': False, 'error': 'conflict'}
        inc = req.get('data') if isinstance(req.get('data'), dict) else {}
        data = merge_menu(cur, inc) if what == 'menu' else merge_texts(cur, inc) if what == 'texts' else clean_news(inc)
        photos = req.get('photos') or []
        if not isinstance(photos, list) or len(photos) > 3:
            return {'ok': False, 'error': 'bad_photo'}
        new = {}
        for p in photos:
            name = str(p.get('name') or '')
            try:
                b = base64.b64decode(p.get('data') or '', validate=True)
            except Exception:
                return {'ok': False, 'error': 'bad_photo'}
            if not NEW_PHOTO.match(name) or len(b) > 1500000 or b[:3] != b'\xff\xd8\xff':
                return {'ok': False, 'error': 'bad_photo'}
            new[name] = b
        if what == 'menu':
            have = {f.name for f in (ROOT / '公開用' / 'img').glob('*.jpg')} | {f.name for f in (DATA / '写真').glob('*.jpg')} | set(new)
            if any(n not in have for n in photo_names(data)):
                return {'ok': False, 'error': 'bad_photo'}
        (DATA / '写真').mkdir(exist_ok=True)
        for name, b in new.items():
            (DATA / '写真' / name).write_bytes(b)
        b = dump(data)
        (DATA / (what + '.json')).write_bytes(b)
        cid = snapshot(s_(req.get('note'), 120) or '管理画面で変えました')
        print('  保存しました:', what, '／写真', len(new), '枚')
        build(cid)
        return {'ok': True, 'data': data, 'sha': blob_sha(b), 'commit': cid}
    if a == 'history':
        out = []
        for d in sorted(HIST.iterdir(), reverse=True)[:15]:
            info = json.loads((d / 'info.json').read_text(encoding='utf-8'))
            out.append({'commit': d.name, 'date': info['date'], 'message': info['message']})
        return {'ok': True, 'list': out}
    if a == 'restore':
        d = HIST / str(req.get('commit') or '')
        if not re.match(r'^[\d-]+$', str(req.get('commit') or '')) or not d.is_dir():
            return {'ok': False, 'error': 'bad_data'}
        for n in DATAS:
            if (d / (n + '.json')).exists():      # 文章ができる前の形には texts.json がない。そのときは今の文章のまま
                shutil.copy2(d / (n + '.json'), DATA / (n + '.json'))
        cid = snapshot(s_(req.get('note'), 120) or '前に戻しました')
        print('  前の形に戻しました:', d.name)
        build(cid)
        return {'ok': True, 'commit': cid}
    if a == 'status':
        return {'ok': True, 'state': BUILDS.get(str(req.get('commit') or ''), 'done')}
    return {'ok': False, 'error': 'unknown_action'}


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # /kanri/ だけは 管理/画面/ から配る（それより外は見せない）
        p = urllib.parse.unquote(path.split('?', 1)[0].split('#', 1)[0])
        if p == '/kanri' or p.startswith('/kanri/'):
            f = (ADMIN / p[len('/kanri/'):]).resolve() if len(p) > len('/kanri/') else ADMIN
            return str(f) if f == ADMIN or ADMIN.resolve() in f.parents else str(ADMIN / '_')
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def send_json(self, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split('?')[0] != '/api/kanri':
            self.send_error(404)
            return
        n = int(self.headers.get('Content-Length') or 0)
        try:
            req = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return self.send_json({'ok': False, 'error': 'bad_json'})
        try:
            with LOCK:
                return self.send_json(handle(req))
        except Bad as e:
            return self.send_json({'ok': False, 'error': str(e)})
        except Exception as e:
            print('  ★つまずきました:', repr(e))
            return self.send_json({'ok': False, 'error': 'server'})

    def log_message(self, fmt, *args):
        if len(args) > 1 and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    if not PINFILE.exists():
        chars = 'abcdefghjkmnpqrstuvwxyz23456789'
        PINFILE.write_text(''.join(random.choice(chars) for _ in range(8)) + '\n', encoding='utf-8')
    HIST.mkdir(parents=True, exist_ok=True)
    if not any(HIST.iterdir()):
        snapshot('初めの形')
    build('start')
    handler = functools.partial(Handler, directory=str(ROOT / '公開用'))
    with Server(('127.0.0.1', PORT), handler) as httpd:
        print('')
        print('  にせの受け口（ホームページの管理）が動いています')
        print('  管理画面: http://localhost:%d/kanri/' % PORT)
        print('  合言葉（試し用）: %s' % PINFILE.read_text(encoding='utf-8').strip())
        print('  ★ここで保存すると、この Mac のホームページのデータ（データ/）が本当に変わります')
        print('  ★この窓を閉じると止まります')
        print('')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n  止めました')
