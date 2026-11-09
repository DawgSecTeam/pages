# DawgSec Member Pages

Claim your own corner of the club: add a folder, open a PR, get
**`https://<yourname>.page.dawgsec.com`** serving your static site.

## Get your page in 3 steps

1. **Fork this repo** (or create a branch if you have access) and add a folder:
   ```
   sites/<yourname>/
   ```
   `<yourname>` must be lowercase: starts with a letter, then letters/digits/hyphens,
   2–31 characters total (regex `^[a-z][a-z0-9-]{1,30}$`). Example: `sites/ahmed/`.

2. **Put your site in that folder.** At minimum an `index.html`. Static files only —
   plain HTML/CSS/JS plus images, fonts, media (see the rules below). Frameworks are
   fine as long as the *output* is static files committed into your folder.

3. **Open a pull request.** CI validates your folder and a maintainer reviews it.
   Once merged, your site deploys automatically within a minute or two at
   `https://<yourname>.page.dawgsec.com`.

## Rules

- **Static files only.** No server-side code, no executables. Allowed extensions:
  `html htm css js mjs json png jpg jpeg gif svg webp avif ico woff woff2 ttf otf
  txt xml webmanifest pdf mp3 mp4 wav ogg`.
- **Size limits:** ≤ 25 MB per site, ≤ 2000 files per site.
- **Club-appropriate content.** Your page lives under the DawgSec brand — keep it
  something the club is happy to vouch for. No phishing, no malware, no credential
  harvesting pages.
- **One folder per PR.** Add exactly one `sites/<yourname>/` folder per pull request.
- **First-come, first-served.** Names are claimed when your PR merges. If a name is
  taken, pick another. Some names are reserved (infrastructure, admin, brand names)
  and will be rejected by CI.
- **Takedown:** deleting your folder (and merging that PR) takes your site down.
  Maintainers can also remove any page at any time.

## How it works

Merged changes to `sites/` are validated by CI, then rsynced to the club VPS and
served by Caddy at `https://<name>.page.dawgsec.com`. Nothing you do locally
goes live — only what lands on `main` after review.

Questions? Ping a maintainer in the club chat.
