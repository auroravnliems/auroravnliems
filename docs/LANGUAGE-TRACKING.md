# Language Tracking System

This profile uses an automated system to track and visualize language distribution across all public repositories.

## How It Works

1. **GitHub Actions** runs `update-lang-chart.yml` daily at 06:00 UTC
2. The workflow executes `scripts/generate-langs.js` using Node.js 18
3. The script calls the GitHub API to fetch all non-forked, non-archived public repos
4. Language byte counts are aggregated across all repos
5. A custom SVG donut chart is generated at `assets/langs-donut.svg`
6. The README is updated with a cache-busting timestamp to force GitHub to re-render the image

## Files

| File | Purpose |
|---|---|
| `scripts/generate-langs.js` | Node.js script that fetches language data and generates the SVG |
| `assets/langs-donut.svg` | Generated SVG chart (auto-updated, do not edit manually) |
| `.github/workflows/update-lang-chart.yml` | GitHub Actions workflow that runs the script daily |

## Manual Run

You can trigger the workflow manually from the **Actions** tab → `Update languages chart` → **Run workflow**.

## Customization

To change the color palette, edit the `colors` array in `scripts/generate-langs.js`.  
To show more/fewer languages, change `.slice(0, 10)` to your desired count.
