# Deployment Guide

## Overview

There are two separate things to deploy:
1. **Desktop App** — Electron `.exe` installer, released via GitHub Actions
2. **Website** — `website/index.html` landing/download page, deployed separately (Vercel / GitHub Pages / any static host)

---

## 1. Daily Dev Workflow

```bash
# Create a feature branch
git checkout -b feat/your-feature-name

# Make changes, then stage and commit
git add .
git commit -m "feat: describe what you did"

# Push branch
git push origin feat/your-feature-name

# Open PR on GitHub → review → merge to master
```

---

## 2. Release Desktop App (GitHub Actions)

> Triggered automatically when you push a version tag. No manual build needed.

### Step-by-step

**Step 1 — Bump version in `package.json`**
```json
"version": "2.2.0"   →   "version": "2.3.0"
```

**Step 2 — Commit the version bump**
```bash
git add package.json
git commit -m "chore: bump version to 2.3.0"
git push origin master
```

**Step 3 — Tag the release**
```bash
git tag v2.2.0
git push origin v2.2.0
```

**Step 4 — GitHub Action runs automatically**
- Triggers on `.github/workflows/release.yml`
- Runs on `windows-latest`
- Runs `npm install` → `npm run release`
- Builds `Digital-Wellbeing-Setup-2.3.0.exe`
- Publishes to **GitHub Releases** automatically

**Step 5 — Verify on GitHub**
- Go to `github.com/Sainikhil-315/digital-wellbeing-desktop/releases`
- New release should appear with `.exe` attached
- Existing app installs auto-update via `electron-updater` within 4 hours

---

## 3. Update the Website (`website/index.html`)

The website is a standalone static HTML file at `website/index.html`.

### What to update after each release

1. **Download link** — find the old version URL and update to new release:
   ```
   https://github.com/Sainikhil-315/digital-wellbeing-desktop/releases/download/v2.2.0/Digital-Wellbeing-Setup-2.2.0.exe
                                                                                         ↓
   https://github.com/Sainikhil-315/digital-wellbeing-desktop/releases/download/v2.3.0/Digital-Wellbeing-Setup-2.3.0.exe
   ```

2. **Version number** — update any version badge or text in the HTML

3. **Changelog / features** — add new features to the "What's new" or features section

### Deploy the website

The website is a plain HTML file — deploy to any static host:

**Option A — GitHub Pages (free, already on GitHub)**
```bash
# Enable GitHub Pages in repo Settings → Pages → Source: /website folder
# Or move website/index.html to docs/index.html and point Pages there
```

**Option B — Vercel (fast, auto-deploy on push)**
```bash
# vercel.json was removed — recreate if needed
# Point root to /website directory in Vercel project settings
```

**Option C — Manual upload**
```
Upload website/index.html to any static host (Netlify, Cloudflare Pages, etc.)
```

---

## 4. Full Release Checklist

```
[ ] Merge all PRs to master
[ ] Bump version in package.json
[ ] Commit: "chore: bump version to vX.X.X"
[ ] Push to master
[ ] git tag vX.X.X
[ ] git push origin vX.X.X
[ ] Wait for GitHub Action to complete (~3-5 min)
[ ] Verify release appears on GitHub Releases page
[ ] Update download URL in website/index.html
[ ] Update version text / changelog in website
[ ] Deploy updated website
[ ] Done
```

---

## 5. Rollback

If a release has a bug:

```bash
# Delete the bad tag
git push origin --delete vX.X.X
git tag -d vX.X.X

# Fix the code, re-tag
git tag vX.X.X
git push origin vX.X.X
```

Or delete the release manually on GitHub and re-run.
