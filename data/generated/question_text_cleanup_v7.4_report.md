# B737 Study App v7.4 Question Text Cleanup Report

## CURRENT STATUS

The app remains at v7.4 and now has stronger display-time cleanup for PDF extraction split-word artifacts in imported question and answer text.

## NEW CLEANUP RULES

- Added dictionary-based split-word repair.
- Repairs only when the joined result is in the known correction dictionary.
- Handles one internal split, such as `shutof f` to `shutoff`.
- Handles isolated-letter splits, such as `ri g ht` to `right`.
- Preserves capitalization, such as `Displa y` to `Display`.
- Keeps corrections display-only and does not write cleaned text back to Supabase.

## EXAMPLES FIXED

- `Lock th e mask` displays as `Lock the mask`.
- `aft bottom ri g ht side` displays as `aft bottom right side`.
- `oxygen pressure d isplayed` displays as `oxygen pressure displayed`.
- `oxygen shutof f valve` displays as `oxygen shutoff valve`.
- `Upper Displa y Unit` displays as `Upper Display Unit`.
- `condition s exist` displays as `conditions exist`.
- `answer s are correct` displays as `answers are correct`.
- `top left sid if each display` displays as `top left side of each display`.

## UI AREAS USING CLEANER

- Topic practice question text.
- Final test question text.
- Answer choices.
- Correct/wrong answer feedback.
- Wrong-answer review.
- Question database table.
- Manual reference question cards.
- Admin question list display.

## AUDIT RESULT SUMMARY

`npm run questions:audit-text` scanned 645 active Supabase questions and generated `data/generated/question_text_audit_v7.4.md`.

The audit found 254 suspicious questions after the stronger detector pass. Remaining recurring patterns include additional split fragments such as `draulic s`, `emer g`, and `onl y`, which should be reviewed before adding more dictionary entries.

## WHAT WAS NOT CHANGED

- Question IDs were not changed.
- Correct answer letters were not changed.
- Selected answer and score logic were not changed.
- Supabase records are not modified automatically.
- Supabase schema was not changed.
- Manual support and GitHub Pages deploy were not changed.
- No AI was added.

## NEXT PATCH RECOMMENDATION

Review the v7.4 audit report and add another small batch of safe dictionary words for high-frequency artifacts, prioritizing unambiguous aviation terms and avoiding broad automatic joins.
