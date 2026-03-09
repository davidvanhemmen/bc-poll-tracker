"""
BC Provincial Poll Scraper
===========================
Monitors polling firm websites for new BC provincial polls,
extracts numbers using Claude AI, and writes to polls.json.

Firms covered:
  - 338Canada           https://338canada.com/bc/polls.htm
  - Pallas Data         https://pallas-data.ca/category/polls/
  - Liaison Strategies  https://press.liaisonstrategies.ca/
  - Research Co.        https://researchco.ca/category/research/
  - Mainstreet          https://mainstreetresearch.ca/polling
  - Cardinal Research   https://cardinalresearch.ca/
  - Angus Reid          https://angusreid.org/topics/bc-politics/
  - Ipsos               https://www.ipsos.com/en-ca/news-polls
  - Léger               https://leger360.com/polls-surveys/

Usage:
    pip install requests beautifulsoup4 anthropic
    export ANTHROPIC_API_KEY=your_key_here
    python bc_poll_scraper.py

GitHub Actions will run this daily and commit any new polls to polls.json.
"""

import json
import os
import hashlib
import logging
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup
import anthropic

# ── Config ──────────────────────────────────────────────────────────────────

POLLS_FILE   = Path("polls.json")
SEEN_FILE    = Path(".seen_urls.json")   # persists between runs
LOG_LEVEL    = logging.INFO

BC_KEYWORDS  = ["british columbia", "b.c.", "bc ndp", "bc conservative",
                 "bcpoli", "david eby", "rustad", "bc greens"]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; BCPollTracker/1.0; "
        "+https://github.com/yourname/bc-poll-tracker)"
    )
}

# ── Firm definitions ─────────────────────────────────────────────────────────

FIRMS = [
    {
        "name": "338Canada",
        "listing_url": "https://338canada.com/bc/polls.htm",
        "link_pattern": "338canada.com/bc/",   # prefix filter for new poll links
        "method": "html_table",                 # has structured data, parse directly
        "bc_only": True,                        # all content is BC-specific
    },
    {
        "name": "Pallas Data",
        "listing_url": "https://pallas-data.ca/category/polls/",
        "link_pattern": "pallas-data.ca/20",
        "method": "article_ai",
        "bc_only": False,   # also polls other provinces; filter by keyword
    },
    {
        "name": "Liaison Strategies",
        "listing_url": "https://press.liaisonstrategies.ca/",
        "link_pattern": "press.liaisonstrategies.ca/",
        "method": "article_ai",
        "bc_only": False,
    },
    {
        "name": "Research Co.",
        "listing_url": "https://researchco.ca/category/research/",
        "link_pattern": "researchco.ca/20",
        "method": "article_ai",
        "bc_only": False,
    },
    {
        "name": "Mainstreet Research",
        "listing_url": "https://mainstreetresearch.ca/polling",
        "link_pattern": "mainstreetresearch.ca/",
        "method": "article_ai",
        "bc_only": False,
    },
    {
        "name": "Cardinal Research",
        "listing_url": "https://cardinalresearch.ca/",
        "link_pattern": "cardinalresearch.ca/",
        "method": "article_ai",
        "bc_only": False,
    },
    {
        "name": "Angus Reid",
        "listing_url": "https://angusreid.org/category/politics/british-columbia/",
        "link_pattern": "angusreid.org/",
        "method": "article_ai",
        "bc_only": True,
    },
    {
        "name": "Ipsos",
        "listing_url": "https://www.ipsos.com/en-ca/news-polls?field_topics_target_id=2081",
        "link_pattern": "ipsos.com/en-ca/",
        "method": "article_ai",
        "bc_only": False,
    },
    {
        "name": "Léger",
        "listing_url": "https://leger360.com/polls-surveys/?province=bc",
        "link_pattern": "leger360.com/",
        "method": "article_ai",
        "bc_only": False,
    },
]

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Helpers ──────────────────────────────────────────────────────────────────

def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text())
    return default


def save_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def fetch(url: str, timeout: int = 15) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.text
    except Exception as e:
        log.warning(f"Fetch failed {url}: {e}")
        return None


def url_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def is_bc_relevant(text: str) -> bool:
    low = text.lower()
    return any(kw in low for kw in BC_KEYWORDS)


# ── Step 1: Discover new article URLs ────────────────────────────────────────

def discover_new_urls(firm: dict, seen: set) -> list[str]:
    html = fetch(firm["listing_url"])
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    new_urls = []

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.startswith("http"):
            href = firm["listing_url"].rstrip("/") + "/" + href.lstrip("/")

        if firm["link_pattern"] in href and href not in seen:
            new_urls.append(href)

    log.info(f"[{firm['name']}] Found {len(new_urls)} new URL(s)")
    return new_urls


