#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
炭焼ハンバーグ バグる ホームページ（サンプル）を組み立てる

    python3 作る.py

  ・ページ/ の中身（各ページの本文）に、共通の頭・ヘッダー・フッター・スマホの固定バーを付けて
    公開用/ に書き出します。ヘッダーやフッターを直すときは、このファイルだけを直します
  ・メニューとお知らせは データ/menu.json・news.json から作ります（ページ/ の {{list:…}} {{news:…}} の行）。
    お店の人は管理画面（Google の受け口が出す。ホームページには置かない。管理/はじめに読む.md）から直し、管理画面で入れた写真は データ/写真/ に入ります
  ・管理画面（管理/画面/）を、Google の受け口に貼る1枚 管理/受け口/画面.html にまとめます
  ・写真は バグるインスタ写真/ から縮めて 公開用/img/ に作ります（まだ無いものだけ）
  ・sitemap.xml と robots.txt も作ります

  ★公開するときに直すもの
    COMING_SOON … True のあいだは、お客さまには「Coming soon」だけを見せ、中身は PREVIEW のアドレスに置く（python3 作る.py --pages で _site/ を作る）
    SAMPLE     … True のあいだは上に「サンプル」の帯を出し、検索に出さない（noindex）
    SITE_URL   … 公開する場所（canonical・OGP・サイトマップに入る）。いまは会社の GitHub の無料のアドレス
    ORDER_URL  … モバイルオーダーの受け口。会社の GitHub の店舗アプリ（注文だけの画面・まだ試作）を指している
