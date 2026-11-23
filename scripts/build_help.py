"""help/*.md からヘルプページ（public/help/*.html）を作る。

使い方:  pip install markdown  →  python3 scripts/build_help.py
生成した public/help/*.html はリポジトリに含めて公開する（ログイン不要で読める）。
画像は public/help/img/ に直接置く。
"""
import html
import pathlib
import re

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'help'
OUT = ROOT / 'public' / 'help'

PAGES = {
    'quick': 'クイックガイド',
    'manual': '利用マニュアル',
}

TEMPLATE = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1f6f43">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⛳</text></svg>">
<title>{title} | ゴルフコンペ</title>
<style>
:root {{ --green:#1f6f43; --green-soft:#e7f3ec; --bg:#f4f6f4; --text:#1c2420; --muted:#6b766f; --line:#dfe5e1; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--text); line-height:1.75; -webkit-text-size-adjust:100%;
  font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif; }}
.bar {{ position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:8px;
  padding:calc(8px + env(safe-area-inset-top)) 12px 8px; background:var(--green); color:#fff; }}
.bar .logo {{ font-size:1.4rem; margin-right:auto; border:0; padding:0 4px; }}
.bar a {{ color:#fff; text-decoration:none; font-weight:600; font-size:.88rem; padding:6px 12px;
  border-radius:999px; border:1px solid rgba(255,255,255,.5); white-space:nowrap; }}
.bar a.on {{ background:#fff; color:var(--green); border-color:#fff; }}
main {{ max-width:720px; margin:0 auto; padding:16px 16px 48px; }}
h1 {{ font-size:1.45rem; line-height:1.4; margin:8px 0 12px; }}
h1:not(:first-child) {{ margin-top:40px; padding-top:16px; border-top:3px solid var(--green); }}
h2 {{ font-size:1.15rem; margin:32px 0 8px; padding-left:10px; border-left:5px solid var(--green); }}
h3 {{ font-size:1.02rem; margin:24px 0 6px; }}
a {{ color:var(--green); }}
img {{ width:100%; height:auto; border-radius:12px; margin:12px 0 0; display:block; }}
img + em, p > em:only-child {{ display:block; color:var(--muted); font-size:.85rem; font-style:normal; margin-top:6px; }}
table {{ width:100%; border-collapse:collapse; margin:12px 0; font-size:.9rem; background:#fff; border-radius:10px; overflow:hidden; }}
th, td {{ padding:8px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }}
th {{ background:var(--green-soft); }}
.table-wrap {{ overflow-x:auto; }}
ul, ol {{ padding-left:1.4em; }}
li {{ margin:4px 0; }}
.toc {{ background:#fff; border-radius:12px; padding:12px 16px; margin:16px 0; }}
.toc ul {{ margin:0; padding-left:1.1em; }}
.toc > ul > li > a {{ font-weight:700; }}
.back {{ display:block; text-align:center; margin:40px 0 0; padding:14px; background:var(--green); color:#fff;
  border-radius:12px; font-weight:700; text-decoration:none; }}
</style>
</head>
<body>
<nav class="bar">
  <a class="logo" href="../">⛳</a>
  {nav}
</nav>
<main>
{body}
<a class="back" href="../">アプリを開く</a>
</main>
</body>
</html>
"""


def toc_html(tokens) -> str:
    """目次を作る。先頭の見出し（ページのタイトル）自体は載せず、その下の節から並べる"""
    def items(ts):
        return ''.join(
            f'<li><a href="#{t["id"]}">{t["name"]}</a>' + (f'<ul>{items(t["children"])}</ul>' if t['children'] else '') + '</li>'
            for t in ts
        )
    if not tokens:
        return ''
    first, rest = tokens[0], tokens[1:]
    return '<ul>' + items(first['children']) + items(rest) + '</ul>'


def build(name: str, title: str) -> None:
    md = markdown.Markdown(extensions=['tables', 'toc'], extension_configs={'toc': {'toc_depth': '1-2'}})
    body = md.convert((SRC / f'{name}.md').read_text(encoding='utf-8'))
    # 横に長い表はスクロールできるように包む
    body = re.sub(r'<table>', '<div class="table-wrap"><table>', body).replace('</table>', '</table></div>')
    # 長いマニュアルは最初の見出しの直後に目次を入れる
    if name == 'manual':
        body = body.replace('</h1>', '</h1>\n<div class="toc"><strong>目次</strong>' + toc_html(md.toc_tokens) + '</div>', 1)
    nav = ' '.join(
        f'<a href="{n}.html"{" class=on" if n == name else ""}>{html.escape(t)}</a>' for n, t in PAGES.items()
    )
    (OUT / f'{name}.html').write_text(TEMPLATE.format(title=html.escape(title), nav=nav, body=body), encoding='utf-8')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for n, t in PAGES.items():
        build(n, t)
    print('built', sorted(p.name for p in OUT.iterdir()))
