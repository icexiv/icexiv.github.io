import copy
import importlib.util
import json
import subprocess
import sys
import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("projects", ROOT / "scripts/projects.py")
projects = importlib.util.module_from_spec(spec)
spec.loader.exec_module(projects)


class ExtensionTests(unittest.TestCase):
    def setUp(self):
        metadata = tomllib.loads((ROOT / "data/projects.toml").read_text())
        self.request = {
            "version": 2, "event": "before_template", "root": str(ROOT),
            "data": {"projects": metadata, "other": {"preserved": True}},
            "files": {},
            "pages": [{"route": {"path": item["page"], "url": f"/projects/{item['id']}.html"},
                       "title": item["id"].title(), "attrs": {"template": "project"},
                       "html": f"<p>{item['id']} body</p>"} for item in metadata["projects"]],
        }

    def test_catalog_joins_compiled_bodies_and_metadata(self):
        result = projects.respond(self.request)["data"]
        self.assertEqual(result["other"], {"preserved": True})
        catalog = result["catalog"]
        self.assertEqual(catalog["count"], 3)
        self.assertEqual(catalog["max"], 2)
        for card, nav, panel in zip(catalog["cards"], catalog["navigation"], catalog["panels"]):
            self.assertEqual(card["id"], nav["id"])
            self.assertEqual(card["panel_id"], panel["panel_id"])
            self.assertIn(f"{card['id']} body", panel["html"])
        self.assertEqual(sum(card["active"] for card in catalog["cards"]), 1)
        self.assertEqual(set(result["revisions"]), {"style.css", "projects.js"})

    def test_project_count_is_not_hardcoded(self):
        self.request["data"]["projects"]["projects"].pop()
        result = projects.catalog(self.request)
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["max"], 1)

    def test_embedded_native_image_and_link_paths(self):
        body = '<img src="../assets/test.png"><a href="db.html">DB</a><a href="#cli">CLI</a>'
        result = projects.embedded_html(body, "/projects/eorzea.html")
        self.assertIn('src="/assets/test.png"', result)
        self.assertIn('href="/projects/db.html"', result)
        self.assertIn('href="#cli"', result)

    def test_rejects_missing_page_and_duplicate_id(self):
        missing = copy.deepcopy(self.request)
        missing["pages"].pop()
        with self.assertRaisesRegex(ValueError, "missing project page"):
            projects.catalog(missing)
        self.request["data"]["projects"]["projects"][1]["id"] = "market"
        with self.assertRaisesRegex(ValueError, "duplicate project id"):
            projects.catalog(self.request)

    def test_protocol_handles_both_events_in_one_process(self):
        before = {"version": 2, "event": "before_compile", "documents": {}}
        completed = subprocess.run(
            [sys.executable, str(ROOT / "scripts/projects.py")],
            input="\n".join(json.dumps(r) for r in (before, self.request)) + "\n",
            text=True, capture_output=True, check=True,
        )
        responses = [json.loads(line) for line in completed.stdout.splitlines()]
        self.assertEqual(len(responses), 2)
        self.assertEqual(responses[0], {"version": 2, "event": "before_compile"})
        self.assertEqual(responses[1]["data"]["catalog"]["count"], 3)
