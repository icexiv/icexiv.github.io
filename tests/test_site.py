import hashlib
import os
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


PROJECT = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get("SITE_ROOT", PROJECT / "dist"))
PAGE = ROOT / "index.html"


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.elements = []
        self.locations = []
        self.stack = []
        self.anchor_depth = 0
        self.nested_links = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
        self.locations.append((tag, attrs, tuple(self.stack)))
        if tag == "a":
            self.nested_links |= self.anchor_depth > 0
            self.anchor_depth += 1
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append((tag, attrs))

    def handle_endtag(self, tag):
        if tag == "a":
            self.anchor_depth -= 1
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def with_class(self, name):
        return [(tag, attrs) for tag, attrs in self.elements if name in attrs.get("class", "").split()]


class SiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = Page(PAGE.read_text())

    def test_asset_fingerprints(self):
        assets = [attrs["href"] for tag, attrs in self.page.elements if tag == "link" and attrs.get("rel") == "stylesheet"]
        assets += [attrs["src"] for tag, attrs in self.page.elements
                   if tag == "script" and "src" in attrs and "rev=" in attrs["src"]]
        self.assertEqual(len(assets), 3)
        for asset in assets:
            with self.subTest(asset=asset):
                url = urlsplit(asset)
                digest = hashlib.sha256((ROOT / url.path.lstrip("/")).read_bytes()).hexdigest()[:12]
                self.assertEqual(parse_qs(url.query).get("rev"), [digest], "资源修改后需要同步更新链接指纹")

    def test_local_assets_exist(self):
        for tag, attrs in self.page.elements:
            for attr in ("href", "src"):
                value = attrs.get(attr)
                if value and not urlsplit(value).scheme:
                    url = urlsplit(value)
                    if url.path:
                        self.assertTrue((ROOT / url.path.lstrip("/")).is_file(), value)
                    elif url.fragment:
                        self.assertTrue(any(a.get("id") == url.fragment for _, a in self.page.elements), value)

    def test_independent_links(self):
        self.assertFalse(self.page.nested_links)
        self.assertEqual(self.page.anchor_depth, 0)
        self.assertEqual(len(self.page.with_class("product-link")), 4)

    def test_cards_and_placeholders(self):
        self.assertEqual(len(self.page.with_class("project-card")), 3)
        placeholders = self.page.with_class("preview-placeholder")
        self.assertEqual(len(placeholders), 1)
        self.assertTrue(all(attrs.get("aria-label") for _, attrs in placeholders))

    def test_project_selection_structure(self):
        selectors = [a for _, a in self.page.elements if "data-select" in a]
        panels = [a for _, a in self.page.elements if "data-project-panel" in a]
        self.assertEqual(len(selectors), 3)
        self.assertEqual(len(panels), 3)
        self.assertEqual(sum(a.get("aria-pressed") == "true" for a in selectors), 1)
        self.assertEqual(sum("hidden" not in a for a in panels), 1)
        for selector in selectors:
            self.assertTrue(any(p["id"] == selector["aria-controls"] and p["data-project-panel"] == selector["data-select"] for p in panels))
        jumps = [a for _, a in self.page.elements if "data-jump" in a]
        self.assertEqual(len(jumps), 3)
        self.assertEqual(sum(a.get("aria-current") == "true" for a in jumps), 1)
        for jump in jumps:
            self.assertTrue(any(p["id"] == jump["aria-controls"] and p["data-project-panel"] == jump["data-jump"] for p in panels))
        scrollbars = [a for _, a in self.page.with_class("project-scrollbar")]
        self.assertEqual(len(scrollbars), 1)
        self.assertEqual(scrollbars[0]["type"], "range")
        self.assertEqual(scrollbars[0]["step"], "any")
        self.assertEqual(scrollbars[0]["aria-controls"], "project-track")

    def test_actions_and_metadata_placement(self):
        for tag, attrs, parents in self.page.locations:
            classes = attrs.get("class", "").split()
            if "product-link" in classes:
                self.assertTrue(any("detail-heading" in a.get("class", "").split() for _, a in parents))
                self.assertTrue(any("project-panel" in a.get("class", "").split() for _, a in parents))
                self.assertFalse(any("project-card" in a.get("class", "").split() for _, a in parents))
            if any(name in classes for name in ("repo-link", "source", "platform-note")):
                self.assertTrue(any("project-card" in a.get("class", "").split() for _, a in parents))
            if "repo-link" in classes:
                self.assertTrue(any("project-header" in a.get("class", "").split() for _, a in parents))
            if tag == "img" and "brand-mark" in classes:
                self.assertTrue(any("brand" in a.get("class", "").split() for _, a in parents))
                self.assertFalse(attrs.get("alt"), "标志与文字并列，图像本身是装饰")
            elif tag == "img" and "project-logo" in classes:
                self.assertFalse(attrs.get("alt"), "项目标识与项目名称并列，图像本身是装饰")
                self.assertTrue(any("market-icon" in a.get("class", "").split() for _, a in parents))
            elif tag == "img" and "police-beian" not in attrs.get("src", ""):
                self.assertFalse(any(t in {"a", "button"} for t, _ in parents), "截图仅展示，不提供点击放大")
                self.assertTrue(any("screen" in a.get("class", "").split() for _, a in parents))
                self.assertTrue(any("visual-stage" in a.get("class", "").split() for _, a in parents))
                self.assertTrue(attrs.get("alt"))
            elif tag == "img":
                self.assertTrue(any("legal-police" in a.get("class", "").split() for _, a in parents))

    def test_screenshot_dimensions(self):
        images = [attrs for tag, attrs in self.page.elements
                  if tag == "img" and "brand-mark" not in attrs.get("class", "").split()
                  and "project-logo" not in attrs.get("class", "").split()
                  and "police-beian" not in attrs.get("src", "")]
        self.assertEqual(len(images), 2, "Market 和 Eorzea 使用截图，DB 保持占位")
        for image in images:
            with self.subTest(image=image["src"]):
                self.assertTrue(image.get("alt"))
                data = (ROOT / image["src"].lstrip("/")).read_bytes()
                self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                width, height = struct.unpack(">II", data[16:24])
                self.assertGreaterEqual(width, 2080, "大图源文件需覆盖 1040px 展示宽度的 2 倍像素密度")
                self.assertGreater(height, 0)

    def test_download_split_button_placeholder(self):
        primary = self.page.with_class("download-primary")
        toggle = self.page.with_class("download-toggle")
        options = self.page.with_class("download-option")
        self.assertEqual(len(primary), 2)
        self.assertEqual({attrs["data-channel"] for _, attrs in primary}, {"stable", "dev"})
        for tag, attrs in primary:
            self.assertEqual(tag, "a")
            self.assertEqual(attrs["aria-disabled"], "true")
            self.assertNotIn("href", attrs)
        self.assertEqual(len(toggle), 2)
        for tag, attrs in toggle:
            self.assertEqual(tag, "summary")
            self.assertNotIn("disabled", attrs)
        self.assertEqual(len(options), 6)
        for _, attrs in options:
            self.assertIn("data-platform", attrs)
            self.assertEqual(attrs["aria-disabled"], "true")
        self.assertEqual(len(self.page.with_class("download-filename")), 2)

    def test_same_tab_links_use_horizontal_arrow(self):
        html = PAGE.read_text()
        self.assertIn('class="arrow" aria-hidden="true">→</span>', html)
        self.assertNotIn('↗', html)
        for tag, attrs in self.page.elements:
            if tag != "a":
                continue
            classes = attrs.get("class", "").split()
            if "product-link" in classes or "project-permalink" in classes:
                self.assertNotIn("target", attrs, "same-tab links must not force a new tab")

    def test_deployment_source_and_legal_footer(self):
        domestic = os.environ.get("SITE_TARGET") == "cn"
        group = self.page.with_class("download-controls")[0][1]
        self.assertEqual(group["data-download-source"], "tos" if domestic else "github")
        self.assertEqual(group["data-download-manifest"], "/downloads/eorzea.json" if domestic
                         else "https://raw.githubusercontent.com/icexiv/eorzea/main/downloads/github.json")
        self.assertEqual(bool(self.page.with_class("legal-footer")), domestic)
        market = [attrs["href"] for _, attrs in self.page.with_class("product-link") if "href" in attrs]
        expected = "https://market.icexiv.top/" if domestic else "https://icexiv.github.io/icexiv-market/"
        self.assertIn(expected, market)
        self.assertIn("https://db.icexiv.top/" if domestic else "https://icexiv.github.io/icexiv-db/", market)
        police = self.page.with_class("legal-police")
        self.assertEqual(len(police), 1 if domestic else 0)
        if domestic:
            self.assertEqual(police[0][1]["href"], "https://beian.mps.gov.cn/#/query/webSearch?code=11010502064164")
            self.assertIn("京公网安备11010502064164号", PAGE.read_text())
            self.assertTrue((ROOT / "assets/police-beian.png").is_file())

    def test_domestic_analytics_injection(self):
        domestic = os.environ.get("SITE_TARGET") == "cn"
        scripts = [attrs for tag, attrs in self.page.elements if tag == "script" and "src" in attrs]
        tracker = [attrs for attrs in scripts if "_analytics/tracker.js" in attrs["src"]]
        self.assertEqual(len(tracker), 1 if domestic else 0)
        if domestic:
            self.assertEqual(tracker[0]["src"], "/_analytics/tracker.js")
            self.assertEqual(tracker[0]["referrerpolicy"], "no-referrer")
            source = (ROOT / "_analytics/tracker.js").read_text()
            self.assertIn("icexiv.top", source)
            self.assertIn("/projects/eorzea.html", source)

    def test_standalone_project_pages(self):
        for key in ("market", "db", "eorzea"):
            with self.subTest(project=key):
                html = (ROOT / "projects" / f"{key}.html").read_text()
                page = Page(html)
                panels = page.with_class("project-panel")
                self.assertEqual(len(panels), 1)
                self.assertEqual(panels[0][1]["data-project-panel"], key)
                self.assertNotIn("hidden", panels[0][1])
                self.assertEqual(page.with_class("project-card"), [])
                self.assertIn(f'href="/projects/{key}.html"', PAGE.read_text())
                for tag, attrs in page.elements:
                    for field in ("src", "href"):
                        value = attrs.get(field, "")
                        parsed = urlsplit(value)
                        if parsed.path and not parsed.scheme:
                            self.assertTrue((ROOT / parsed.path.lstrip("/")).is_file(), value)


if __name__ == "__main__":
    unittest.main()
