"""src/*.html 에 tokens.css 와 아이콘 스프라이트를 넣어 단독으로 열리는 HTML을 만든다.
사용: python3 egg-is-going/build.py
"""
import pathlib

root = pathlib.Path(__file__).resolve().parent
tokens = (root / "tokens.css").read_text(encoding="utf-8")
sprite = (root / "src" / "_sprite.svg").read_text(encoding="utf-8")

for src in sorted((root / "src").glob("*.html")):
    html = src.read_text(encoding="utf-8")
    html = html.replace("/*@TOKENS@*/", tokens).replace("<!--@SPRITE@-->", sprite)
    (root / src.name).write_text(html, encoding="utf-8")
    print("built", src.name)
