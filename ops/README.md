# Server deployment

The homepage is served by Caddy at `/srv/icexiv.top/www`. Release manifests live in its `downloads/` subdirectory and are excluded from website rsync deletion.

Use two independent Ed25519 keys, both authorized on the `deploy` account:

- Homepage key: `restrict,command="/usr/bin/rrsync -wo /srv/icexiv.top/www"`. Its CI rsync destination is `deploy@82.156.196.54:./`.
- Eorzea key: `restrict,command="/usr/local/libexec/eorzea-download-publish"`. The forced command permits rsync only inside `downloads/`, validates the TOS-only JSON and promotes it with an atomic rename using `publish-manifest eorzea.json.<run-id>.tmp`.

Install `eorzea-download-publish.py` as a root-owned executable at that path, and include `icexiv.caddy` from the existing Caddyfile. Both repositories use their own `DEPLOY_SSH_KEY` and a verified `DEPLOY_KNOWN_HOSTS` secret. Do not commit private keys. Market's authorization and keys are independent and must remain unchanged.

The ICP license matches Market's configured license. The police filing number and icon come from the user's official filing; the homepage and Market both display them on the domestic build only.

`icexiv.caddy` also contains the `/_analytics/*` collector for the Medama instance shared with Market. It forwards only `ping` and same-origin `hit` to the private Tailnet forwarder and never exposes the dashboard. The `icexiv.top` hostname must be registered in Medama before hits are stored. Medama loads its website list at startup, so restart the container after registration. A loopback hit returns 204 even when the host is unknown; check the logs for `hit: website not found`.
