# CSV Question Bank v8.2 Report

## CURRENT STATUS

- App version is v8.2.
- `data/import/questions.csv` exists and is the canonical active source.
- `data/import/questions.xlsx` exists and remains a backup/editing source only.
- `data/generated/questions.json` is generated from the CSV and is the runtime question bank.
- The old PDF-derived question JSON is no longer used by the app runtime.

## CSV BUILD PIPELINE

- Added `scripts/build-questions.mjs`.
- Added npm script: `npm run build:questions`.
- The script reads `data/import/questions.csv`, handles UTF-8 BOM, semicolon delimiters, quoted cells, and quoted multiline cells.
- The script maps CSV columns into the canonical schema:
  - `ID` -> `id`
  - `Question` -> `question`
  - `AnswerOne`/`AnswerTwo`/`AnswerThree`/`AnswerFour` -> keyed options
  - `Correct` 1/2/3/4 -> A/B/C/D
  - `Argument` -> `topic`

## VALIDATION RESULT

- Total imported rows: 645.
- Total generated questions: 645.
- Total valid questions: 645.
- Total invalid questions: 0.
- Total suspicious questions from build validation: 210.
- 2-option questions: 43.
- 3-option questions: 13.
- 4-option questions: 589.
- Invalid IDs: none.
- Missing-topic IDs: 536.
- Question ID 536 is retained and assigned topic `Uncategorized`.

## QUESTION 33 ACCEPTANCE CHECK

Question ID 33 in `data/generated/questions.json` is:

- Question: `What causes the PACK light to illuminate?`
- A: `Failure of either primary or standby pack control`
- B: `Temperature upstream of the pack has exceeded limits`
- C: `Failure of both primary and standby pack controls`
- D: `Excessive air pressure in the pack`
- Correct: `C`
- Topic: `Air system`

Option B does not contain option C text. Option C does not contain standalone `rols`.

## RUNTIME CHANGES

- `src/App.jsx` imports `data/generated/questions.json` directly.
- Runtime question objects are mapped from canonical CSV-generated data into the existing quiz shape.
- Variable answer counts are supported through `options`, so 2-, 3-, and 4-option questions render only their real answers.
- Source question IDs still display from the generated CSV `id`.
- Final Test still draws randomized questions from the full generated question bank.

## CACHE / LOCAL STORAGE

The personal-progress localStorage keys were bumped for v8.2:

- `b737StudyProgress_v8_2`
- `b737StudyTopicStats_v8_2`
- `b737StudyInProgressTopicSessions_v8_2`
- `b737StudyMarkedQuestions_v8_2`

This prevents old corrupted question-progress state from remaining active after deployment.

## WHAT WAS NOT CHANGED

- Quiz scoring logic was not changed.
- Correct answer letters were not rewritten beyond the CSV 1-4 to A-D mapping.
- Supabase schema was not changed.
- Manual support and raw manual chunk search were not removed.
- Final Test randomization, marked questions, stats, and progress tracking remain local/browser-based.
- No AI was added.

## TESTED BEHAVIOR

- `npm run build:questions`
- `npm run questions:audit-text`
- `npm run questions:audit-source-ids`
- `npm run finaltest:test-selection`
- `npm run questions:test-cleaner`
- `npm run build`
- `npm run lint -- --max-warnings=0`
- Verified `data/import/questions.csv`, `data/import/questions.xlsx`, and `data/generated/questions.json` exist.
- Verified Question ID 33 exact text/options/correct answer.
- Verified at least one 2-option True/False question is present.

## NEXT PATCH RECOMMENDATION

Add a small generated HTML or Markdown validation artifact for suspicious CSV rows so the user can review data quality issues without reading terminal output.
