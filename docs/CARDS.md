# Profile cards

Every image in the README is generated inside this repo — no third-party stats service that can go down.

| File | What it shows |
|---|---|
| `assets/header-{dark,light}.svg` | Name + rotating role line (edit `ROLES` in the script) |
| `assets/stats-{dark,light}.svg` | Contributions in the last 12 months, streaks, active days, repos, stars, followers + the activity hexagon |
| `assets/langs-{dark,light}.svg` | Language share by code size across own public repos (forks and archived excluded) |

The README uses `<picture>` so GitHub picks the dark or light card from the viewer's theme.

## How it updates

`.github/workflows/update-cards.yml` runs daily at 06:00 UTC (and on pushes that touch `scripts/`):
it runs `scripts/generate-cards.js`, which makes **one** GraphQL request with the workflow's `GITHUB_TOKEN`,
and commits `assets/` only when something changed.

The 3D calendar comes from `.github/workflows/isometric-calendar.yml` (yoshi389111/github-profile-3d-contrib),
published to the `output` branch.

## Activity hexagon

Six axes over the last 12 months: commits, pull requests, issues, reviews, plus stars and public repos.
Each axis is log-scaled against a "full" mark (1000 commits, 100 PRs/issues/reviews/stars, 50 repos) so small
numbers stay visible. Change the marks in `AXES`.

## Run locally

```sh
GITHUB_TOKEN=ghp_xxx node scripts/generate-cards.js auroravnliems
# or render from a saved GraphQL response:
node scripts/generate-cards.js --fixture response.json
```

Private contributions are counted only if "Include private contributions on my profile" is enabled in GitHub settings.
