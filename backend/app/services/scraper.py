"""URL scraping and metadata extraction service."""

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

# Patterns for source_type detection
_SOCIAL_DOMAINS = {
    "twitter.com", "x.com", "instagram.com", "facebook.com", "fb.com",
    "reddit.com", "tiktok.com", "linkedin.com", "pinterest.com",
    "snapchat.com", "tumblr.com", "mastodon.social", "threads.net",
}

_NEWS_DOMAINS = {
    "bbc.com", "bbc.co.uk", "cnn.com", "nytimes.com", "reuters.com",
    "apnews.com", "theguardian.com", "washingtonpost.com", "bloomberg.com",
    "forbes.com", "techcrunch.com", "theverge.com", "wired.com",
    "ars technica.com", "arstechnica.com", "engadget.com", "zdnet.com",
    "medium.com", "substack.com", "huffpost.com", "nbcnews.com",
    "abcnews.go.com", "foxnews.com", "wsj.com", "ft.com",
}

_ECOMMERCE_DOMAINS = {
    "amazon.com", "amazon.co.uk", "amazon.co.jp", "amazon.de", "amazon.fr",
    "ebay.com", "etsy.com", "shopify.com", "walmart.com", "target.com",
    "bestbuy.com", "newegg.com", "aliexpress.com", "taobao.com",
    "rakuten.com", "zappos.com", "wayfair.com", "chewy.com",
}

_ECOMMERCE_URL_PATTERNS = re.compile(
    r"/(product|products|item|items|shop|store|dp|gp/product|buy|cart|checkout)/",
    re.IGNORECASE,
)

_NEWS_URL_PATTERNS = re.compile(
    r"/(news|article|articles|story|stories|post|posts|blog|blogs)/",
    re.IGNORECASE,
)

# Domains known to require JS rendering (SPA)
_SPA_DOMAINS = {
    "brand.naver.com",
    "smartstore.naver.com",
    "shopping.naver.com",
}

_PLAYWRIGHT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def _is_spa_url(url: str) -> bool:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname in _SPA_DOMAINS


async def _fetch_html_with_playwright(url: str) -> str | None:
    """Render *url* with a headless Chromium browser and return the page HTML."""
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=_PLAYWRIGHT_UA,
                locale="ko-KR",
                extra_http_headers={"Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"},
            )
            page = await context.new_page()
            await page.goto(url, wait_until="networkidle", timeout=30_000)
            html = await page.content()
            await browser.close()
            return html
    except Exception:
        return None


@dataclass
class ImageMeta:
    url: str
    alt_text: str | None = None
    width: int | None = None
    height: int | None = None


@dataclass
class ScrapedMetadata:
    title: str | None = None
    description: str | None = None
    source_type: str = "other"
    images: list[ImageMeta] = field(default_factory=list)


def _detect_source_type(url: str, soup: BeautifulSoup) -> str:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    # Strip leading www.
    if hostname.startswith("www."):
        hostname = hostname[4:]

    if hostname in _SOCIAL_DOMAINS:
        return "social"

    if hostname in _ECOMMERCE_DOMAINS:
        return "ecommerce"

    if hostname in _NEWS_DOMAINS:
        return "news"

    # URL pattern hints
    path = parsed.path
    if _ECOMMERCE_URL_PATTERNS.search(path):
        return "ecommerce"

    if _NEWS_URL_PATTERNS.search(path):
        return "news"

    # Check Open Graph type meta tag
    og_type = soup.find("meta", property="og:type")
    if og_type:
        og_value = (og_type.get("content") or "").lower()
        if "product" in og_value:
            return "ecommerce"
        if "article" in og_value or "news" in og_value:
            return "news"

    return "other"


def _extract_images(url: str, soup: BeautifulSoup) -> list[ImageMeta]:
    seen: set[str] = set()
    images: list[ImageMeta] = []

    def _add(img_url: str, alt: str | None = None, width: int | None = None, height: int | None = None) -> None:
        if not img_url:
            return
        # Make absolute
        abs_url = urljoin(url, img_url)
        # Skip data URIs and very small tracker pixels
        if abs_url.startswith("data:"):
            return
        if abs_url in seen:
            return
        seen.add(abs_url)
        images.append(ImageMeta(url=abs_url, alt_text=alt or None, width=width, height=height))

    # High-priority: Open Graph / Twitter Card images
    for meta_name in ["og:image", "twitter:image", "twitter:image:src"]:
        tag = soup.find("meta", property=meta_name) or soup.find("meta", attrs={"name": meta_name})
        if tag:
            _add(tag.get("content", ""))

    # All <img> tags
    for img in soup.find_all("img", src=True):
        w = h = None
        try:
            w = int(img.get("width", ""))
        except (ValueError, TypeError):
            pass
        try:
            h = int(img.get("height", ""))
        except (ValueError, TypeError):
            pass
        # Skip obvious tracking pixels (1x1)
        if w == 1 or h == 1:
            continue
        _add(img["src"], alt=img.get("alt", ""), width=w, height=h)

    return images


def _parse_html(url: str, html: str) -> ScrapedMetadata:
    """Parse raw HTML and return ScrapedMetadata."""
    soup = BeautifulSoup(html, "html.parser")

    title: str | None = None
    og_title = soup.find("meta", property="og:title")
    if og_title:
        title = og_title.get("content", "").strip() or None
    if not title and soup.title:
        title = soup.title.get_text(strip=True) or None

    description: str | None = None
    og_desc = soup.find("meta", property="og:description")
    if og_desc:
        description = og_desc.get("content", "").strip() or None
    if not description:
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            description = meta_desc.get("content", "").strip() or None

    source_type = _detect_source_type(url, soup)
    images = _extract_images(url, soup)

    return ScrapedMetadata(
        title=title,
        description=description,
        source_type=source_type,
        images=images,
    )


async def scrape_url(url: str) -> ScrapedMetadata:
    """Fetch *url*, extract metadata, and return a ScrapedMetadata object.

    For known SPA domains (e.g. Naver Brand Store) or when static scraping
    yields no images, falls back to Playwright for JS-rendered HTML.
    """
    use_playwright_first = _is_spa_url(url)

    if use_playwright_first:
        html = await _fetch_html_with_playwright(url)
        if html:
            return _parse_html(url, html)

    # Static HTTP fetch
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    }

    html: str | None = None
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            html = response.text
    except httpx.HTTPError:
        pass

    if html is None:
        return ScrapedMetadata(source_type="other")

    meta = _parse_html(url, html)

    # Playwright fallback: static fetch succeeded but yielded no images
    if not meta.images:
        pw_html = await _fetch_html_with_playwright(url)
        if pw_html:
            meta = _parse_html(url, pw_html)

    return meta
