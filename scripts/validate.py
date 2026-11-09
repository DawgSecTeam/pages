#!/usr/bin/env python3
"""Validate sites/ in the DawgSec member-pages repo.

Usage:
  python3 scripts/validate.py pr    # validate sites changed vs the PR base branch
                                     # (uses $GITHUB_BASE_REF; diff against origin/$BASE)
  python3 scripts/validate.py all   # validate every site (deploy-time defense in depth)

Exits non-zero with one clear message per violation.
Stdlib only.
"""
import os
import re
import subprocess
import sys

NAME_RE = re.compile(r"^[a-z][a-z0-9-]{1,30}$")

RESERVED = {
    "www", "admin", "api", "dns", "ns1", "ns2", "mail", "mx", "smtp", "pop",
    "imap", "vpn", "litellm", "nextcloud", "realm", "git", "forgejo", "gitea",
    "matrix", "chat", "social", "field", "photos", "dashboard", "boss",
    "hermes", "root", "page", "pages", "site", "sites", "test", "staging",
    "dev", "prod", "ctf", "range", "team", "club", "dawgsec", "umbs", "umbc",
    "turn", "turns", "deck", "talk", "invite", "welcome", "vulndb",
    "guacamole", "dex", "ldap", "headscale", "immich", "n8n", "wazuh",
    "buzz", "wiki", "labs", "hub", "playbooks", "injects", "score",
    "scoring", "portal", "docs", "help", "about", "login", "oauth", "sso",
    "static", "cdn", "assets", "cdn2", "dev1", "beta", "preview", "grafana",
    "prometheus", "kibana", "jenkins", "ci", "build",
}

ALLOWED_EXTS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico",
    ".woff", ".woff2", ".ttf", ".otf",
    ".txt", ".xml", ".webmanifest", ".pdf",
    ".mp3", ".mp4", ".wav", ".ogg",
}

MAX_SITE_BYTES = 25_000_000
MAX_SITE_FILES = 2000


def git(*args, check=True):
    proc = subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False
    )
    if check and proc.returncode != 0:
        sys.exit(
            "git %s failed (exit %d):\n%s"
            % (" ".join(args), proc.returncode, proc.stderr.strip())
        )
    return proc.stdout


def list_site_tree(revision="HEAD"):
    """Return {path: (mode, objtype)} for everything under sites/ at revision."""
    out = git("ls-tree", "-r", "-z", revision, "--", "sites/")
    entries = {}
    for record in out.split("\0"):
        if not record:
            continue
        meta, path = record.split("\t", 1)
        mode, objtype, _sha = meta.split(" ")
        entries[path] = (mode, objtype)
    return entries


def blob_sizes(shas):
    """Return {sha: size_bytes} using one batch-check call."""
    sizes = {}
    if not shas:
        return sizes
    proc = subprocess.run(
        ["git", "cat-file", "--batch-check=%(objectname) %(objectsize)"],
        input="\n".join(shas), capture_output=True, text=True, check=True,
    )
    for line in proc.stdout.splitlines():
        parts = line.split()
        if len(parts) == 2:
            sizes[parts[0]] = int(parts[1])
    return sizes


def site_of(path):
    """Top-level site name for a path under sites/, else None."""
    parts = path.split("/")
    if len(parts) < 3 or parts[0] != "sites":
        return None
    return parts[1]


def changed_paths_pr():
    base = os.environ.get("GITHUB_BASE_REF", "").strip()
    if not base:
        sys.exit(
            "GITHUB_BASE_REF is not set; run this in a pull_request workflow "
            "or use 'validate.py all'."
        )
    git("fetch", "origin", base)
    out = git("diff", "--name-only", "origin/" + base)
    return [p for p in out.splitlines() if p]


