import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("server_publish", Path(__file__).resolve().parents[1] / "ops/eorzea-download-publish.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class ServerPublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = {"schema": 1, "source": "tos", "channels": {"stable": None, "dev": None}}

    def test_atomic_promotion_and_mode(self):
        temporary = self.root / "eorzea.json.123.tmp"
        temporary.write_text(json.dumps(self.data))
        with patch.object(server, "ROOT", self.root), patch.dict(os.environ, SSH_ORIGINAL_COMMAND="publish-manifest eorzea.json.123.tmp"):
            server.main()
        self.assertFalse(temporary.exists())
        self.assertEqual(json.loads((self.root / "eorzea.json").read_text()), self.data)
        self.assertEqual((self.root / "eorzea.json").stat().st_mode & 0o777, 0o644)

    def test_rejects_github_manifest_without_overwriting_live_file(self):
        live = self.root / "eorzea.json"
        live.write_text("keep")
        self.data["source"] = "github"
        (self.root / "eorzea.json.123.tmp").write_text(json.dumps(self.data))
        with patch.object(server, "ROOT", self.root), patch.dict(os.environ, SSH_ORIGINAL_COMMAND="publish-manifest eorzea.json.123.tmp"):
            with self.assertRaises(ValueError):
                server.main()
        self.assertEqual(live.read_text(), "keep")

    def test_rejects_shell_commands_and_symlink(self):
        for command in ("id", "sh -c id", "publish-manifest ../outside", "publish-manifest eorzea.json.1.tmp extra"):
            with patch.dict(os.environ, SSH_ORIGINAL_COMMAND=command), self.assertRaises(ValueError):
                server.main()
        (self.root / "target").write_text(json.dumps(self.data))
        (self.root / "eorzea.json.1.tmp").symlink_to(self.root / "target")
        with patch.object(server, "ROOT", self.root), patch.dict(os.environ, SSH_ORIGINAL_COMMAND="publish-manifest eorzea.json.1.tmp"), self.assertRaises(ValueError):
            server.main()