"""

import datetime
import hashlib
import html
import json
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / 'ページ'
OUT = HERE / '公開用'
DATA = HERE / 'データ'   # メニューとお知らせ（管理画面から変わる）。ページ/ の {{list:…}} {{news:…}} の行に入る
PHOTOS = HERE.parent / 'バグるインスタ写真'
APP_IMG = HERE.parent / '店舗アプリ' / 'バグる' / 'img'   # ロゴとアイコン（2026-10-30 に店舗アプリが バグる/ の下に移った）
GROUP_IMG = HERE.parent / 'T3Works' / 'img'                # 系列店のロゴ（T3 Works のもの）
BUDOUX = HERE / '道具' / 'budoux_ja.json'      # 文節に分ける BudouX（Google・Apache License 2.0）の日本語モデル

SAMPLE = True
SITE_URL = 'https://t3dining.github.io/baguru'  # 会社の GitHub（無料）。ドメインを買ったら直す
# ★Coming soon（2026-11-04 ko-dai さんの指示）：公開はするが、お客さまには SITE_URL で「Coming soon」だけを見せる（write_pages）。
#   中身は SITE_URL/PREVIEW/ に置く。そのアドレスはどこにも載せず、管理画面とバグる Owner からだけ開く
#   ★会社の GitHub の置き場所は誰でも見られる（無料のため）ので、探せば中身も見える。本当の秘密は置かない
#   本当に公開する日に COMING_SOON を False にする（中身が SITE_URL に出る）。バグる Owner のホームページのカードのアドレスも、そのとき直す
COMING_SOON = False   # 2026-11-04 夕方に外した（ko-dai さんの指示：「検索で出なければいいので、coming soon も外して」）。検索に出さないのは SAMPLE の noindex
PREVIEW = 'naka-f90249acdb'
BASE_URL = SITE_URL + '/' + PREVIEW if COMING_SOON else SITE_URL   # 中身のページの場所（canonical・OGP・管理画面が開くページ）
ORDER_URL = 'https://t3dining.github.io/baguru-app/takeout.html#menu'  # ★モバイルオーダーの受け口（会社の GitHub の店舗アプリの、注文だけの画面。order.html はお店のタブレットの画面なので、つながない）
# 公式アプリ（会社の GitHub の店舗アプリ）。ページ/app.html の「アプリを開く」と QR。?openExternalBrowser=1 は、LINE の中で押しても、ふだんのブラウザで開くための印（お店の POP の QR と同じ）
APP_URL = 'https://t3dining.github.io/baguru-app/?openExternalBrowser=1'
# 上の APP_URL の QR の形（0 と 1 の並び・誤り訂正 M）。店舗アプリ/バグる/POP/作る.py の MAT_APP と同じもの（アプリと同じ道具 qrcode-generator で作った）。★APP_URL を変えたら作り直す
APP_QR = """111111101110010010011001001111111 100000101010110010001001001000001 101110100101100010010011101011101 101110101101001101011011001011101 101110100010101001010110101011101 100000100011101000110010101000001 111111101010101010101010101111111 000000001010100001111011100000000 101101110011101011110100001001011 111101001010101011111101001101101 101000101000101000101011110111001 110110001100011110111010001101000 001011100011100111000011110011010 010010010010000101100101100000110 110010100100010001010100001101000 001001000101011110101101011011100 001010101010111100010110011011100 000101011111001100001011101011001 010100101110010111001110111110110 101000000101100111101011110010000 011001100101110101100100000001110 110100001111000001011111011100101 001110110110011000100111111000011 011001011000111110010000110011010 101000111001111101000000111111011 000000001010000101010001100011010 111111101110111001011111101010000 100000101011001010011101100011110 101110100100011110101111111110111 101110101011111101001111110100001 101110101101000110100010111100100 100000100101001011110001101110001 111111101010001011100101010011100"""
# ★ネット予約・お問い合わせ・応募の受け口。会社の Google アカウントのウェブアプリ（2026-10-28 に置いた）。URLは秘密ではない（守っているのは合言葉）
#   受け口のコードは 店舗アプリ/バグる/予約ボード/受け口/コード.gs（予約ボードと同じ受け口）。URLを変えたら 店舗アプリ/バグる/予約ボード/board/config.js も直す
#   Mac の「にせの受け口」で試すときは '/api/reserve' にする（確認用に開く.command で動く）
RESERVE_API = 'https://script.google.com/macros/s/AKfycbxhDQclu9UmX99MNbw0AqkvKgbHSshoReuPFzdCvo3fjWPHPdUzPxA-CAMQXVJm9qwZ/exec'
# 定休日・臨時休業・臨時営業は、T3Works のマネージ（⚙ 設定 → 定休日）で決める。それを読む口（合言葉の要らない口。店舗アプリと同じ）
#   ホームページは main.js が読んで、「本日の営業」・定休日の字・「臨時の営業・お休み」を直す。ネット予約の日は予約ボードの受け口が決める
DAYS_URL = 'https://t3works-sync.t3dining.workers.dev/days/baguru'

SHOP = {
    'name': '炭焼ハンバーグ バグる',
    'full': 'お肉に愛を込めて 炭焼ハンバーグ バグる',
    'tel': '0565-85-7955',
    'address': '愛知県豊田市若林西町茶屋間1-3',
    'instagram': 'https://www.instagram.com/baguru.hamburg/',
}
_q = urllib.parse.quote(SHOP['name'] + ' ' + SHOP['address'])
VARS = {
    'TEL': SHOP['tel'],
    'TEL_LINK': 'tel:' + SHOP['tel'].replace('-', ''),
    'ORDER_URL': ORDER_URL,
    'APP_URL': APP_URL,
    'MAP_EMBED': 'https://www.google.com/maps?q=%s&output=embed&hl=ja' % _q,
    'MAP_LINK': 'https://www.google.com/maps/search/?api=1&query=%s' % _q,
    'INSTAGRAM': SHOP['instagram'],
}

# ユーザーが決めた並び（ホーム、コンセプト、予約、メニュー、テイクアウト、ニュース、アクセス、採用）。お問い合わせは最後に足した
NAV = [
    ('index', 'ホーム', 'HOME'),
    ('concept', 'コンセプト', 'CONCEPT'),
    ('reserve', 'ご予約', 'RESERVE'),
    ('menu', 'メニュー', 'MENU'),
    ('takeout', 'テイクアウト', 'TAKEOUT'),
    ('news', 'ニュース', 'NEWS'),
    ('access', 'アクセス', 'ACCESS'),
    ('recruit', '採用', 'RECRUIT'),
    ('contact', 'お問い合わせ', 'CONTACT'),
]

# 系列店（全ページの下の欄に出す。ホットペッパーグルメのお店のページへ）。(店名, アドレス, GROUP_IMG のロゴ)
# ロゴは make_images が img/group-○○.png（余白を切って正方形）にする。黒い字のロゴがあるので、下の欄では明るい札にのせる
GROUP_SHOPS = [
    ('炭焼きこじゃれ', 'https://www.hotpepper.jp/strJ003560433/', 'kojare.png'),
    ('炭まろ', 'https://www.hotpepper.jp/strJ001250950/', 'sumimaro.png'),
    ('炭火屋ちゃこる', 'https://www.hotpepper.jp/strJ001193911/', 'chacoru.png'),
    ('Cafe Stand popo', 'https://www.hotpepper.jp/strJ003917376/', 'popo.png'),
    ('おいでんテラス', 'https://www.hotpepper.jp/strJ004577293/', 'oiden.png'),
]

# 各ページの上の大きな飾りの英字と写真。★ページの題・検索結果の説明・大きな見出しと、その下の字は データ/texts.json（管理画面で直す）
# 新しいページを足すときは、ここに title・desc・h1・sub も書いて 道具/文章を分ける.py を動かす（texts.json に移ったら、ここからは消す）
PAGES = {
    'index': dict(),
    'concept': dict(en='CONCEPT', img='ph-concept.jpg'),
    'reserve': dict(en='RESERVE', img='ph-reserve.jpg'),
    'menu': dict(en='MENU', img='ph-menu.jpg'),
    'takeout': dict(en='TAKEOUT', img='ph-takeout.jpg'),
    'news': dict(en='NEWS', img='ph-news.jpg'),
    'access': dict(en='ACCESS', img='ph-access.jpg'),
    'recruit': dict(en='RECRUIT', img='ph-recruit.jpg'),
    'contact': dict(en='CONTACT', img='ph-contact.jpg'),
    'privacy': dict(en='PRIVACY', img='ph-contact.jpg'),
    'app': dict(en='APP', img='ph-app.jpg'),
}

# 写真：(作る名前, もとの写真, 幅, 高さ, 切り抜く枠 or None)
# ★もとの写真より大きくしない（ぼやけるため）
IMAGES = [
    ('hero.jpg', '商品写真/超粗びきハンバーグ⑧.jpg', 1400, 1100, None),
    ('og.jpg', '商品写真/超粗びきハンバーグ⑧.jpg', 1200, 630, None),
    ('hb-arabiki.jpg', '商品写真/超粗びきハンバーグ④.jpg', 900, 675, None),
    ('hb-teppan.jpg', '商品写真/鉄板炭焼ハンバーグ①.jpg', 900, 675, None),
    ('hb-demi.jpg', '商品写真/デミソースハンバーグ①.jpg', 900, 675, None),
    ('hb-cheese.jpg', '商品写真/チーズかけハンバーグ.jpg', 900, 675, None),
    ('howto.jpg', '商品写真/超粗びきハンバーグ①.jpg', 900, 900, None),
    ('lunch-hamburg.jpg', '商品写真/炭焼ハンバーグランチ①.jpg', 900, 675, None),
    # lunch-karaage.jpg は 道具/唐揚げランチの写真を作る.py が作る（「ランチ②」の札を消して、皿全体が入るように。2026-11-04）。ここに入れると、札の入った形で作り直してしまう
    ('lunch-taco.jpg', '商品写真/タコライスプレート①.jpg', 900, 675, None),
    ('pudding.jpg', '商品写真/レトロぷりん③.JPG', 1200, 900, None),
    ('acai.jpg', '商品写真/アサイーボウル 宣材写真.jpg', 1200, 900, None),
    ('takeout.jpg', '商品写真/炭焼ハンバーグランチ②.jpg', 1650, 1100, None),
    ('ch-fire.jpg', '商品写真/鉄板炭焼ハンバーグ③.jpg', 1100, 733, None),
    ('ch-meat.jpg', '商品写真/超粗びきハンバーグ⑤.jpg', 1200, 800, None),
    ('ch-sauce.jpg', '商品写真/デミソースハンバーグ③.jpg', 1200, 800, None),
    ('ch-rice.jpg', '商品写真/炭焼ハンバーグランチ①.jpg', 1100, 733, None),
    ('ch-pudding.jpg', '商品写真/レトロぷりん⑥.JPG', 1200, 800, None),
    ('ph-concept.jpg', '店内と外観/店内09.jpg', 1600, 640, (0, 180, 2000, 980)),
    ('ph-reserve.jpg', '商品写真/鉄板炭焼ハンバーグ⑤.jpg', 1600, 640, None),
    ('ph-menu.jpg', '商品写真/鉄板炭焼ハンバーグ⑥.jpg', 1600, 640, None),
    ('ph-takeout.jpg', '商品写真/炭焼ハンバーグランチ②.jpg', 1600, 640, None),
    ('ph-news.jpg', '商品写真/デミソースハンバーグ④.jpg', 1600, 640, None),
    ('ph-access.jpg', '店内と外観/外観04.jpg', 1100, 440, (0, 360, 2000, 1160)),
    ('ph-recruit.jpg', '商品写真/鉄板炭焼ハンバーグ④.jpg', 1600, 640, None),
    ('ph-contact.jpg', '商品写真/超粗びきハンバーグ⑦.jpg', 1600, 640, None),
    ('ph-app.jpg', '商品写真/鉄板炭焼ハンバーグ①.jpg', 1600, 640, None),
    ('recruit.jpg', '商品写真/超粗びきハンバーグ③.jpg', 1100, 733, None),
    # 店内と外観（2026-10-29 お店からもらった写真。店内09 は左下に順番待ちの紙が写るので、そこを切る）
    ('in-main.jpg', '店内と外観/店内02.jpg', 1200, 900, None),
    ('in-window.jpg', '店内と外観/店内01.jpg', 800, 600, None),
    ('in-counter.jpg', '店内と外観/店内03.jpg', 800, 600, None),
    ('in-brick.jpg', '店内と外観/店内05.jpg', 800, 600, None),
    ('in-aisle.jpg', '店内と外観/店内08.jpg', 800, 600, None),
    ('ex-sign.jpg', '店内と外観/外観07.jpg', 600, 800, (20, 300, 650, 1140)),
    ('ex-front.jpg', '店内と外観/外観04.jpg', 1000, 625, (0, 330, 2000, 1500)),
    ('ex-roof.jpg', '店内と外観/外観02.jpg', 1000, 625, (0, 260, 2000, 1500)),
    ('tk-box.jpg', '商品写真/テイクアウト ハンバーグBOX.jpg', 900, 675, (0, 400, 2000, 1900)),   # ふたの内側を外して 4:3 に
    ('tk-karaage.jpg', '商品写真/テイクアウト 唐揚げ定食.jpg', 800, 600, (0, 440, 2000, 1940)),
    ('tk-taco.jpg', '商品写真/テイクアウト タコライス定食.jpg', 800, 600, (350, 560, 2000, 1798)),   # 左のタバスコの瓶は入れない
    ('tk-salad.jpg', '商品写真/テイクアウト シーザーサラダ.jpg', 600, 400, None),
    ('kids-set.jpg', '商品写真/おこさまセット.jpg', 900, 675, (160, 0, 1937, 1333)),
    ('float.jpg', '商品写真/バグるのフロート.jpg', 900, 675, (120, 0, 1897, 1333)),
    ('side-pepper.jpg', '商品写真/サイド 和牛ガーリックペッパーライス.jpg', 600, 400, None),
    ('side-salad.jpg', '商品写真/サイド 半熟たまごと炭焼ベーコンのサラダ.jpg', 600, 400, None),
    ('side-mayo.jpg', '商品写真/サイド ベーコンとブロッコリーのマヨチーズ焼.jpg', 600, 400, None),
    ('side-menchi.jpg', '商品写真/サイド ゴロゴロ和牛メンチカツ.jpg', 600, 400, None),
    ('side-karaage.jpg', '商品写真/サイド バグるの手作りカラアゲ.jpg', 600, 400, None),
    ('side-sausage.jpg', '商品写真/サイド 炭焼ソーセージ.jpg', 600, 400, None),
    ('side-potato.jpg', '商品写真/サイド 揚げたてポテトフライ.jpg', 600, 400, None),
    ('acai-plain.jpg', '商品写真/TO アサイーボウル プレーン.jpg', 600, 600, None),
    ('acai-banana.jpg', '商品写真/TO アサイーボウル バナナ.jpg', 600, 600, None),
    ('acai-berry.jpg', '商品写真/TO アサイーボウル ベリーベリー.jpg', 600, 600, None),
    ('acai-tropical.jpg', '商品写真/TO アサイーボウル トロピカル.jpg', 600, 600, None),
    ('acai-bbb.jpg', '商品写真/TO アサイーボウルベリーベリーバナナ.jpg', 600, 600, None),
]
# ボトルを並べた写真：(作る名前, [背景を切り抜いたボトル（左から）], 幅, 高さ, 下地の色)
# 切り抜きは、もとの写真（白い背景）の白を外から塗りつぶして透明にしたもの（2026-10-30）
LINEUPS = [
    ('dr-pepsi.jpg', ['商品写真/ドリンク ペプシコーラ（切り抜き）.png'], 600, 400, (242, 235, 225)),
    ('dr-oolong.jpg', ['商品写真/ドリンク サントリー烏龍茶（切り抜き）.png'], 600, 400, (242, 235, 225)),
]
# 牛のロゴとアイコンは、店舗アプリと同じものを写す（店舗アプリ側は触らない）
COPY = ['logo.png', 'icon-192.png', 'apple-touch-icon.png']


def make_images():
    from PIL import Image, ImageDraw, ImageFilter, ImageOps
    d = OUT / 'img'
    d.mkdir(parents=True, exist_ok=True)
    made = 0
    for name, src, w, h, box in IMAGES:
        out = d / name
        if out.exists():
            continue
        im = Image.open(PHOTOS / src)
        im.draft('RGB', (w * 2, h * 2))
        im = ImageOps.exif_transpose(im).convert('RGB')
        if box:
            im = im.crop(box)
        im = ImageOps.fit(im, (w, h), Image.LANCZOS)
        im.save(out, 'JPEG', quality=80, optimize=True, progressive=True)
        made += 1
    for name, srcs, w, h, color in LINEUPS:
        out = d / name
        if out.exists():
            continue
        im = Image.new('RGBA', (w, h), color + (255,))
        bottles = []
        for src in srcs:
            b = Image.open(PHOTOS / src).convert('RGBA')
            bh = round(h * 0.82)
            bottles.append(b.resize((round(b.width * bh / b.height), bh), Image.LANCZOS))
        gap = round(w * 0.07)
        x = (w - sum(b.width for b in bottles) - gap * (len(bottles) - 1)) // 2
        floor = round(h * 0.92)
        for b in bottles:
            # 足もとにうすい影
            sh = Image.new('L', (w, h), 0)
            ImageDraw.Draw(sh).ellipse((x + b.width * 0.08, floor - 7, x + b.width * 0.92, floor + 7), fill=70)
            im.paste((40, 30, 20, 255), (0, 0), sh.filter(ImageFilter.GaussianBlur(6)))
            im.alpha_composite(b, (x, floor - b.height))
            x += b.width + gap
        im.convert('RGB').save(out, 'JPEG', quality=82, optimize=True, progressive=True)
        made += 1
    for _, _, logo in GROUP_SHOPS:
        out = d / ('group-' + logo)
        if out.exists():
            continue
        im = Image.open(GROUP_IMG / logo).convert('RGBA')
        im = ImageOps.contain(im.crop(im.getbbox()), (184, 184), Image.LANCZOS)
        sq = Image.new('RGBA', (192, 192), (0, 0, 0, 0))
        sq.alpha_composite(im, ((192 - im.width) // 2, (192 - im.height) // 2))
        sq.save(out, 'PNG', optimize=True)
        made += 1
    for f in sorted((DATA / '写真').glob('*.jpg')):
        if not (d / f.name).exists():
            shutil.copy2(f, d / f.name)
            made += 1
    for name in COPY:
        if not (d / name).exists():
            shutil.copy2(APP_IMG / name, d / name)
            made += 1
    return made


def img_size(name, cache={}):
    if name not in cache:
        from PIL import Image
        with Image.open(OUT / 'img' / name) as im:
            cache[name] = im.size
    return cache[name]


def fix_imgs(s):
    """img に幅・高さ（画面のがたつきを防ぐ）と、遅れて読む印を付ける。最初に見える写真は data-eager で外す"""
    def rep(m):
        tag = m.group(0)
        src = re.search(r'src="img/([^"]+)"', tag)
        if src and 'width=' not in tag:
            w, h = img_size(src.group(1))
            tag = tag.replace('<img ', '<img width="%d" height="%d" ' % (w, h), 1)
        if 'data-eager' in tag:
            tag = tag.replace(' data-eager', '')
        elif 'loading=' not in tag:
            tag = tag.replace('<img ', '<img loading="lazy" decoding="async" ', 1)
        return tag
    return re.sub(r'<img [^>]*>', rep, s)


def qr_svg(rows, label):
    """0 と 1 の並びを、にじまない SVG の QR にする（まわりに白い余白4つ分）"""
    rows = rows.split()
    n = len(rows)
    d = ''.join('M%d %dh1v1h-1z' % (x, y) for y, row in enumerate(rows) for x, c in enumerate(row) if c == '1')
    return ('<svg class="qr" viewBox="-4 -4 %d %d" shape-rendering="crispEdges" role="img" aria-label="%s">'
            '<rect x="-4" y="-4" width="%d" height="%d" fill="#fff"/><path d="%s" fill="#000"/></svg>') % (n + 8, n + 8, label, n + 8, n + 8, d)


def fill(s):
    s = s.replace('{{APP_QR}}', qr_svg(APP_QR, '公式アプリを開くQRコード'))
    for k, v in VARS.items():
        s = s.replace('{{%s}}' % k, html.escape(v, quote=True))
    left = re.findall(r'\{\{[A-Z_]+\}\}', s)
    if left:
        raise SystemExit('埋められなかった印があります: %s' % ', '.join(sorted(set(left))))
    return s


# ---- メニューとお知らせ（データ/menu.json・news.json から作る）----
# 品の status：'' ＝ふつう、'soldout' ＝売り切れ（印を出す）、'paused' ＝しばらくお休み（出さない）
NEWS_CAT = {'イベント': ' is-event'}   # 色を変える種類


def tx(s):
    return html.escape(s or '', quote=False)


def at(s):
    return html.escape(s or '', quote=True)


def mt(ref, s, br=False):
    """メニューの字に、管理画面の「ページで直す」の印を付ける（<!--m:群.番号.欄--> 〜 <!--/m-->。見た目は変わらない）。
    ref は「群の id.品の番号（menu.json の並び。お休みの品も数える）.欄」。br：改行を <br> にする（説明だけ）"""
    body = tx(s)
    if br:
        body = breaks(body)
    return '<!--m:%s-->%s<!--/m-->' % (ref, body)


def yen(p, ref=None):
    return '%s<small>円</small>' % (mt(ref, p) if ref else tx(p))


def soldout(it):
    return it.get('status') == 'soldout'


def sold(it):
    return '<span class="sold">売り切れ</span>' if soldout(it) else ''


def cls(base, it):
    return base + (' is-soldout' if soldout(it) else '')


def pic(it, extra=''):
    return '<img src="img/%s" alt="%s"%s>' % (at(it['photo']), at(it.get('alt')), extra)


def sized(it):
    w, h = img_size(it['photo'])
    return pic(it, ' width="%d" height="%d" loading="lazy"' % (w, h))


# 品を作る関数の r は、印の頭（「群の id.品の番号.」）
def li(it, r):
    sub = '<small>%s</small>' % mt(r + 'sub', it['sub'], True) if it.get('sub') else ''
    return '<li><span class="nm">%s%s%s</span><span class="pr">%s</span></li>' % (mt(r + 'name', it['name'], True), sold(it), sub, yen(it['price'], r + 'price'))


def trs(it, r):
    return ['  <tr><th>%s</th><td>%s</td></tr>' % (mt(r + 'prices.%d.label' % j, x['label']), yen(x['price'], r + 'prices.%d.price' % j))
            for j, x in enumerate(it['prices'])]


def duo_yen(it):
    ps = it['prices']
    if len(ps) == 1 and not ps[0].get('label'):
        return yen(ps[0]['price'])
    out = []
    for i, r in enumerate(ps):
        num = r['price'].rstrip('〜')
        tail = '〜' * (len(r['price']) - len(num)) + ('（%s）' % tx(r['label']) if r.get('label') else '') + ('／' if i < len(ps) - 1 else '')
        out.append('%s<small>円%s</small>' % (tx(num), tail))
    return ''.join(out)


def mh(it, no, r):
    out = ['<article class="%s" id="%s">' % (cls('mh menu-sec', it), at(it['id'])),
           '  <figure>%s<span class="hb-no">%02d</span></figure>' % (pic(it), no),
           '  <div>']
    if it.get('badges'):
        out.append('    <div class="badges">%s</div>' % ''.join(
            '<span class="badge%s">%s</span>' % (' is-' + b['color'] if b.get('color') else '', mt(r + 'badges.%d.text' % j, b['text'])) for j, b in enumerate(it['badges'])))
    out.append('    <h3>%s%s</h3>' % (mt(r + 'name', it['name'], True), sold(it)))
    if it.get('copy'):
        out.append('    <p class="mh-copy">%s</p>' % mt(r + 'copy', it['copy'], True))
    out += ['    <table class="price-tbl">'] + ['    ' + x for x in trs(it, r)] + ['    </table>']
    if it.get('tip'):
        out.append('    <p class="tip"><b>%s</b>　%s</p>' % (mt(r + 'tip.label', it['tip']['label']), mt(r + 'tip.text', it['tip']['text'], br=True)))
    return out + ['  </div>', '</article>']


def card(it, r):
    return ['<article class="%s">' % cls('card', it),
            '  <figure>%s</figure>' % pic(it),
            '  <div class="card-body"><h3>%s%s</h3><p>%s</p>' % (mt(r + 'name', it['name'], True), sold(it), mt(r + 'copy', it.get('copy'), True)),
            '    <table class="price-tbl lunch">'] + ['    ' + x for x in trs(it, r)] + ['    </table></div>', '</article>']


def pic_card(it, r):
    out = ['<article class="%s">' % cls('pic-card', it),
           '  <figure class="pic-fig">%s</figure>' % sized(it),
           '  <div class="pic-body">',
           '    <div class="pic-hd"><h4>%s%s</h4><span class="pr">%s</span></div>' % (mt(r + 'name', it['name'], True), sold(it), yen(it['price'], r + 'price'))]
    if it.get('note'):
        out.append('    <p class="note">%s</p>' % mt(r + 'note', it['note'], True))
    return out + ['  </div>', '</article>']


def duo(it, r):
    # 値段は、量の名前と「〜」をはさんで作るので、ページで直す印は付けない（メニューのタブで直す）
    out = ['<article class="%s">' % cls('duo-item', it), '  ' + pic(it), '  <div class="duo-body">']
    if it.get('limit'):
        out.append('    <span class="limit">%s</span>' % mt(r + 'limit', it['limit']))
    out.append('    <h3>%s%s</h3>' % (mt(r + 'name', it['name'], True), sold(it)))
    if it.get('copy'):
        out.append('    <p>%s</p>' % mt(r + 'copy', it['copy'], True))
    return out + ['    <span class="yen">%s</span>' % duo_yen(it), '  </div>', '</article>']


def mini(it, r):
    ps = '／'.join('<span class="yen">%s</span>円' % mt(r + 'prices.%d.price' % j, x['price']) for j, x in enumerate(it['prices']))
    return ['<article class="%s">%s<div><h4>%s%s</h4><p>%s</p></div></article>' % (cls('mini', it), pic(it), mt(r + 'name', it['name'], True), sold(it), ps)]


def group_lines(g):
    items = [('%s.%d.' % (g['id'], i), it) for i, it in enumerate(g['items']) if it.get('status') != 'paused']
    k = g['type']
    if k == 'plist':
        return [li(it, r) for r, it in items]
    if k == 'pic-set':
        return (['<div class="pic-set">', '  <figure class="pic-fig">%s</figure>' % sized(g), '  <ul class="plist">']
                + ['    ' + li(it, r) for r, it in items] + ['  </ul>', '</div>'])
    if k == 'mini':
        return [x for r, it in items for x in mini(it, r)]
    if k == 'mh':
        blocks = [mh(it, n + 1, r) for n, (r, it) in enumerate(items)]
    else:
        blocks = [{'card': card, 'pic-card': pic_card, 'duo': duo}[k](it, r) for r, it in items]
    out = []
    for b in blocks:
        out += ([''] if out and k == 'mh' else []) + b
    return out


def news_row(n, href):
    return ('<li><a class="news-row" href="%s#%s"><time class="news-date" datetime="%s">%s</time>'
            '<span class="news-cat%s">%s</span><p class="news-ttl">%s</p></a></li>') % (
        href, at(n['id']), at(n['date']), n['date'].replace('-', '.'), NEWS_CAT.get(n['cat'], ''), tx(n['cat']), tx(n['title']))


def news_art(n):
    out = ['<article class="news-art" id="%s">' % at(n['id']),
           '  <header><time class="news-date" datetime="%s">%s</time><span class="news-cat%s">%s</span><h2>%s</h2></header>' % (
               at(n['date']), n['date'].replace('-', '.'), NEWS_CAT.get(n['cat'], ''), tx(n['cat']), tx(n['title']))]
    out += ['  <p>%s</p>' % tx(line) for line in n.get('body', '').split('\n') if line.strip()]
    if n.get('link'):
        out.append('  <p><a href="%s">%s</a></p>' % (at(n['link']['href']), tx(n['link']['text'])))
    return out + ['</article>']


def load_data(cache={}):
    if not cache:
        menu = json.loads((DATA / 'menu.json').read_text(encoding='utf-8'))
        cache['groups'] = {g['id']: g for g in menu['groups']}
        news = json.loads((DATA / 'news.json').read_text(encoding='utf-8'))
        cache['news'] = sorted(news['items'], key=lambda n: n['date'], reverse=True)
    return cache


def put_data(s):
    """ページの {{list:群}} と {{news:home|list|articles}} だけの行を、データから作った HTML にする（行の字下げは引き継ぐ）"""
    d = load_data()

    def rep(m):
        ind, kind, key = m.groups()
        if kind == 'list':
            if key not in d['groups']:
                raise SystemExit('データ/menu.json に「%s」がありません' % key)
            lines = group_lines(d['groups'][key])
        elif key == 'home':
            lines = [news_row(n, 'news.html') for n in d['news'][:3]]
        elif key == 'list':
            lines = [news_row(n, '') for n in d['news']]
        else:
            lines = [x for n in d['news'] for x in news_art(n)]
        return '\n'.join(ind + x if x else '' for x in lines)
    return re.sub(r'^([ \t]*)\{\{(list|news):([\w-]+)\}\}$', rep, s, flags=re.M)


# ---- ページの文章（データ/texts.json から入れる。管理画面で直す）----
# ページ/ と下の欄（footer）の {{t:キー}} を、texts.json の文にする。文の改行は <br>、**で囲んだところ** は太字
# 文の中の {{TEL}} などは埋める。ほかの {{ }} は印にならないようにする（管理画面で何を入れても、作り直しが止まらないように）
# ★ページに文を足したり消したりしたら、python3 道具/文章を分ける.py を動かす（texts.json の並びもそろう）
# 文のまわりには <!--t:キー--> 〜 <!--/t--> の印を残す（見た目は変わらない）。管理画面の「ページで直す」で、js/edit.js がこの印で文を見つける

def load_texts(cache={}):
    if not cache:
        d = json.loads((DATA / 'texts.json').read_text(encoding='utf-8'))
        for p in d['pages']:
            for part in p['parts']:
                for x in part['texts']:
                    cache[x['key']] = x['text']
    return cache


def text_of(key):
    t = load_texts()
    if key not in t:
        raise SystemExit('データ/texts.json に「%s」がありません（python3 道具/文章を分ける.py を動かす）' % key)
    s = re.sub(r'\{\{([A-Z_]+)\}\}', lambda m: VARS.get(m.group(1), m.group(0)), t[key])
    return s.replace('{{', '{⁠{')


# スマホだけ・パソコンだけの改行（2026-11-04 ko-dai さんの指示：「改行だけ別々」）。管理画面の「ページで直す」で、選んでいる端末の形で Enter を押すと入る。
# 文の中では次の印。ページでは <br class="br-sp">・<br class="br-pc"> にし、css/style.css が幅 820px で出し分ける（ふつうの改行 \n は両方）
# ★同じ印を js/edit.js・管理/画面/kanri.js でも使う。変えるときは3つとも
SP_BR, PC_BR = '【スマホ改行】', '【パソコン改行】'


def breaks(s):
    """エスケープした文の改行を <br> にする（スマホだけ・パソコンだけの改行も）"""
    return s.replace(SP_BR, '<br class="br-sp">').replace(PC_BR, '<br class="br-pc">').replace('\n', '<br>')


def rich(s):
    return breaks(re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', tx(s), flags=re.S))


def put_texts(s):
    return re.sub(r'\{\{t:([a-z0-9-]+)\}\}', lambda m: '<!--t:%s-->%s<!--/t-->' % (m.group(1), rich(text_of(m.group(1)))), s)


def meta(page):
    """ページの題・検索結果の説明・大きな見出しとその下の字（改行と改行の印は消す）と、飾りの英字・写真。
    大きな見出しとその下の字は改行できる（2026-11-04c）。改行を入れて出すのは page_hero の中だけ（パンくずリスト・検索の情報は1行）"""
    p = dict(PAGES[page])
    for k in ('title', 'desc') if page == 'index' else ('title', 'desc', 'h1', 'sub'):
        p[k] = re.sub(r'\s*(\n|%s|%s)\s*' % (SP_BR, PC_BR), '', text_of('%s-%s' % (page, k)))
    return p


def faq(body):
    """よくある質問（<details><summary>問い</summary>答え</details>）の、問いと答えの字"""
    plain = lambda x: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'<br\s*/?>', '', x)))).strip()
    return [(plain(q), plain(a)) for q, a in re.findall(r'<details[^>]*>\s*<summary>(.*?)</summary>(.*?)</details>', body, re.S)]


def url(page):
    return BASE_URL + '/' + ('' if page == 'index' else page + '.html')


def jsonld(page, body):
    p = meta(page)
    shop = {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        '@id': BASE_URL + '/#restaurant',
        'name': SHOP['name'],
        'alternateName': SHOP['full'],
        'url': BASE_URL + '/',
        'image': BASE_URL + '/img/og.jpg',
        'logo': BASE_URL + '/img/logo.png',
        'telephone': '+81-565-85-7955',
        'address': {
            '@type': 'PostalAddress',
            'streetAddress': '若林西町茶屋間1-3',
            'addressLocality': '豊田市',
            'addressRegion': '愛知県',
            'addressCountry': 'JP',
        },
        'servesCuisine': ['ハンバーグ', '洋食'],
        'priceRange': '¥1,000〜¥2,000',
        'acceptsReservations': url('reserve'),
        'hasMenu': url('menu'),
        'paymentAccepted': 'Cash, Credit Card, QRコード決済',
        'smokingAllowed': False,
        'sameAs': [SHOP['instagram']],
        'openingHoursSpecification': [
            {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday', 'Wednesday', 'Thursday', 'Friday'], 'opens': '11:00', 'closes': '15:00'},
            {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday', 'Wednesday', 'Thursday', 'Friday'], 'opens': '17:00', 'closes': '22:30'},
            {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Saturday', 'Sunday'], 'opens': '11:00', 'closes': '22:30'},
        ],
    }
    items = [shop]
    if page != 'index':
        items.append({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'ホーム', 'item': url('index')},
                {'@type': 'ListItem', 'position': 2, 'name': p['h1'], 'item': url(page)},
            ],
        })
    qa = faq(body)      # よくある質問は、ページに出ている問いと答えから作る（直したら、こちらも変わる）
    if qa:
        items.append({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in qa],
        })
    # 文は管理画面から変わるので、< は < にして </script> で切れないようにする
    return '\n'.join('<script type="application/ld+json">%s</script>' % json.dumps(x, ensure_ascii=False).replace('<', '\\u003c') for x in items)


SPRITE = '''<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="i-phone" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24"><path d="M20 10c0 6.5-8 12-8 12s-8-5.5-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></symbol>
<symbol id="i-menu" viewBox="0 0 24 24"><path d="M6 2v8a2 2 0 0 0 4 0V2M8 10v12M18 22V2c-2.5 1.5-4 4.5-4 8v4h4"/></symbol>
<symbol id="i-bag" viewBox="0 0 24 24"><path d="M5 8h14l-1.2 13H6.2L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></symbol>
<symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></symbol>
<symbol id="i-car" viewBox="0 0 24 24"><path d="M3 17v-4l2.2-5.5A2 2 0 0 1 7 6h10a2 2 0 0 1 1.8 1.5L21 13v4z"/><path d="M3 13h18"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/></symbol>
<symbol id="i-door" viewBox="0 0 24 24"><path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M14 12h.01"/></symbol>
<symbol id="i-flame" viewBox="0 0 24 24"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6 0 2 1 3.5 2.5 3.5C11.5 9 11 6 12 2z"/></symbol>
<symbol id="i-card" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></symbol>
<symbol id="i-kids" viewBox="0 0 24 24"><circle cx="12" cy="6" r="3"/><path d="M6 21v-6a6 6 0 0 1 12 0v6M9 21v-4h6v4"/></symbol>
<symbol id="i-seat" viewBox="0 0 24 24"><path d="M6 3v10h12M6 13v8M18 13v8M9 17h6"/></symbol>
<symbol id="i-phone2" viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></symbol>
<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-ig" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></symbol>
<symbol id="i-share" viewBox="0 0 24 24"><path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5H6.5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8.5a1 1 0 0 0-1-1h-2"/></symbol>
<symbol id="i-addbox" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></symbol>
<symbol id="i-kebab" viewBox="0 0 24 24"><circle cx="12" cy="5.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/></symbol>
<symbol id="i-nosmoke" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></symbol>
</svg>'''


def icon(name, cls='i'):
    return '<svg class="%s" aria-hidden="true"><use href="#i-%s"/></svg>' % (cls, name)


def header(page):
    items = []
    for key, ja, en in NAV:
        cur = ' aria-current="page"' if key == page else ''
        items.append('<li><a href="%s.html"%s><span class="en">%s</span>%s</a></li>' % (key, cur, en, ja))
    return '''<header class="hd">
  <div class="hd-in wrap">
    <a class="owner-home" href="https://t3dining.github.io/baguru-owner/" hidden aria-label="バグる Owner にもどる">🏠<span> ホーム</span></a>
    <a class="logo" href="index.html" aria-label="炭焼ハンバーグ バグる ホームへ">
      <img src="img/logo.png" width="60" height="57" alt="" data-eager>
      <span class="logo-txt"><span class="logo-s">炭焼ハンバーグ</span><span class="logo-b">バグる</span></span>
    </a>
    <nav class="gnav" id="gnav" aria-label="メインメニュー">
      <ul>%s</ul>
      <div class="gnav-extra">
        <a class="btn btn-ember btn-wide" href="{{TEL_LINK}}">%s電話する {{TEL}}</a>
        <a class="gnav-app" href="app.html"><img src="img/app-icon.png" width="40" height="40" alt=""><span><b>公式アプリ</b><small>注文・予約・スタンプカード</small></span></a>
        <p class="gnav-hours">本日の営業：<span data-today>平日 11:00–15:00 / 17:00–22:30</span></p>
        <p class="gnav-hours">定休日：<span data-days="dows">火曜日</span><span data-days="note">（祝日・GW・お盆・年末年始は営業）</span></p>
      </div>
    </nav>
    <a class="hd-tel" href="{{TEL_LINK}}" aria-label="電話する {{TEL}}">%s<span class="hd-tel-n">{{TEL}}</span><span class="hd-tel-l">電話</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="gnav" aria-label="メニューを開く"><span class="bars"></span><span class="nav-toggle-l">MENU</span></button>
  </div>
</header>''' % ('\n        '.join(items), icon('phone'), icon('phone'))


def page_hero(page):
    p = meta(page)
    # 大きな見出しとその下の字は、管理画面の「ページで直す」で押して直せるように <!--t:キー--> の印を付ける（改行もそのまま出す）
    h1, sub = ('<!--t:%s-%s-->%s<!--/t-->' % (page, k, rich(text_of('%s-%s' % (page, k)))) for k in ('h1', 'sub'))
    return '''<section class="phero" data-en="%s">
  <img src="img/%s" alt="" data-eager>
  <div class="phero-in wrap">
    <p class="phero-en">%s</p>
    <h1>%s</h1>
    <p class="phero-sub">%s</p>
  </div>
</section>
<nav class="crumb wrap" aria-label="パンくずリスト"><ol><li><a href="index.html">ホーム</a></li><li aria-current="page">%s</li></ol></nav>''' % (
        p['en'], p['img'], p['en'], h1, sub, tx(p['h1']))


def footer():
    links = ''.join('<li><a href="%s.html">%s</a></li>' % (k, ja) for k, ja, _ in NAV + [('app', '公式アプリ', 'APP')])
    group = ''.join('<li><a href="%s" target="_blank" rel="noopener"><span class="ft-group-logo"><img src="img/group-%s" alt=""></span>%s</a></li>' % (url, logo, ja)
                    for ja, url, logo in GROUP_SHOPS)
    year = datetime.date.today().year
    return '''<footer class="ft">
  <div class="ft-in wrap">
    <div class="ft-shop">
      <a class="logo" href="index.html" aria-label="炭焼ハンバーグ バグる ホームへ">
        <img src="img/logo.png" width="44" height="42" alt="">
        <span class="logo-txt"><span class="logo-s">炭焼ハンバーグ</span><span class="logo-b">バグる</span></span>
      </a>
      <p class="ft-name">{{t:common-1}}</p>
      <address>{{t:common-2}}</address>
      <p class="ft-tel"><a href="{{TEL_LINK}}">%s{{TEL}}</a></p>
    </div>
    <div class="ft-hours">
      <h2>OPEN</h2>
      <dl>
        <div><dt>{{t:common-3}}</dt><dd>{{t:common-4}}</dd></div>
        <div><dt>{{t:common-5}}</dt><dd>{{t:common-6}}</dd></div>
        <div><dt>{{t:common-7}}</dt><dd><span data-days="dows">火曜日</span><span data-days="note">（祝日・GW・お盆・年末年始は営業）</span><div class="days-special" data-days="special" hidden><p class="days-ttl">臨時の営業・お休み</p><ul></ul></div></dd></div>
      </dl>
    </div>
    <nav class="ft-nav" aria-label="フッターメニュー">
      <h2>MENU</h2>
      <ul>%s</ul>
    </nav>
  </div>
  <nav class="ft-group wrap" aria-label="系列店">
    <h2>GROUP<span>系列店</span></h2>
    <ul>%s</ul>
    <p>{{t:common-8}}</p>
  </nav>
  <div class="ft-bottom wrap">
    <a href="{{INSTAGRAM}}" target="_blank" rel="noopener">%sInstagram @baguru.hamburg</a>
    <a href="privacy.html">個人情報の扱い</a>
    <small>&copy; %d 炭焼ハンバーグ バグる</small>
  </div>
</footer>''' % (icon('phone'), links, group, icon('ig'), year)


def bottom_bar():
    return '''<nav class="bbar" aria-label="すぐに使うメニュー">
  <a href="{{TEL_LINK}}">%s<span>電話</span></a>
  <a href="{{MAP_LINK}}" target="_blank" rel="noopener">%s<span>地図</span></a>
  <a href="menu.html">%s<span>メニュー</span></a>
  <a href="reserve.html#booking">%s<span>予約</span></a>
  <a class="is-ember" href="takeout.html">%s<span>テイクアウト</span></a>
</nav>''' % (icon('phone'), icon('pin'), icon('menu'), icon('cal'), icon('bag'))


# ---------- 文節で改行する ----------
# 本文の日本語に、文節の切れ目ごとに <wbr> を入れる。CSS の word-break:keep-all と合わせて、
# 文の途中では改行せず、改行するなら文節の切れ目で改行されるようにする（スマホの細い画面でも読みやすく）
_BX = {}
JA_CHARS = re.compile('[぀-ヿ㐀-鿿！-｠]')
NO_WBR = {'script', 'style', 'title', 'textarea', 'option', 'select', 'svg'}


def phrases(s):
    """文を文節に分ける（BudouX の Parser.parse と同じ計算）"""
    if not _BX:
        _BX['m'] = json.loads(BUDOUX.read_text(encoding='utf-8'))
        _BX['base'] = -sum(sum(g.values()) for g in _BX['m'].values()) * 0.5
    m, n = _BX['m'], len(s)
    if not s:
        return []
    chunks = [s[0]]
    g = lambda k, key: m.get(k, {}).get(key, 0)
    for i in range(1, n):
        sc = _BX['base']
        if i > 2:
            sc += g('UW1', s[i - 3]) + g('TW1', s[i - 3:i])
        if i > 1:
            sc += g('UW2', s[i - 2]) + g('BW1', s[i - 2:i]) + g('TW2', s[i - 2:i + 1])
        sc += g('UW3', s[i - 1]) + g('UW4', s[i]) + g('BW2', s[i - 1:i + 1])
        if i + 1 < n:
            sc += g('UW5', s[i + 1]) + g('BW3', s[i:i + 2]) + g('TW3', s[i - 1:i + 2])
        if i + 2 < n:
            sc += g('UW6', s[i + 2]) + g('TW4', s[i:i + 3])
        if sc > 0:
            chunks.append(s[i])
        else:
            chunks[-1] += s[i]
    return chunks


def add_wbr(page):
    """<body> の中の文字（タグの外）だけに <wbr> を入れる。script・style・フォームの選択肢などには入れない"""
    if not BUDOUX.exists():
        print('  ★道具/budoux_ja.json がないので、文節の改行を入れませんでした')
        return page
    head, sep, body = page.partition('<body')
    out, skip = [], []
    for part in re.split(r'(<!--.*?-->|<[^>]+>)', body, flags=re.S):
        if part.startswith('<'):
            t = re.match(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)', part)
            if t and t.group(2).lower() in NO_WBR:
                name = t.group(2).lower()
                if t.group(1):
                    if skip and skip[-1] == name:
                        skip.pop()
                elif not part.endswith('/>'):
                    skip.append(name)
            out.append(part)
        elif part and not skip and JA_CHARS.search(part):
            out.append('<wbr>'.join(html.escape(c, quote=False) for c in phrases(html.unescape(part))))
        else:
            out.append(part)
    return head + sep + ''.join(out)


# ページごとに足す JavaScript（ネット予約のフォームはご予約のページ、お問い合わせ・応募のフォームはお問い合わせと採用のページ）
PAGE_JS = {'app': ['js/app-guide.js'],
           'reserve': ['js/api.js', 'js/reserve.js'],      # js/config.js と js/main.js は、どのページにも入る
           'contact': ['js/api.js', 'js/contact.js'],
           'recruit': ['js/api.js', 'js/contact.js']}


def write_config():
    """js/config.js … 受け口の場所など。作る.py が書き出すので、直接直さない"""
    s = ('/* 作る.py が書き出します。直接直さない（作る.py の RESERVE_API を直す） */\n'
         'window.BAGURU = %s;\n' % json.dumps({'reserveApi': RESERVE_API, 'tel': SHOP['tel'], 'daysUrl': DAYS_URL}, ensure_ascii=False))
    (OUT / 'js' / 'config.js').write_text(s, encoding='utf-8')


def write_kanri():
    """管理画面（管理/画面/ の3つ）を、Google の受け口に貼る1枚（管理/受け口/画面.html）にまとめる。
    管理画面はホームページには置かない（受け口のアドレスを知っている人だけが開ける）。写真はホームページのアドレスから読む"""
    src = HERE / '管理' / '画面'
    s = (src / 'index.html').read_text(encoding='utf-8')
    swaps = [
        ('<link rel="stylesheet" href="kanri.css">', '<style>\n%s</style>' % (src / 'kanri.css').read_text(encoding='utf-8')),
        ('<script src="kanri.js"></script>', '<script>window.KANRI = %s;</script>\n<script>\n%s</script>' % (
            json.dumps({'site': BASE_URL}), (src / 'kanri.js').read_text(encoding='utf-8'))),
        ('href="../index.html"', 'href="%s/"' % BASE_URL),
        ('../img/', BASE_URL + '/img/'),
    ]
    for a, b in swaps:
        if a not in s:
            raise SystemExit('管理/画面/index.html に「%s」がありません' % a)
        s = s.replace(a, b)
    head = '<!-- 作る.py が 管理/画面/ から作ります。直接直さない。Google の受け口のプロジェクトに、HTML のファイル「画面」として貼る -->\n'
    (HERE / '管理' / '受け口' / '画面.html').write_text(head + s, encoding='utf-8')


def build_page(page, ver):
    p = meta(page)
    body = put_texts(put_data((SRC / (page + '.html')).read_text(encoding='utf-8')))
    robots = '<meta name="robots" content="noindex">\n' if SAMPLE else ''
    sample = ('<p class="sample">サンプルページです。価格・営業時間などは公開前にお店で確かめます。</p>\n' if SAMPLE else '')
    preload = '<link rel="preload" as="image" href="img/hero.jpg">\n' if page == 'index' else ''
    out = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
{robots}<link rel="canonical" href="{url}">
<meta property="og:type" content="{ogtype}">
<meta property="og:site_name" content="炭焼ハンバーグ バグる">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/img/og.jpg">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#15110f">
<link rel="icon" href="img/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap">
<link rel="stylesheet" href="css/style.css?v={ver}">
{preload}{ld}
</head>
<body class="page-{page}">
<a class="skip" href="#main">本文へ移動</a>
{sample}{sprite}
{header}
<main id="main">
{hero}{body}
</main>
{footer}
{bbar}
<script src="js/config.js?v={ver}" defer></script>
<script src="js/main.js?v={ver}" defer></script>
{pagejs}</body>
</html>
'''.format(
        pagejs=''.join('<script src="%s?v=%s" defer></script>\n' % (j, ver) for j in PAGE_JS.get(page, [])),
        title=html.escape(p['title']), desc=html.escape(p['desc']), robots=robots, url=url(page),
        ogtype='website' if page == 'index' else 'article', site=BASE_URL, ver=ver, preload=preload,
        ld=jsonld(page, body), page=page, sample=sample, sprite=SPRITE, header=header(page),
        hero='' if page == 'index' else page_hero(page) + '\n', body=body, footer=put_texts(footer()), bbar=bottom_bar())
    out = add_wbr(fix_imgs(fill(out)))
    (OUT / (page + '.html')).write_text(out, encoding='utf-8')


# ---------- Coming soon（COMING_SOON のあいだ、SITE_URL で見せるのはこれだけ） ----------
SOON_TEXT = ['現在ホームページを作成中です。', '公開されたらネット注文、ネット予約ができるようになります。']   # 2026-11-04 ko-dai さんの文のまま

def soon_page():
    img = urllib.parse.urlparse(SITE_URL).path + '/img/'     # /baguru/img/（404.html は、どの深さのアドレスでも出るので、ルートからの道で）
    page = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>炭焼ハンバーグ バグる｜Coming soon</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#15110f">
<link rel="icon" href="{img}icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="{img}apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@600&family=Zen+Kaku+Gothic+New:wght@500;900&display=swap">
<style>
*{{box-sizing:border-box}}
html,body{{height:100%}}
body{{margin:0; display:grid; place-items:center; min-height:100vh; min-height:100svh; padding:32px 20px; background:#15110f; color:#f3ece2;
  font-family:"Zen Kaku Gothic New","Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",Meiryo,sans-serif; word-break:keep-all; line-break:strict; overflow-wrap:anywhere; text-align:center}}
main{{max-width:560px}}
.logo{{width:96px; height:96px; margin:0 auto 14px; border-radius:50%; background:#fff; display:grid; place-items:center}}
.logo img{{width:78px; height:auto; display:block}}
.name{{margin:0; font-size:15px; font-weight:900; letter-spacing:.08em}}
.name small{{display:block; font-size:12px; font-weight:500; letter-spacing:.2em; color:#b8914b; margin-bottom:2px}}
h1{{margin:28px 0 18px; font-family:"Oswald",sans-serif; font-weight:600; font-size:clamp(44px,13vw,76px); line-height:1; letter-spacing:.06em; color:#d9b46a}}
.line{{width:56px; height:3px; margin:0 auto 22px; background:#c7361d; border-radius:2px}}
p.msg{{margin:0; font-size:16px; line-height:1.9; font-weight:500}}
</style>
</head>
<body>
<main>
  <div class="logo"><img src="{img}logo.png" width="78" height="74" alt=""></div>
  <p class="name"><small>炭焼ハンバーグ</small>バグる</p>
  <h1>Coming soon</h1>
  <div class="line" aria-hidden="true"></div>
  <p class="msg">{msg}</p>
</main>
</body>
</html>
""".format(img=img, msg='<br>'.join(html.escape(x) for x in SOON_TEXT))
    return add_wbr(page)


