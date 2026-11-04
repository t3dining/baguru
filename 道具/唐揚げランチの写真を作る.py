#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
唐揚げランチの写真を作る（2026-11-04 ko-dai さんの指示：「唐揚げランチプレートの写真が寄りすぎているので、引きの写真にして、プレート全体が分かるように」）

    python3 道具/唐揚げランチの写真を作る.py      （この Mac で。バグるインスタ写真/ が要る）

  ・唐揚げランチプレートの写真は、Instagram のストーリーの画像（バグるインスタ写真/過去データ/6.jpg）にしか無い。
    右上に「ランチ②」の札、左上にバグるのロゴが重ねてあるので、そのままでは寄った写真しか切り取れなかった
  ・札の下を描き足してから、皿全体が入るように切り取る（ロゴは切り取る範囲の外）
    - テーブル … 札の右の木目を、左右に折り返して並べる
    - 皿の縁 … 見えている縁から皿の楕円を割り出し（PLATE）、縁の色の並びを、札の下の右の縁（y=560 のあたり）から写す
    - 唐揚げ … 札のすぐ下の唐揚げを、上下に折り返して写す（左の端は、札の左の唐揚げとなじませる）
  ・できあがりは 公開用/img/lunch-karaage.jpg（864×648）。作る.py の IMAGES には入れない（入れると、札の入った形で作り直してしまう）
  ★numpy などは使わない（この Mac の Python に無い）。PIL だけ
"""

from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw

HP = Path(__file__).resolve().parent.parent
SRC = HP.parent / 'バグるインスタ写真' / '過去データ' / '6.jpg'
OUT = HP / '公開用' / 'img' / 'lunch-karaage.jpg'

LABEL = (811, 169, 930, 520)            # 「ランチ②」の札（左・上・右・下。この中を描き足す）
PAD = 3                                 # 札のまわりも少し描き足す（札の縁のにじみを消す）
CX, CY, A, B = 505.8, 591.6, 448.0, 332.2   # 皿の外の縁の楕円（縁の点を最小二乗で合わせた）
RIM_IN, RIM_OUT = 0.942, 1.006          # 縁の上の面（明るい木）の内側と外側（楕円の大きさの割合）
WOOD = (935, 971)                       # 札の右の木目（テーブル）の列
CROP = (108, 292, 972, 940)             # 切り取る範囲（864×648＝4:3。上はロゴの下から）


def t(x, y):
    return (((x - CX) / A) ** 2 + ((y - CY) / B) ** 2) ** 0.5


def main():
    im = Image.open(SRC).convert('RGB')
    src = im.load()
    out = im.copy()
    px = out.load()
    l, tp, r, bt = LABEL[0] - PAD, LABEL[1] - PAD, LABEL[2] + PAD, LABEL[3] + PAD
    w0, w1 = WOOD
    span = w1 - w0 + 1

    # 縁の色の並び（楕円の割合 → 色）。札の下の右の縁、y=556〜564 の3行の平均
    profile = []
    for i in range(80):
        tt = RIM_IN - 0.01 + (RIM_OUT - RIM_IN + 0.02) * i / 79
        k = tt * tt - ((560 - CY) / B) ** 2
        x = CX + A * k ** 0.5 if k > 0 else CX
        xs = min(max(int(round(x)), 0), im.width - 1)
        cs = [src[xs, y] for y in (556, 560, 564)]
        profile.append((tt, tuple(sum(c[j] for c in cs) // 3 for j in range(3))))

    def rim_color(tt):
        best = min(profile, key=lambda p: abs(p[0] - tt))
        return best[1]

    for y in range(tp, bt + 1):
        for x in range(l, r + 1):
            tt = t(x, y)
            if tt >= RIM_OUT:                           # テーブル：右の木目を折り返して並べる
                k = (r - x) % (2 * span)
                xs = w0 + (k if k < span else 2 * span - 1 - k)
                ys = y
                while t(xs, ys) < RIM_OUT + 0.03 and ys > LABEL[1]:
                    ys -= span
                px[x, y] = src[xs, ys]
            elif tt >= RIM_IN:                          # 皿の縁
                px[x, y] = rim_color(tt)
            else:                                       # 皿の中：札の下の唐揚げを上下に折り返す
                ys = 2 * bt - y
                c1 = src[x, min(ys, im.height - 1)]
                wl = max(0.0, min(1.0, (l + 14 - x) / 14))  # 左の端は、札の左の唐揚げ（左右に折り返す）となじませる
                if wl > 0:
                    c2 = src[2 * l - x, y]
                    c1 = tuple(int(c1[j] * (1 - wl) + c2[j] * wl) for j in range(3))
                px[x, y] = c1

    # 描き足したところを、写真のやわらかさに合わせて少しぼかし、まわりと境目なくなじませる
    soft = out.filter(ImageFilter.GaussianBlur(0.8))
    mask = Image.new('L', im.size, 0)
    d = ImageDraw.Draw(mask)
    for i in range(4):                                  # 外へ4段で薄くなる
        d.rectangle((l - i, tp - i, r + i, bt + i), outline=int(255 * (1 - i / 4)))
    d.rectangle((l, tp, r, bt), fill=255)
    out = Image.composite(soft, im, mask)

    pic = out.crop(CROP)
    pic.save(OUT, 'JPEG', quality=84, optimize=True, progressive=True)
    print('作りました: %s（%d×%d）' % (OUT.relative_to(HP), pic.width, pic.height))


if __name__ == '__main__':
    main()
