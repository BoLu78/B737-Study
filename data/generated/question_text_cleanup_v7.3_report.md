# B737 Study App v7.3 Question Text Cleanup Report

## CURRENT STATUS

The app is bumped to v7.3. Imported question and answer text now passes through a display-time cleaner for obvious PDF extraction artifacts.

## PROBLEM EXAMPLES

- `Upper Displa y Unit` now displays as `Upper Display Unit`.
- `top left sid if each display` now displays as `top left side of each display`.
- `condition s exist` now displays as `conditions exist`.
- `answer s are correct` now displays as `answers are correct`.

## CLEANER IMPLEMENTED

Added reusable utilities:

- `src/utils/questionTextCleaner.js`
- `src/utils/questionTextCorrections.js`

The cleaner applies deterministic spacing and phrase corrections only. It preserves original case, IDs, answer keys, numbers, units, and aviation abbreviations.

## UI AREAS UPDATED

- Topic practice question text.
- Topic practice answer choices.
- Wrong-answer review selected/correct answer text.
- Question database table question text.
- Manual References question/reference cards.
- Admin question list display.

## AUDIT TOOL

Added:

- `scripts/audit-question-text.js`
- `scripts/test-question-text-cleaner.js`

NPM scripts:

- `npm run questions:test-cleaner`
- `npm run questions:audit-text`

The audit writes `data/generated/question_text_audit_v7.3.md`.

## WHAT WAS NOT CHANGED

- Supabase question records are not modified automatically.
- Correct answer letters and indexes are unchanged.
- Question IDs are unchanged.
- Quiz correctness logic is unchanged.
- Supabase schema is unchanged.
- No AI was added.

## CHANGED FILES

- `src/App.jsx`
- `src/utils/questionTextCleaner.js`
- `src/utils/questionTextCorrections.js`
- `scripts/audit-question-text.js`
- `scripts/test-question-text-cleaner.js`
- `README.md`
- `package.json`
- `package-lock.json`
- `data/generated/question_text_audit_v7.3.md`
- `data/generated/question_text_cleanup_v7.3_report.md`

## NEXT PATCH RECOMMENDATION

Review the audit report and add a small number of precise correction-map entries for the most common safe artifacts, especially repeated flight-deck words split by PDF extraction.