def write_pages():
    """GitHub Pages に出す形（_site/）を作る。COMING_SOON のあいだは、どのページも「Coming soon」で、中身は _site/PREVIEW/ に置く"""
    site = HERE / '_site'
    if site.exists():
        shutil.rmtree(site)
    if not COMING_SOON:
        shutil.copytree(OUT, site)
        return
    shutil.copytree(OUT, site / PREVIEW)
    (site / 'img').mkdir(parents=True)
    for name in ('logo.png', 'icon-192.png', 'apple-touch-icon.png'):      # Coming soon と、管理画面のタブの小さな絵（コード.gs の SITE_URL）
        shutil.copy2(OUT / 'img' / name, site / 'img' / name)
    page = soon_page()
    for name in [p + '.html' for p in PAGES] + ['404.html']:              # どのページのアドレスで来ても Coming soon
        (site / name).write_text(page, encoding='utf-8')
    (site / 'robots.txt').write_text('User-agent: *\nAllow: /\n', encoding='utf-8')
    print('公開する形: %s（Coming soon。中身は %s/）' % (site, PREVIEW))


def main():
    n = make_images()
    write_config()
    write_kanri()
    shutil.copy2(BUDOUX, OUT / 'js' / 'budoux-ja.json')    # 管理画面の「ページで直す」で、直した文の改行のところを作るのに使う（js/edit.js）
    # 版の印は、CSS と JavaScript の中身から作る。中身が変わればブラウザが読み直す
    parts = ['css/style.css', 'js/main.js', 'js/config.js', 'js/api.js', 'js/reserve.js', 'js/contact.js', 'js/edit.js']
    ver = hashlib.sha1(b''.join((OUT / p).read_bytes() for p in parts if (OUT / p).exists())).hexdigest()[:8]
    for page in PAGES:
        if not (SRC / (page + '.html')).exists():
            print('  まだ本文がありません: ページ/%s.html（飛ばしました）' % page)
            continue
        build_page(page, ver)
    today = datetime.date.today().isoformat()
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for page in PAGES:
        sm.append('  <url><loc>%s</loc><lastmod>%s</lastmod></url>' % (url(page), today))
    sm.append('</urlset>')
    (OUT / 'sitemap.xml').write_text('\n'.join(sm) + '\n', encoding='utf-8')
    (OUT / 'robots.txt').write_text('User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n' % SITE_URL, encoding='utf-8')
    if '--pages' in sys.argv:      # GitHub で公開するときだけ（.github/workflows/publish.yml）
        write_pages()
    print('できました: %s（ページ %d・写真を作った %d・版 %s）' % (OUT, len(PAGES), n, ver))


if __name__ == '__main__':
    main()
