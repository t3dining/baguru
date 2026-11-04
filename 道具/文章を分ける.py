#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文章を分ける（ページの文を データ/texts.json に移して、管理画面から直せるようにする）

    python3 道具/文章を分ける.py          （Claude がページを直したあとに動かす）
    python3 道具/文章を分ける.py --dry    （何が変わるかを見るだけ。ファイルは変えない）

  ・ページ/*.html の本文にある日本語の文を {{t:ページ-番号}} の印に置きかえ、文は データ/texts.json に入れる
  ・すでに印になっている文は、そのまま。texts.json の並び（ページ → 見出しごとのまとまり → 文）を、ページの印の順に並べ直す
    ★ページから消えた印の文は、texts.json からも消える（消したものを書き出す）
  ・移さないもの：ボタンの字（class="btn"・<button>）・フォームの選ぶところ・「差し替え・確認」の枠（class="todo"）・
    JavaScript が書きかえるところ（data-days・data-today・SKIP_IDS）・script・style・svg・英字だけの飾りの字・「必須」「任意」
  ・文の中の <br> は改行、<b>・<strong> は **太字** にする（作る.py の rich が元にもどす）。{{TEL}} などはそのまま残す
  ・ページの題・検索結果の説明・大きな見出しは、作る.py の PAGES に title・desc・h1・sub があれば texts.json に移す
    （新しいページを足すときだけ使う。移ったら PAGES からは消す）
  ・下の欄（作る.py の footer）の {{t:common-番号}} は、texts.json に手で入れたもの。この道具は並びだけ守る
"""

import html
import importlib.util
import json
import re
import sys
from pathlib import Path

HP = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location('tsukuru', HP / '作る.py')
T = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(T)

FILE = T.DATA / 'texts.json'
# ページの題など（キーの終わり, 文の種類）。種類はページの中のタグ（h1 など）と重ならない名前にする（改行できない文の決まりに使う）
HEAD = [('title', 'title'), ('desc', 'desc'), ('h1', 'hero'), ('sub', 'herosub')]
HEAD_PART = 'ページの題と、一番上'
COMMON = ('common', '全ページ共通（下の欄）', '下の欄')

VOID = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'wbr', 'area', 'col', 'embed', 'param', 'track'}
SKIP_TAGS = {'script', 'style', 'svg', 'select', 'option', 'textarea', 'button', 'noscript', 'iframe', 'template', 'title'}
SKIP_CLASSES = {'btn', 'todo', 'hp'}
SKIP_ATTRS = ('data-days', 'data-today', 'data-off')
SKIP_IDS = {'r-people', 'r-days', 'r-times'}         # ネット予約で、JavaScript が中身を入れかえるところ
UI_WORDS = {'必須', '任意'}
JA = re.compile('[぀-ヿ㐀-鿿！-｠]')
TOKEN = re.compile(r'(<!--.*?-->|<[^>]+>|\{\{[^{}\n]+\}\})', re.S)
MARK = re.compile(r'^\{\{t:([a-z0-9-]+)\}\}$')
BOLD = {'<b>', '</b>', '<strong>', '</strong>'}


def tag_of(tok):
    m = re.match(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)', tok)
    return (m.group(2).lower(), bool(m.group(1))) if m else (None, False)


def skips(tok):
    name, _ = tag_of(tok)
    if name in SKIP_TAGS:
        return True
    cls = re.search(r'\bclass="([^"]*)"', tok)
    if cls and SKIP_CLASSES & set(cls.group(1).split()):
        return True
    idm = re.search(r'\bid="([^"]*)"', tok)
    if idm and idm.group(1) in SKIP_IDS:
        return True
    return any(re.search(r'\s%s(=|\s|>)' % a, tok) for a in SKIP_ATTRS)


def runnable(tok, skipping):
    """文の一部として印にまとめてよいもの（文字・<br>・<b>・{{TEL}} など）"""
    if skipping or tok.startswith('<!--'):
        return False
    if tok.startswith('{{'):
        return bool(re.match(r'^\{\{([A-Z_]+)\}\}$', tok)) and tok[2:-2] in T.VARS
    if tok.startswith('<'):
        return bool(re.match(r'^<br\s*/?>$', tok)) or tok in BOLD
    return True