# ── Step 2: AI extraction via Claude ────────────────────────────────────────

EXTRACTION_SYSTEM = """
You are a data extraction assistant for a BC provincial politics polling tracker.

Given the text of a polling article, extract BC provincial voting intention numbers.
Only extract data for BC PROVINCIAL polls (not federal polls, not municipal polls,
not polls from other provinces).

Return ONLY valid JSON in exactly this structure (no markdown, no preamble):
{
  "is_bc_provincial": true,
  "date": "YYYY-MM-DD",
  "firm": "Firm Name",
  "NDP": 44,
  "CON": 38,
  "GRN": 11,
  "OTH": 7,
  "n": 1003,
  "method": "online",
  "url": "",
  "notes": "Optional brief note"
}

Rules:
- "method" must be one of: "online", "IVR", "telephone", "mixed", "aggregate"
- All vote share values are integers (round if needed). They should sum to ~100.
- If this is NOT a BC provincial poll, return {"is_bc_provincial": false}
- If a field is unknown, use null
- date is the field date (middle of fieldwork), not publication date
- CON refers to BC Conservative Party (CPBC), not federal CPC
""".strip()


def extract_with_claude(text: str, url: str) -> dict | None:
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            system=EXTRACTION_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": f"Article URL: {url}\n\nArticle text:\n\n{text[:8000]}"
                }
            ],
        )
        raw = message.content[0].text.strip()
        data = json.loads(raw)
        data["url"] = url
        return data
    except json.JSONDecodeError as e:
        log.warning(f"JSON parse error from Claude for {url}: {e}")
        return None
    except Exception as e:
        log.warning(f"Claude API error for {url}: {e}")
        return None


# ── Step 3: Parse 338Canada HTML table directly ──────────────────────────────

def parse_338canada(html: str) -> list[dict]:
    """
    338Canada has structured data in its page — scrape it directly
    rather than sending to Claude.
    """
    soup = BeautifulSoup(html, "html.parser")
    results = []

    # The poll data is embedded as text tooltips in the SVG chart; we parse
    # the visible poll list items which have a consistent pattern:
    # "YYYY-MM-DD\nNDP X%\nCPBC Y%\nBCG Z%"
    for item in soup.find_all(text=True):
        item = item.strip()
        if item.startswith("20") and len(item) == 10:
            # likely a date — grab next siblings
            pass  # placeholder: real implementation parses chart data

    log.info("338Canada direct parser: returning 0 (extend as needed)")
    return results


# ── Main pipeline ────────────────────────────────────────────────────────────

def run():
    seen: set = set(load_json(SEEN_FILE, []))
    polls: list = load_json(POLLS_FILE, [])
    existing_urls = {p.get("url") for p in polls}
    new_count = 0

    for firm in FIRMS:
        log.info(f"── Checking {firm['name']} ──")
        new_urls = discover_new_urls(firm, seen)

        for url in new_urls:
            seen.add(url)

            # Skip if already in polls.json
            if url in existing_urls:
                continue

            # Fetch article text
            html = fetch(url)
            if not html:
                continue

            soup = BeautifulSoup(html, "html.parser")
            text = soup.get_text(separator="\n", strip=True)

            # Quick keyword filter before burning an API call
            if not firm["bc_only"] and not is_bc_relevant(text):
                log.debug(f"Skipping (no BC keywords): {url}")
                continue

            # Extract with Claude
            log.info(f"  Extracting: {url}")
            result = extract_with_claude(text, url)

            if result is None:
                continue

            if not result.get("is_bc_provincial"):
                log.debug(f"  → Not a BC provincial poll, skipping")
                continue

            # Clean up and append
            result.pop("is_bc_provincial", None)
            result["firm"] = firm["name"]
            polls.append(result)
            existing_urls.add(url)
            new_count += 1
            log.info(
                f"  ✓ Added: {result.get('date')} | "
                f"NDP {result.get('NDP')}% CON {result.get('CON')}% "
                f"GRN {result.get('GRN')}%"
            )

    # Sort polls chronologically
    polls.sort(key=lambda p: p.get("date") or "")

    # Persist
    save_json(POLLS_FILE, polls)
    save_json(SEEN_FILE, list(seen))

    log.info(f"Done. {new_count} new poll(s) added. Total: {len(polls)}")


if __name__ == "__main__":
    run()
