# Manual Pipeline Foundation Report v3.9

## CURRENT STATUS

The non-AI manual pipeline foundation is now wired in code and migrations. The frontend still uses direct chunk search only, and the disabled "Ask manuals" button remains disabled.

Local validation with `npm run manuals:check` confirmed:

- Supabase connection: ok
- Active manual catalog rows: 9
- Manual file path metadata: ok
- Rows pointing at `manuals` bucket: 9/9
- `manuals` storage bucket: not confirmed in the current Supabase project
- Active manual chunks: 0

## CHANGED FILES

- `supabase/migrations/009_manuals_bucket_and_catalog_v3_9.sql`
- `scripts/check-manual-pipeline.js`
- `package.json`
- `package-lock.json`
- `README.md`
- `src/App.jsx`
- `data/generated/manual_pipeline_v3.9_report.md`

## WHAT IS NOW CONNECTED

- Migration 009 creates or updates the private `manuals` Supabase Storage bucket.
- Migration 009 preserves authenticated-only manual object reads.
- Migration 009 seeds/upserts verified manual catalog rows into `public.manual_documents`.
- Catalog upsert logic is idempotent and uses stable manual `code` values as the matching key.
- `npm run manuals:check` runs a read-only manual pipeline validation.
- README now documents setup, Supabase requirements, PDF safety rules, manual indexing, validation, and the AI limitation.
- Internal package version is `3.9.0`; visible app version is `v3.9`.

## WHAT IS STILL NOT CONNECTED

- Manual PDFs are not uploaded by any script.
- `manual_chunks` SQL is still generated locally and must be reviewed/imported manually.
- No RPC search function exists.
- No Edge Function exists.
- No AI provider call exists.
- `manual_ai_queries` is still not used by the frontend or scripts.
- The "Ask manuals" button remains disabled.

## REQUIRED MANUAL ACTIONS IN SUPABASE

1. Apply migration `009_manuals_bucket_and_catalog_v3_9.sql`.
2. Verify the `manuals` bucket exists and remains private.
3. Upload the verified manual PDFs to the exact paths in `manual_documents.storage_path`.
4. Copy `data/manuals-local/manuals-manifest.example.json` to `data/manuals-local/manuals-manifest.json`.
5. Point the manifest entries at local PDF files and matching `manual_document_code` values.
6. Run `npm run manuals:index:dry`.
7. Run `npm run manuals:index -- --write`.
8. Review `data/generated/manual_chunks_preview.json` and `data/generated/manual_chunks_insert.sql`.
9. Execute the reviewed chunk SQL in Supabase.
10. Run `npm run manuals:check` again and confirm the bucket is present and active chunk count is greater than 0.

## NEXT PATCH RECOMMENDATION

After the bucket, PDF uploads, catalog rows, and chunks are verified, add a secure Supabase Edge Function for AI answers with citations. Keep provider keys server-side, retrieve relevant `manual_chunks` in the backend, and only then enable the existing "Ask manuals" UI.
