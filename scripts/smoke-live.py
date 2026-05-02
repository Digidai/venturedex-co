#!/usr/bin/env python3

from __future__ import annotations

import argparse
import http.client
import html
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import quote, urljoin


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.text_parts: list[str] = []
        self.startup_card_links = 0
        self.news_company_cells = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name: value or "" for name, value in attrs}
        classes = set(attr.get("class", "").split())

        if tag == "a" and "card-link" in classes and attr.get("href", "").startswith("/startups/"):
            self.startup_card_links += 1
        if tag == "td" and "cell-company" in classes:
            self.news_company_cells += 1

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if text:
            self.text_parts.append(text)

    @property
    def text(self) -> str:
        return " ".join(self.text_parts)


@dataclass
class Page:
    url: str
    html: str
    parser: PageParser

    @property
    def text(self) -> str:
        return self.parser.text


def fetch(url: str, retries: int = 3) -> str:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "VentureDexSmoke/1.0",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            with urllib.request.urlopen(req, timeout=20) as response:
                return response.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, http.client.IncompleteRead) as error:
            last_error = error
            if attempt < retries:
                time.sleep(attempt)
                continue
            raise RuntimeError(f"failed to fetch {url}: {error}") from error

    raise RuntimeError(f"failed to fetch {url}: {last_error}")


def load_page(base_url: str, path: str) -> Page:
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    content = fetch(url)
    parser = PageParser()
    parser.feed(content)
    return Page(url=url, html=content, parser=parser)


def fail(errors: list[str], message: str) -> None:
    errors.append(f"ERROR: {message}")


def assert_text_count_matches_cards(page: Page, errors: list[str]) -> None:
    for match in re.finditer(r"A thoughtful gallery of\s+(\d+)", page.text):
        expected = int(match.group(1))
        if page.parser.startup_card_links != expected:
            fail(
                errors,
                f"{page.url} says gallery count {expected} but renders "
                f"{page.parser.startup_card_links} startup cards",
            )

    for match in re.finditer(r"Showing\s+(\d+)\s+of\s+(\d+)", page.text):
        expected = int(match.group(1))
        total = int(match.group(2))
        if expected > total:
            fail(errors, f"{page.url} says Showing {expected} of {total}")
        if page.parser.startup_card_links != expected:
            fail(
                errors,
                f"{page.url} says filtered count {expected} but renders "
                f"{page.parser.startup_card_links} startup cards",
            )

    for match in re.finditer(r"Showing first\s+(\d+)\s+of\s+(\d+)", page.text):
        expected = int(match.group(1))
        total = int(match.group(2))
        if expected > total:
            fail(errors, f"{page.url} says Showing first {expected} of {total}")
        if page.parser.startup_card_links != expected:
            fail(
                errors,
                f"{page.url} says first-page count {expected} but renders "
                f"{page.parser.startup_card_links} startup cards",
            )

    for match in re.finditer(r"\b(\d+)\s+results?\b", page.text):
        expected = int(match.group(1))
        if page.parser.startup_card_links != expected:
            fail(
                errors,
                f"{page.url} says {expected} search results but renders "
                f"{page.parser.startup_card_links} startup cards",
            )


def assert_home(base_url: str, expected_startups: int, errors: list[str]) -> None:
    paths = [
        "/",
        "/?sort=newest",
        "/?sort=name-az",
        f"/?type={quote('DevTools')}",
        f"/?type={quote('AI / ML')}",
        f"/?stage={quote('Series B')}",
        f"/?region={quote('Europe')}",
    ]

    for path in paths:
        page = load_page(base_url, path)
        if "VentureDex" not in page.text:
            fail(errors, f"{page.url} does not look like a VentureDex page")
        assert_text_count_matches_cards(page, errors)

    home = load_page(base_url, "/")
    if expected_startups > 0 and "Coming soon" in home.text:
        fail(errors, f"{home.url} shows Coming soon while remote D1 has {expected_startups} startups")
    if expected_startups > 0 and home.parser.startup_card_links != expected_startups:
        fail(
            errors,
            f"{home.url} renders {home.parser.startup_card_links} startup cards, "
            f"expected {expected_startups}",
        )


def assert_news(base_url: str, expected_startups: int, errors: list[str]) -> None:
    page = load_page(base_url, "/news")
    if expected_startups > 0 and page.parser.news_company_cells != expected_startups:
        fail(
            errors,
            f"{page.url} renders {page.parser.news_company_cells} news rows, "
            f"expected {expected_startups}",
        )


def collection_links(page: Page) -> list[tuple[str, int]]:
    links: list[tuple[str, int]] = []
    pattern = re.compile(
        r'<a\s+href="(/collections/[^"]+)"\s+class="collection-card"[^>]*>'
        r"(?P<body>.*?)</a>",
        re.DOTALL,
    )
    for match in pattern.finditer(page.html):
        body = html.unescape(re.sub(r"<[^>]+>", " ", match.group("body")))
        count_match = re.search(r"\b(\d+)\s+startups?\b", body)
        if count_match:
            links.append((match.group(1), int(count_match.group(1))))
    return links


def assert_collections(base_url: str, errors: list[str]) -> None:
    index = load_page(base_url, "/collections")
    links = collection_links(index)
    if not links:
        fail(errors, f"{index.url} has no parseable collection counts")
        return

    for href, expected in links:
        detail = load_page(base_url, href)
        actual = detail.parser.startup_card_links
        if actual != expected:
            fail(errors, f"{detail.url} renders {actual} cards but collection index says {expected}")


def assert_search(base_url: str, errors: list[str]) -> None:
    for query in ["ai", "devtools", "   "]:
        page = load_page(base_url, f"/search?q={quote(query)}")
        assert_text_count_matches_cards(page, errors)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-check live VentureDex pages.")
    parser.add_argument("url", help="Base deployment URL")
    parser.add_argument("--expected-startups", type=int, required=True)
    args = parser.parse_args()

    errors: list[str] = []
    base_url = args.url.rstrip("/")

    assert_home(base_url, args.expected_startups, errors)
    assert_news(base_url, args.expected_startups, errors)
    assert_collections(base_url, errors)
    assert_search(base_url, errors)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    print(f"Live smoke passed for {base_url} (published startups: {args.expected_startups}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