def balanced(toks):
    n = {'b': 0, 'strong': 0}
    for t in toks:
        if t in BOLD:
            name, close = tag_of(t)
            n[name] += -1 if close else 1
            if n[name] < 0:
                return False
    return not any(n.values())


def to_text(core):
    """印にする部分の HTML を、管理画面で直す文にする"""
    out = []
    for t in TOKEN.split(core):
        if not t:
            continue
        if re.match(r'^<br\s*/?>$', t):
            out.append('\n')
        elif t in BOLD:
            out.append('**')
        elif t.startswith('{{'):
            out.append(t)
        else:
            out.append(html.unescape(re.sub(r'\s*\n\s*', ' ', t)))
    return re.sub(r'[ \t]*\n[ \t]*', '\n', ''.join(out))


def worth(text):
    if text in UI_WORDS:
        return False
    plain = re.sub(r'\{\{[A-Z_]+\}\}', '', text).replace('**', '').strip()
    if JA.search(plain):
        return True
    # 値段・時間など数字の字（1,150・11:00 など）は移す。「01 CHARCOAL」のような英字の飾りと、1けたの番号は移さない
    return bool(re.search(r'\d', plain)) and not re.search(r'[A-Za-z]{2,}', plain) and len(plain) >= 3


def scan(src):
    """ページを読み、[('raw', 文字) | ('run', 文, 囲みのタグ, h2 の中か) | ('mark', キー, 囲みのタグ, h2 の中か)] にする"""
    toks = [t for t in TOKEN.split(src) if t]
    stack, segs, group = [], [], []

    def ctx():
        """（いちばん内側のタグ, 入っている h2 の印。h2 の外なら ''）"""
        names = [n for n, _ in stack if n not in ('b', 'strong')]
        h2 = [t for n, t in stack if n == 'h2']
        return (names[-1] if names else ''), (h2[-1] if h2 else '')

    def flush():
        if not group:
            return
        if balanced(group):
            pieces = [group[:]]
        else:                    # 太字が文の外にまたがるときは、太字のタグを文に入れない
            pieces, cur = [], []
            for t in group:
                if t in BOLD:
                    pieces += [cur, t]
                    cur = []
                else:
                    cur.append(t)
            pieces.append(cur)
        group.clear()
        for g in pieces:
            if isinstance(g, str):
                segs.append(('raw', g))
                continue
            if not g:
                continue
            raw = ''.join(g)
            m = re.match(r'^((?:\s|<br\s*/?>)*)(.*?)((?:\s|<br\s*/?>)*)$', raw, re.S)
            text = to_text(m.group(2))
            if m.group(2) and worth(text):
                if m.group(1):
                    segs.append(('raw', m.group(1)))
                segs.append(('run', text) + ctx())
                if m.group(3):
                    segs.append(('raw', m.group(3)))
            else:
                segs.append(('raw', raw))

    skip_depth = None
    for tok in toks:
        skipping = skip_depth is not None
        if runnable(tok, skipping):
            group.append(tok)
            if tok in BOLD:
                name, close = tag_of(tok)
                if close:
                    while stack and stack.pop()[0] != name:
                        pass
                else:
                    stack.append((name, tok))
            continue
        flush()
        mk = MARK.match(tok)
        if mk:
            segs.append(('mark', mk.group(1)) + ctx())
            continue
        segs.append(('raw', tok))
        name, close = tag_of(tok)
        if not name or tok.startswith('<!'):
            continue
        if close:
            while stack:
                n, _ = stack.pop()
                if skip_depth is not None and len(stack) < skip_depth:
                    skip_depth = None
                if n == name:
                    break
        elif name not in VOID and not tok.endswith('/>'):
            stack.append((name, '%s#%d' % (tok, len(segs))))     # h2 ごとにちがう印にする（同じ見出しの続きかを見分ける）
            if skip_depth is None and skips(tok):
                skip_depth = len(stack)
    flush()
    return [s for s in segs if s]


