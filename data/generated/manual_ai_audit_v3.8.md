# Manual Library + AI Search Audit v3.8

## CURRENT STATUS

The app has a partial, read-only manual library implementation. It can load active manual catalog rows from Supabase, create short-lived signed URLs for private manual files, and query `manual_chunks` with PostgREST full-text search plus an `ilike` fallback.

There is no active AI answer generation path yet. No RPC, Edge Function, embedding table, vector search, or AI provider call is present in the inspected code.

## DATA FLOW MAP

1. Question-bank PDF path:
   - `data/import/T73_R01_TEST_737_R01.pdf`
   - `scripts/extract-t73-pdf.js` extracts question rows to `data/generated/t73_r01_questions.json`.
   - `scripts/generate-t73-sql.js` turns that JSON into `data/generated/t73_r01_questions_insert.sql`.
   - `scripts/import-t73-to-supabase.js` attempts direct Supabase anon-key upsert into `public.questions`; RLS may block it.
   - Frontend loads active questions from `public.questions` through `loadQuestionsFromSupabase()`.

2. Manual-library path:
   - Local PDFs are expected under `data/manuals-local/`, driven by `data/manuals-local/manuals-manifest.example.json` copied to `manuals-manifest.json`.
   - `scripts/index-manuals-local.js` reads the manifest, extracts PDF page text, creates overlapping chunks, writes `data/generated/manual_chunks_preview.json`, and writes `data/generated/manual_chunks_insert.sql`.
   - The generated SQL joins chunks to `public.manual_documents` by `manual_documents.code`, then upserts into `public.manual_chunks`.
   - Manual PDF upload to Supabase Storage is not automated by the script.
   - Catalog seed SQL exists at `data/generated/manual_documents_seed_v5_3.sql`, but it is not a migration and is not called by npm scripts.

3. Frontend path:
   - `loadManualDocuments()` reads active rows from `public.manual_documents`.
   - `createSignedManualUrl()` creates a signed URL from the catalog row's `storage_bucket` and `storage_path`.
   - `loadManualChunksSearch()` queries `public.manual_chunks` directly; it does not call an RPC.
   - `src/App.jsx` renders manual catalog cards and manual chunk search results.

## WORKING

- `manual_documents` exists in migration `005_manual_library_foundation.sql`.
- `question_manual_links` exists in migration `005_manual_library_foundation.sql`.
- `manual_chunks` exists in migration `008_manual_chunks_and_ai_search_foundation.sql`.
- `manual_ai_queries` exists in migration `008_manual_chunks_and_ai_search_foundation.sql`.
- Active-row read policies exist for `manual_documents`, `question_manual_links`, and `manual_chunks`.
- `storage.objects` has an authenticated read policy for bucket id `manuals` in migration `007_manuals_storage_authenticated_read.sql`.
- Frontend uses real Supabase data first for questions, manual catalog rows, manual signed URLs, and manual chunks.
- Frontend falls back to local demo questions only when Supabase questions are unavailable.
- The manual search display layer already exists and renders chunk snippets.

## NOT CONNECTED

- `public.manual_ai_queries` is not used by scripts or frontend.
- `public.question_manual_links` is not used by scripts or frontend.
- `data/generated/manual_documents_seed_v5_3.sql` is a manual seed artifact, not a migration.
- `scripts/index-manuals-local.js` creates preview and SQL files only; it does not upload PDFs, insert catalog rows, execute SQL, call Supabase, or call AI.
- `scripts/import-t73-to-supabase.js` imports question rows, not manuals or chunks.
- The "Ask manuals" button is disabled in `src/App.jsx`.
- No RPC search function is defined in migrations.
- No AI provider call, embedding generation, vector column, vector extension, or Edge Function is defined.

## SCHEMA CHECK

Manual catalog fields used by frontend and scripts are present:

- `manual_documents`: `id`, `title`, `code`, `aircraft`, `manual_type`, `revision`, `storage_bucket`, `storage_path`, `status`, `notes`.
- `manual_chunks`: `id`, `manual_document_id`, `manual_code`, `aircraft`, `manual_type`, `title`, `storage_bucket`, `storage_path`, `page_number`, `chunk_index`, `chunk_text`, `token_estimate`, `source_hash`, `status`.

Question import fields are only partially covered by the visible migrations:

- Migration `004_questions_source_metadata.sql` adds `source_id`, `source_revision`, `source_page`, and `import_batch`.
- The base `public.questions` table and core columns referenced by scripts/frontend are not created in migrations `004` through `008`; they must come from an earlier migration or an already-existing Supabase table.

Storage is only partially covered:

- A storage read policy exists for bucket id `manuals`.
- No migration creates the `manuals` storage bucket.
- No script uploads manual PDFs into storage.

## MISSING

The exact missing step for current non-AI manual search is data population:

1. Create/verify the private `manuals` Supabase Storage bucket.
2. Upload manual PDFs to the paths stored in `manual_documents.storage_path`.
3. Execute or migrate the manual catalog seed so active `manual_documents` rows exist.
4. Copy `data/manuals-local/manuals-manifest.example.json` to `data/manuals-local/manuals-manifest.json` and point it at local PDFs.
5. Run `npm run manuals:index:dry` or `npm run audit:manuals` to validate extraction.
6. Run `npm run manuals:index -- --write` to generate chunk SQL from real PDFs.
7. Review and execute `data/generated/manual_chunks_insert.sql` in Supabase.

The missing step for true AI search is separate:

- Add a backend RPC or Edge Function that retrieves relevant `manual_chunks`, records/uses `manual_ai_queries` if desired, calls an AI provider securely server-side, and returns an answer with citations. The frontend currently has no enabled AI call target.

## NEXT PATCH RECOMMENDATION

Make the next patch a small backend/data patch, not a UI rewrite:

1. Add a Supabase migration that creates the private `manuals` bucket if missing and optionally seeds verified `manual_documents` rows.
2. Add a secure server-side import path for `manual_chunks_insert.sql` or document the manual SQL step clearly.
3. Add a minimal `search_manual_chunks` RPC only if direct PostgREST search is not sufficient; otherwise keep the current frontend direct chunk search.
4. After chunks are populated and verified, add an Edge Function for AI answers and enable the existing disabled "Ask manuals" control.

## MINIMAL FIXES APPLIED IN THIS PATCH

- Updated the visible app version from `v5.6` to `v3.8`.
- Updated package metadata from `0.0.0` to `3.8.0`.
- Added `npm run audit:manuals` as a dry-run wrapper around the existing local manual indexer.
- Updated signed manual URL creation to use the catalog row's `storage_bucket`, falling back to `manuals`.
