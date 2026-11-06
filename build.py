"""Build the static opportunity directory and 36 individual detail pages."""
from pathlib import Path
from html import escape
from urllib.parse import urlparse
import json

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
CHALLENGES = json.loads((ROOT / "challenges.json").read_text())
ORIGIN = "https://block71-opportunities-prototype.kaixuan-np.chatgpt.site"


def e(value):
    return escape(str(value), quote=True)


def source_link(label, url):
    if urlparse(url).scheme not in ("https", "http"):
        raise ValueError("Unsupported source URL")
    return f'<a href="{e(url)}" target="_blank" rel="noopener noreferrer">{e(label)}<span class="sr-only"> (opens in a new tab)</span></a>'


def item(value):
    if isinstance(value, str):
        return e(value)
    result = (f'<strong>{e(value["label"])}:</strong> ' if value.get("label") else "") + e(value["body"])
    sources = value.get("sources", [])
    if value.get("source"):
        sources = [*sources, {"label": value["source"], "url": value["url"]}]
    for source in sources:
        label = source.get("label", source.get("source", source.get("title", "Source")))
        result += ' <span class="source">(Source: ' + source_link(label, source["url"]) + ")</span>"
    return result


def paragraphs(values):
    if isinstance(values, str):
        values = [values]
    return "\n".join(f"<p>{item(value)}</p>" for value in values)


def bullets(values):
    return '<ul>' + "\n".join(f"<li>{item(value)}</li>" for value in values) + '</ul>'


def header(prefix):
    return f'''<header class="site-header">
      <div class="header-inner">
        <a class="brand" href="{prefix}index.html" aria-label="B71 — all innovation opportunities">B71</a>
        <nav aria-label="Main navigation">
          <button class="nav-placeholder" type="button" data-info="About Us">About Us</button>
          <button class="nav-placeholder" type="button" data-info="For Startups">For Startups</button>
          <a class="nav-active" href="{prefix}index.html">Smart Port Challenge</a>
          <button class="nav-placeholder" type="button" data-info="Startup Showcase">Startup Showcase</button>
          <button class="nav-placeholder" type="button" data-info="Our Partners">Our Partners</button>
          <button class="nav-placeholder" type="button" data-info="News & Events">News &amp; Events</button>
        </nav>
        <button class="button button-contact" type="button" data-info="Contact Us">Contact us</button>
      </div>
    </header>'''


def shell(title, description, body, prefix="", path=""):
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#000000">
  <title>{e(title)} | B71 Opportunities</title>
  <meta name="description" content="{e(description)}">
  <link rel="canonical" href="{ORIGIN}/{e(path)}">
  <link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="{prefix}assets/exo-2-400.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="stylesheet" href="{prefix}assets/styles.css">
  <script src="{prefix}assets/site.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  {header(prefix)}
  {body}
  <footer class="site-footer"><a href="{prefix}index.html">B71 Innovation Opportunities</a><span>Location &amp; timeline: TBC</span></footer>
  <dialog id="information-dialog" aria-labelledby="dialog-title">
    <button class="dialog-close" aria-label="Close dialog" type="button">×</button>
    <p class="eyebrow">B71</p>
    <h2 id="dialog-title">Programme information</h2>
    <p id="dialog-message">Further information will be confirmed.</p>
    <button class="button dialog-done" type="button">Got it</button>
  </dialog>