def main():
    dry = '--dry' in sys.argv
    old = json.loads(FILE.read_text(encoding='utf-8')) if FILE.exists() else {'pages': []}
    known = {}
    for p in old['pages']:
        for part in p['parts']:
            for x in part['texts']:
                known[x['key']] = x
    order = [k for k, _, _ in T.NAV] + [k for k in T.PAGES if k not in [n for n, _, _ in T.NAV]]
    names = {k: ja for k, ja, _ in T.NAV}
    names['privacy'] = '個人情報の扱い'
    names['app'] = '公式アプリ'
    pages, used, new_count, writes = [], set(), 0, {}

    for page in order:
        f = T.SRC / (page + '.html')
        if not f.exists():
            continue
        src = f.read_text(encoding='utf-8')
        segs = scan(src)
        nums = [int(k.rsplit('-', 1)[1]) for k in known if k.startswith(page + '-') and k.rsplit('-', 1)[1].isdigit()]
        nums += [int(s[1].rsplit('-', 1)[1]) for s in segs if s[0] == 'mark' and s[1].rsplit('-', 1)[1].isdigit()]
        n = max(nums or [0])
        head = []
        for fld, tag in HEAD:
            if page == 'index' and fld in ('h1', 'sub'):
                continue
            key = '%s-%s' % (page, fld)
            if key not in known:
                v = T.PAGES[page].get(fld)
                if v is None:
                    raise SystemExit('作る.py の PAGES["%s"] に %s がありません（texts.json にもありません）' % (page, fld))
                known[key] = {'key': key, 'tag': tag, 'text': v}
                new_count += 1
            head.append({'key': key, 'tag': tag, 'text': known[key]['text']})
            used.add(key)
        parts = [{'name': HEAD_PART, 'texts': head}]
        body, cur, prev_h2 = [], None, ''
        for s in segs:
            if s[0] == 'raw':
                body.append(s[1])
                continue
            if s[0] == 'run':
                n += 1
                key = '%s-%d' % (page, n)
                item = {'key': key, 'tag': s[2] or 'p', 'text': s[1]}
                new_count += 1
                if dry:
                    print('  %s ‹%s› %s' % (key, item['tag'], s[1].replace('\n', '⏎')[:70]))
            else:
                key = s[1]
                if key not in known:
                    raise SystemExit('ページ/%s.html の {{t:%s}} が texts.json にありません' % (page, key))
                item = {'key': key, 'tag': known[key]['tag'], 'text': known[key]['text']}
            if key in used:
                raise SystemExit('{{t:%s}} が2回あります（1つの文は1か所だけ）' % key)
            used.add(key)
            body.append('{{t:%s}}' % key)
            label = item['text'].replace('\n', '').replace('**', '')
            if s[3] and s[3] == prev_h2:    # 同じ見出しの続き
                cur['name'] += label
            elif s[3] or cur is None:       # h2 の文から、新しいまとまり
                cur = {'name': label if s[3] else 'ページの初め', 'texts': []}
                parts.append(cur)
            prev_h2 = s[3]
            cur['texts'].append(item)
        pages.append({'id': page, 'name': names.get(page, page), 'parts': [p for p in parts if p['texts']]})
        new_src = ''.join(body)
        if new_src != src:
            writes[f] = new_src

    # 下の欄（作る.py の footer）。印の順に並べるだけ
    common = []
    for key in re.findall(r'\{\{t:(common-\d+)\}\}', (HP / '作る.py').read_text(encoding='utf-8')):
        if key not in known:
            raise SystemExit('作る.py の {{t:%s}} が texts.json にありません（手で入れる）' % key)
        common.append(known[key])
        used.add(key)
    if common:
        pages.append({'id': COMMON[0], 'name': COMMON[1], 'parts': [{'name': COMMON[2], 'texts': common}]})

    gone = [k for k in known if k not in used]
    data = {'pages': pages}
    total = sum(len(pt['texts']) for p in pages for pt in p['parts'])
    print('文 %d（新しく移した %d・消えた %d）' % (total, new_count, len(gone)))
    for k in gone:
        print('  消えた: %s %s' % (k, known[k]['text'].replace('\n', '⏎')[:60]))
    if dry:
        print('（--dry なので、ファイルは変えていません）')
        return
    for f, s in writes.items():
        f.write_text(s, encoding='utf-8')
    FILE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('書きました: %s（ページ %d 枚を直しました）' % (FILE.relative_to(HP), len(writes)))


if __name__ == '__main__':
    main()
