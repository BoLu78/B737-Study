# B737 Study App v7.2 Topic Performance Dashboard Report

## CURRENT STATUS

The app is bumped to v7.2. The dashboard remains study-first and now includes a compact topic performance view based on completed topic practice sessions.

## REMOVED COPY

Removed the old online-first cockpit footer sentence from rendered UI.

## TOPIC STATS STORAGE

Topic performance is stored locally in the browser with `localStorage` key `b737StudyTopicStats_v1`.

Tracked per topic:

- Topic name
- Total answered
- Correct count
- Wrong count
- Attempts count
- Best score
- Last score
- Last practiced timestamp

No Supabase schema changes were added.

## DASHBOARD PERFORMANCE SECTION

Added a compact Topic Performance section below the primary actions and metrics row. It shows all topics sorted by study need:

1. Needs Focus
2. Not Studied
3. Good
4. Strong

Each row shows topic name, accuracy, correct/answered count, wrong count, a small progress bar, status label, and a small Practice action.

## SESSION COMPLETION INTEGRATION

Completed topic practice sessions update local topic stats. Wrong-answer review does not create a new attempt. Final Test results are not mixed into topic stats.

## CHANGED FILES

- `src/App.jsx`
- `src/App.css`
- `README.md`
- `package.json`
- `package-lock.json`
- `data/generated/topic_performance_dashboard_v7.2_report.md`

## TESTED BEHAVIOR

- Build passed.
- Lint passed.
- Dashboard metrics now derive from local topic stats.
- Topic practice completion records local stats.
- Wrong-answer review remains separate from topic attempts.

## NEXT PATCH RECOMMENDATION

Add a small per-topic history drawer for recent attempts so the user can see score trend without adding backend persistence.
