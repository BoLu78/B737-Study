# B737 Study App v7.1 UI Declutter Report

## CURRENT STATUS

The app is now focused on question study from the first screen. Version is bumped to v7.1.

## REMOVED FROM PRACTICE SCREEN

- Removed the normal practice sidebar labeled Study aids.
- Removed the Open Manual Support button from active question practice.
- Removed default manual-support messaging from the question flow.

## REMOVED FROM DASHBOARD

- Removed the Manual Reference support panel.
- Removed Open Manuals, Browse Question Database, View Statistics, and Refresh Database from the dashboard footer area.
- Removed the partial Practice areas topic grid from the dashboard.

## TOPICS PAGE STATUS

The Topics page remains available from the sidebar and shows the full topic list from the loaded question bank. Each topic still shows its question count and a Practice action.

## WHAT STILL WORKS

- Question loading from Supabase with local fallback.
- Dashboard primary actions: Continue, Practice by Topic, Final Test.
- Topic practice.
- Final test simulation.
- Session complete results.
- Wrong-answer review.
- Manual References page and Raw Manual Chunk Search, now reachable from Settings.
- No internal AI workflow is enabled.

## CHANGED FILES

- `src/App.jsx`
- `src/App.css`
- `README.md`
- `package.json`
- `package-lock.json`
- `data/generated/ui_declutter_v7.1_report.md`

## NEXT PATCH RECOMMENDATION

Add lightweight persistence for last topic and recent session progress so Continue can resume a more specific study state across browser reloads without adding backend schema changes.