</body>
</html>'''


def build_directory():
    groups = list(dict.fromkeys(challenge["group"] for challenge in CHALLENGES))
    options = ''.join(f'<option value="{e(group)}">{e(group)}</option>' for group in groups)
    cards = []
    for challenge in CHALLENGES:
        search = ' '.join([challenge["title"], challenge["thematic"], challenge["question"], challenge["group"]])
        cards.append(f'''<article class="opportunity-card" data-group="{e(challenge['group'])}" data-search="{e(search.lower())}">
          <h2>{e(challenge['title'])}</h2>
          <p class="card-theme">{e(challenge['thematic'])}</p>
          <p class="card-question"><span>{challenge['id']})</span> {e(challenge['question'])}</p>
          <a class="button read-more" href="opportunities/{e(challenge['slug'])}/" aria-label="Read more: {e(challenge['title'])}">Read More <span aria-hidden="true">↗</span></a>
        </article>''')
    body = f'''<main id="main" class="directory">
      <div class="directory-heading"><h1>Innovation opportunities</h1><p><span id="opportunity-count">36</span> opportunities</p></div>
      <form class="directory-tools" role="search" aria-label="Find an opportunity">
        <div class="search-wrap"><label for="opportunity-search" class="sr-only">Search opportunities</label><span aria-hidden="true">⌕</span><input id="opportunity-search" name="search" type="search" placeholder="Search opportunities" autocomplete="off"></div>
        <div class="theme-filter"><label for="theme-filter">Theme</label><select id="theme-filter" name="theme"><option value="">All themes</option>{options}</select></div>
        <button class="clear-filters" type="reset" hidden>Clear filters</button>
      </form>
      <p class="sr-only" id="filter-status" role="status" aria-live="polite"></p>
      <div class="opportunity-grid">{''.join(cards)}</div>
      <div class="empty-state" hidden><h2>No opportunities found</h2><p>Try another keyword or choose a different theme.</p><button class="button" id="empty-reset" type="button">Show all opportunities</button></div>
    </main>'''
    (DIST / "index.html").write_text(shell("Innovation opportunities", "Explore 36 innovation opportunities across climate, logistics, solar energy and food retail. Read each challenge and its collaboration requirements.", body))


def section(identifier, title, contents):
    return f'<section class="detail-section" aria-labelledby="{identifier}"><h2 id="{identifier}">{title}</h2>{contents}</section>'


def build_detail(challenge, index):
    sections = [
        section("background", "Background", paragraphs(challenge["background"])),
        section("significance", "Significance of Problem", '<p>' + e(challenge.get("significance_intro") or "If this problem remains unresolved, it could cause:") + '</p>' + bullets(challenge["significance"])),
        section("existing-efforts", "Existing Efforts", bullets(challenge["efforts"])),
        section("market-size", "Potential Market Size", bullets(challenge["market"])),
        section("eligibility", "Eligibility / Qualification", bullets(challenge["eligibility"])),
        section("where-when", "Where &amp; When", bullets([{"label":"Where", "body":challenge["where"]}, {"label":"When", "body":challenge["when"]}])),
    ]
    previous = CHALLENGES[index - 1] if index else None
    following = CHALLENGES[index + 1] if index + 1 < len(CHALLENGES) else None
    prev_link = f'<a href="../{e(previous["slug"])}/"><span>← Previous opportunity</span>{e(previous["title"])}</a>' if previous else '<span></span>'
    next_link = f'<a class="next-opportunity" href="../{e(following["slug"])}/"><span>Next opportunity →</span>{e(following["title"])}</a>' if following else '<span></span>'
    body = f'''<main id="main" class="detail-page">
      <a class="back-link" href="../../index.html">← All opportunities</a>
      <article>
        <header class="detail-hero">
          <div class="detail-hero-copy"><h1>{e(challenge['headline'])}</h1><p class="detail-theme"><strong>Thematic Area:</strong> {e(challenge['thematic'])}</p><p class="detail-question">{e(challenge['question'])}</p></div>
          <button class="button button-apply" type="button" data-info="Apply Now">Apply Now</button>
        </header>
        <div class="detail-content">{''.join(sections)}</div>
      </article>
      <nav class="detail-pagination" aria-label="More opportunities">{prev_link}{next_link}</nav>
    </main>'''
    destination = DIST / "opportunities" / challenge["slug"]
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "index.html").write_text(shell(challenge["headline"], challenge["question"], body, "../../", f"opportunities/{challenge['slug']}/"))


if __name__ == "__main__":
    assert len(CHALLENGES) == 36
    assert len({challenge["slug"] for challenge in CHALLENGES}) == 36
    DIST.mkdir(exist_ok=True)
    build_directory()
    for index, challenge in enumerate(CHALLENGES):
        build_detail(challenge, index)
    print("Built directory + 36 detail pages.")
