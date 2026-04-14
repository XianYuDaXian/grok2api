"""Verify imagine waterfall concurrency options are available from 1 to 10.

Usage:
  python scripts/test_imagine_concurrency_options.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "app/static/public/pages/imagine.html"
ZH_PATH = ROOT / "app/static/i18n/locales/zh.json"
EN_PATH = ROOT / "app/static/i18n/locales/en.json"


def parse_option_values(html: str) -> list[int]:
    select_match = re.search(
        r'<select\s+id="concurrentSelect"[^>]*>(.*?)</select>',
        html,
        re.S,
    )
    if not select_match:
        raise AssertionError("concurrentSelect not found in imagine.html")
    option_values = re.findall(r'<option\s+value="(\d+)"', select_match.group(1))
    return [int(value) for value in option_values]


def main() -> int:
    html = HTML_PATH.read_text(encoding="utf-8")
    zh = json.loads(ZH_PATH.read_text(encoding="utf-8"))
    en = json.loads(EN_PATH.read_text(encoding="utf-8"))

    expected = list(range(1, 11))
    actual = parse_option_values(html)
    if actual != expected:
        raise AssertionError(f"expected concurrency options {expected}, got {actual}")

    zh_imagine = (zh.get("imagine") or {})
    en_imagine = (en.get("imagine") or {})
    for value in expected:
        zh_key = f"concurrentTask{value}"
        en_key = f"concurrentTask{value}"
        if zh_key not in zh_imagine:
            raise AssertionError(f"missing zh imagine key: {zh_key}")
        if en_key not in en_imagine:
            raise AssertionError(f"missing en imagine key: {en_key}")

    print("Imagine concurrency options validated: 1-10")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
