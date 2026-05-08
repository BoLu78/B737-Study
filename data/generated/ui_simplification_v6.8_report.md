# UI Simplification v6.8 Report

## CURRENT STATUS

The project is moving to v6.8. The app remains focused on question practice and final-test preparation, with manual references available as secondary support.

## UI PROBLEMS FIXED

- Removed the duplicated dashboard hero/title.
- Shortened dashboard copy.
- Reduced primary action card height and text.
- Replaced rough sidebar symbols with clean text-only navigation.
- Removed topic progress bars where no persistent progress data exists.
- Kept manual references as a compact secondary support card.
- Replaced the large Supabase warning banner with a compact status chip.

## SUPABASE ENV FIX

The GitHub Pages workflow now passes Vite Supabase environment variables to the build step:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

No Supabase values are hardcoded.

## GITHUB SECRETS REQUIRED

Create these in:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Required secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## CHANGED FILES

- `.github/workflows/deploy.yml`
- `README.md`
- `package.json`
- `package-lock.json`
- `src/App.jsx`
- `src/App.css`
- `data/generated/ui_simplification_v6.8_report.md`

## WHAT STILL WORKS

- Supabase question loading when Vite env vars are configured.
- Local fallback when Supabase env vars are missing.
- Topic practice.
- Final test entry.
- Manual catalog and private manual opening.
- Raw manual chunk search.
- No internal AI.

## NEXT PATCH RECOMMENDATION

Add lightweight client-side practice progress tracking in local storage so Studied, Accuracy, and Weak Topics can show real values instead of safe placeholders.