def validate_site(name, tree, errors):
    """Run all per-site checks against the (HEAD) tree."""
    if not NAME_RE.match(name):
        errors.append(
            "sites/%s: site name %r is invalid - must match ^[a-z][a-z0-9-]{1,30}$ "
            "(lowercase letters, digits, hyphens; must start with a letter; 2-31 chars)"
            % (name, name)
        )
    if name in RESERVED:
        errors.append(
            "sites/%s: %r is a reserved name and cannot be claimed" % (name, name)
        )

    prefix = "sites/" + name + "/"
    blobs = []  # (path, sha-less; we keep mode info)
    total = 0
    count = 0
    for path, (mode, objtype) in sorted(tree.items()):
        if not path.startswith(prefix):
            continue
        rel = path[len(prefix):]
        if ".." in path.split("/"):
            errors.append("%s: path traversal ('..') is not allowed" % path)
            continue
        if mode == "120000" or objtype == "symlink":
            errors.append("%s: symlinks are not allowed" % path)
            continue
        if objtype != "blob":
            continue
        ext = os.path.splitext(rel)[1].lower()
        if ext not in ALLOWED_EXTS:
            errors.append(
                "%s: file extension %r is not in the allowlist "
                "(static web content only)" % (path, ext or "(none)")
            )
            continue
        blobs.append((path, mode))
        count += 1

    if count > MAX_SITE_FILES:
        errors.append(
            "sites/%s: %d files exceeds the limit of %d per site"
            % (name, count, MAX_SITE_FILES)
        )

    # Size check via git cat-file -s (batched).
    shas = []
    path_sha = {}
    out = git("ls-tree", "-r", "-z", "HEAD", "--", prefix)
    for record in out.split("\0"):
        if not record:
            continue
        meta, path = record.split("\t", 1)
        mode, objtype, sha = meta.split(" ")
        if objtype == "blob" and mode != "120000":
            shas.append(sha)
            path_sha[sha] = path
    sizes = blob_sizes(shas)
    total = sum(sizes.get(sha, 0) for sha in shas)
    if total > MAX_SITE_BYTES:
        errors.append(
            "sites/%s: total size %d bytes exceeds the 25 MB (25000000 byte) limit"
            % (name, total)
        )


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "pr"
    if mode not in ("pr", "all"):
        sys.exit("usage: validate.py [pr|all]")

    if not os.path.isdir(".git") and not os.path.isfile(".git"):
        sys.exit("not a git repository - run from the repo root")

    tree = list_site_tree("HEAD")
    errors = []

    # Files sitting directly under sites/ (not inside a site folder).
    for path, (_mode, objtype) in sorted(tree.items()):
        parts = path.split("/")
        if objtype == "blob" and len(parts) == 2:
            errors.append(
                "%s: files must live inside a sites/<name>/ folder, "
                "not directly under sites/" % path
            )

    # Symlinks anywhere under sites/ (even empty-dir tricks).
    for path, (mode, _objtype) in sorted(tree.items()):
        if mode == "120000":
            if "%s: symlinks are not allowed" % path not in errors:
                errors.append("%s: symlinks are not allowed" % path)

    if mode == "all":
        sites = sorted({s for s in (site_of(p) for p in tree) if s})
    else:
        changed = changed_paths_pr()
        affected = sorted({s for s in (site_of(p) for p in changed) if s})
        # Only validate affected sites that still exist at HEAD.
        existing = {s for s in (site_of(p) for p in tree) if s}
        sites = [s for s in affected if s in existing]
        print(
            "Changed paths: %d; affected sites: %s"
            % (len(changed), ", ".join(affected) if affected else "(none)")
        )

    for site in sites:
        validate_site(site, tree, errors)

    if errors:
        print("\nVALIDATION FAILED - %d violation(s):" % len(errors), file=sys.stderr)
        for err in errors:
            print("  - " + err, file=sys.stderr)
        sys.exit(1)

    print("OK: %d site(s) validated (%s mode)." % (len(sites), mode))


if __name__ == "__main__":
    main()
