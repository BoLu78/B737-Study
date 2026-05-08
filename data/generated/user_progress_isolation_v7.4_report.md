# B737 Study App v7.4 User Progress Isolation Report

## CURRENT STATUS

The app is bumped to v7.4. Shared Supabase data remains read-only for question study progress. Personal progress is local to the browser/device.

## SUPABASE WRITE AUDIT

Searched the frontend code for Supabase write operations:

- `.insert(`
- `.update(`
- `.upsert(`
- `.delete(`

No progress, topic stats, final test result, wrong-answer, attempt, accuracy, or studied-count writes to Supabase were found.

The only `.delete(` match in runtime app code is `Set.delete()` for the local Mark for Review UI state, not a Supabase delete operation. Import/indexing scripts may contain Supabase writes for question/manual maintenance, but they are not used by the app runtime for personal progress.

Supabase is used to:

- Read active questions.
- Read manual document metadata.
- Read/search manual chunks.
- Authenticate manual access.
- Generate private Storage signed URLs.

## LOCAL STORAGE KEYS

Local progress namespace:

- `b737StudyProgress_v1`
- `b737StudyTopicStats_v1`

Current persisted topic performance uses `b737StudyTopicStats_v1`. Final test and wrong-answer review session details remain component state only and are not written to Supabase.

## SETTINGS NOTE

Settings now states: study progress is stored locally in this browser and is not shared with other users.

## RESET BEHAVIOR

Added a Settings reset action:

- Label: `Reset local study progress`
- Confirms before clearing.
- Clears only local progress keys.
- Does not delete questions.
- Does not affect Supabase.
- Does not affect other users, devices, or browser profiles.

## README UPDATE

README now documents:

- Supabase stores shared question/manual data.
- Browser local storage stores personal progress.
- App link sharing does not mix progress across devices/browsers.
- Results can mix only when people share the same browser profile/device.

## CHANGED FILES

- `src/App.jsx`
- `src/App.css`
- `README.md`
- `package.json`
- `package-lock.json`
- `data/generated/user_progress_isolation_v7.4_report.md`

## NEXT PATCH RECOMMENDATION

If multi-device progress sync is ever needed, add authenticated per-user progress tables with row-level security. Until then, keep study progress local to avoid shared-result leakage.
