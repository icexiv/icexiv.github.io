"""Notist site extension: join project metadata with compiled document bodies."""

import hashlib
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlsplit


def embedded_html(body, page_url):
    """Keep local document links valid when a body is embedded on the homepage."""
    def replace(match):
        target = html.unescape(match[2])
        if target.startswith("#") or urlsplit(target).scheme or target.startswith("//"):
            return match[0]
        return f'{match[1]}="{html.escape(urljoin(page_url, target), quote=True)}"'
    return re.sub(r'\b(href|src)="([^"]*)"', replace, body)


def catalog(request):
    pages = {page["route"]["path"]: page for page in request["pages"]}
    entries = request["data"]["projects"]["projects"]
    if not entries:
        raise ValueError("projects must not be empty")
    cards, navigation, panels = [], [], []
    seen = set()
    for index, entry in enumerate(entries):
        key = entry["id"]
        if not re.fullmatch(r"[a-z][a-z0-9-]*", key) or key in seen:
            raise ValueError(f"invalid or duplicate project id: {key}")
        seen.add(key)
        source = entry["page"]
        if source not in pages:
            raise ValueError(f"missing project page: {source}")
        page = pages[source]
        if page["attrs"].get("template") != "project":
            raise ValueError(f"project page must use the project template: {source}")
        if entry["icon"] not in {"market", "db", "eorzea"}:
            raise ValueError(f"unknown project icon: {entry['icon']}")
        common = dict(entry, title=page["title"], url=page["route"]["url"],
                      active=index == 0, panel_id=f"project-{key}", heading_id=f"{key}-heading")
        cards.append(common)
        navigation.append({name: common[name] for name in ("id", "title", "active", "panel_id")})
        panels.append(dict(common, html=embedded_html(page["html"], page["route"]["url"])))
    return {"cards": cards, "navigation": navigation, "panels": panels,
            "count": len(cards), "max": len(cards) - 1}


def respond(request):
    response = {"version": 2, "event": request["event"]}
    if request["version"] != 2:
        raise ValueError("unsupported protocol version")
    if request["event"] == "before_compile":
        return response
    if request["event"] != "before_template":
        raise ValueError("unsupported event")
    data = dict(request["data"])
    data["catalog"] = catalog(request)
    root = Path(request["root"])
    data["revisions"] = {
        name: hashlib.sha256((root / "static" / name).read_bytes()).hexdigest()[:12]
        for name in ("style.css", "projects.js")
    }
    response["data"] = data
    return response


def main():
    for line in sys.stdin:
        request = json.loads(line)
        try:
            response = respond(request)
        except Exception as error:
            response = {"version": 2, "event": request["event"], "errors": [str(error)]}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
