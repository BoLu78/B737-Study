# Question Source ID Alignment v7.5 Report

## CURRENT STATUS

- App version is v7.5.
- The shared Supabase question table already stores the original NEOS/PDF table ID in `source_id`.
- Audit scanned 645 active Supabase questions.
- Questions with source question ID: 645.
- Questions missing source question ID: 0.
- Duplicate source question IDs within the same source document/revision: 0.

## PROBLEM

The app previously exposed internal database row IDs in places where the user expected the original NEOS question number. Those internal IDs, such as 1345 or 1346, are not useful for cross-checking against the source PDF/table.

## SOURCE ID FIELD FOUND OR CREATED

- Existing field found: `public.questions.source_id`.
- No schema migration was needed.
- No backfill SQL was needed because current Supabase rows already have full `source_id` coverage.

## UI CHANGES

- Practice screen now displays `Question ID: X` using `source_id`.
- Database browse/list view now displays `Question ID` using `source_id` instead of internal row ID.
- Manual/source metadata cards now show `Question ID` using `source_id`.
- Admin/source metadata copy was clarified to `Source question ID`.
- If a source ID is unavailable, the UI falls back to `—` instead of showing an internal row ID as the source question number.

## IMPORT PIPELINE CHANGES

- Existing import pipeline already preserves the NEOS/PDF source ID:
  - `scripts/extract-t73-pdf.js` extracts `source_id`.
  - `scripts/generate-t73-sql.js` writes `source_id`.
  - `scripts/import-t73-to-supabase.js` upserts using `source_id`.
- No import script change was required for v7.5.

## BACKFILL STATUS

- Backfill file was not generated because it is not required.
- `data/generated/t73_r01_questions.json` and the Supabase `questions` table already include source IDs.

## AUDIT RESULT

- Added `scripts/audit-question-source-ids.js`.
- Added npm script: `npm run questions:audit-source-ids`.
- Generated audit report: `data/generated/question_source_id_audit_v7.5.md`.
- Result: full source ID coverage, no missing IDs, no duplicate IDs.

## CHANGED FILES

- `src/App.jsx`
- `package.json`
- `package-lock.json`
- `README.md`
- `scripts/audit-question-source-ids.js`
- `data/generated/question_source_id_audit_v7.5.md`
- `data/generated/question_source_id_alignment_v7.5_report.md`

## NEXT PATCH RECOMMENDATION

Add a small source metadata QA check to the regular import workflow so future imported revisions fail fast when `source_id` is missing or duplicated within the same source document/revision.
