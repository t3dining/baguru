#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
スマホで見る（同じ Wi-Fi のスマホで、公開する前のホームページを見る）

    python3 道具/スマホで見る.py [ポート]      （ふだんは スマホで見る.command をダブルクリック）

  ・公開用/ だけを、この Mac の Wi-Fi のアドレス（http://192.168.○.○:8150/ など）で配ります。インターネットには出しません
  ・この Mac のブラウザに QR コードを出します。スマホのカメラで読むと開きます
  ・★同じ Wi-Fi につないでいる人なら、だれでも見られます（見せるのは 公開用/ だけ。合言葉などは入っていない）。見終わったら窓を閉じて止める
  ・ネット予約・お問い合わせ・応募は、本物の受け口につながります（確認用に開く.command と同じ）。試しに送ったら、予約ボードで取り消す
"""

import functools
import html
import http.server
import json
import socket
import socketserver
import subprocess
import sys
from pathlib import Path

HP = Path(__file__).resolve().parent.parent
OUT = HP / '公開用'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8150


def lan_ip():
    """この Mac の Wi-Fi（または有線）のアドレス"""
    for ifc in ('en0', 'en1', 'en2'):
        ip = subprocess.run(['ipconfig', 'getifaddr', ifc], capture_output=True, text=True).stdout.strip()
        if ip:
            return ip
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return ''
    finally:
        s.close()


IP = lan_ip()
URL = 'http://%s:%d/' % (IP, PORT) if IP else ''

QR_PAGE = '''<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>スマホで見る｜バグる</title>
<style>body{margin:0;font-family:"Hiragino Sans",sans-serif;background:#efe8de;color:#221c18;display:grid;place-items:center;min-height:100vh}
main{background:#faf6f0;border:1px solid #e0d5c6;border-radius:10px;padding:28px 32px;text-align:center;max-width:420px}
h1{font-size:20px;margin:0 0 6px}p{margin:8px 0;line-height:1.7}#qr{display:inline-block;padding:12px;background:#fff;margin:12px 0}
code{font-size:18px;font-weight:700}small{color:#675d55}</style></head>
<body><main><h1>スマホのカメラで読んでください</h1>
<p><small>スマホも、この Mac と同じ Wi-Fi につないでおく</small></p>
<div id="qr"></div><p><code>%(url)s</code></p>
<p><small>読めないときは、スマホのブラウザに上のアドレスを入れる。<br>見終わったら、ターミナルの窓を閉じて止める。</small></p></main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>new QRCode(document.getElementById('qr'), { text: %(js)s, width: 240, height: 240 });</script>
</body></html>'''


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def do_GET(self):
        # QR の画面は、この Mac から開いたときだけ（スマホからは見せない）
        if self.path.split('?')[0] == '/__qr':
            if self.client_address[0] != '127.0.0.1':
                return self.send_error(404)
            body = (QR_PAGE % {'url': html.escape(URL or 'Wi-Fi につながっていません'), 'js': json.dumps(URL)}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def list_directory(self, path):
        self.send_error(404)      # フォルダの中身の一覧は出さない

    def log_message(self, fmt, *args):
        if len(args) > 1 and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    handler = functools.partial(Handler, directory=str(OUT))
    with Server(('0.0.0.0', PORT), handler) as httpd:
        print('')
        if URL:
            print('  スマホで開くアドレス: %s' % URL)
            print('  （この Mac のブラウザに QR コードを出しました。スマホのカメラで読むと開きます）')
        else:
            print('  ★この Mac が Wi-Fi につながっていないようです')
        print('  ★同じ Wi-Fi の人なら見られます。見終わったら、この窓を閉じて止めてください')
        print('')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n  止めました')
