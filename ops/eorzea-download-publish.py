#!/usr/bin/env python3
"""Forced SSH command: scoped rsync uploads and atomic TOS-manifest promotion."""

import json
import os
import re
import shlex
import stat
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path("/srv/icexiv.top/www/downloads")


def validate(data):
    if data.get("schema") != 1 or data.get("source") != "tos":
        raise ValueError("only TOS download manifests may be published")
    channels = data.get("channels")
    if not isinstance(channels, dict) or set(channels) != {"stable", "dev"}:
        raise ValueError("invalid channels")
    for channel in channels.values():
        if channel is None:
            continue
        if not isinstance(channel.get("version"), str) or not channel.get("assets"):
            raise ValueError("invalid channel")
        for asset in channel["assets"].values():
            url = urlsplit(asset["url"])
            digest = asset["sha256"]
            if (url.scheme != "https" or url.netloc != "azurice-shadow.tos-cn-beijing.volces.com"
                    or url.query or url.fragment or not re.fullmatch(r"[a-f0-9]{64}", digest)
                    or url.path != f"/eorzea/objects/sha256/{digest[:2]}/{digest[2:]}"
                    or not isinstance(asset["size"], int) or asset["size"] <= 0):
                raise ValueError("invalid TOS asset")


def main():
    command = shlex.split(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
    if command[:2] == ["rsync", "--server"]:
        os.execv("/usr/bin/rrsync", ["rrsync", "-wo", str(ROOT)])
    if len(command) != 2 or command[0] != "publish-manifest" or not re.fullmatch(r"eorzea\.json\.\d+\.tmp", command[1]):
        raise ValueError("command not permitted")
    temporary = ROOT / command[1]
    metadata = temporary.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > 1024 * 1024:
        raise ValueError("invalid manifest file")
    validate(json.loads(temporary.read_text()))
    temporary.chmod(0o644)
    temporary.replace(ROOT / "eorzea.json")


if __name__ == "__main__":
    main()
