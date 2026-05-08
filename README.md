# B737 Study App

Pilot-focused B737 study dashboard with Supabase-backed questions, protected manual catalog access, and raw manual chunk search.

## Local Setup

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run lint
npm run manuals:manifest
npm run manuals:check
```

Create `.env.local` with the browser-safe Supabase values used by Vite:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Optional for local read-only storage metadata validation:

```text
SUPABASE_SERVICE_ROLE_KEY=...
```

The validation script reports whether a service role key is present, but never prints secret values.

## Supabase Requirements

Apply the migrations in `supabase/migrations/` in order. The manual pipeline expects:

- `public.manual_documents`
- `public.manual_chunks`
- private Supabase Storage bucket `manuals`
- authenticated-only read policy on `storage.objects` for the `manuals` bucket
- active manual catalog rows with `code`, `title`, `storage_bucket`, `storage_path`, and `status`

Migration `009_manuals_bucket_and_catalog_v3_9.sql` creates or updates the private `manuals` bucket and seeds the verified manual catalog rows idempotently.

## Manual PDF Safety Rules

- Do not commit PDF manuals to GitHub.
- Do not place manuals in `public/`.
- Keep source PDFs under ignored local paths such as `data/manuals-local/`.
- Upload manuals only to the private Supabase Storage bucket.
- Do not expose `.env.local` values in logs, screenshots, commits, or generated reports.

## Manual Indexing Flow

1. Upload verified PDF manuals to Supabase Storage under the paths stored in `manual_documents.storage_path`.
2. Place matching local PDFs under `data/manuals-local/`.
3. Generate the local manifest:

```bash
npm run manuals:manifest
```

4. Validate extraction locally:

```bash
npm run manuals:index:dry
```

5. Generate chunk preview and SQL:

```bash
npm run manuals:index -- --write
```

6. Review `data/generated/manual_chunks_preview.json` and `data/generated/manual_chunks_insert.sql`.
7. Execute the reviewed chunk SQL in Supabase.
8. Run the pipeline check:

```bash
npm run manuals:check
```

## Manual Chunk SQL Too Large For Supabase SQL Editor

If Supabase SQL Editor rejects `data/generated/manual_chunks_insert.sql` because the query is too large, split it locally:

```bash
npm run manuals:chunks:split
```

Import the generated files in `data/generated/manual_chunks_sql_parts/` one by one through Supabase SQL Editor. Do not commit generated manual content.

## AI Status

Internal AI answers are disabled. No OpenAI API key is required, and no Supabase Edge Function deployment is required. The app does not call an AI provider from React or from Supabase.

ChatGPT Plus can be used externally by copying a manual excerpt and page reference from Raw Manual Chunk Search. The app remains focused on private manual access, manual catalog review, raw manual chunk search, and manual/page references.

## Raw Manual Chunk Search

Raw Manual Chunk Search remains available as a technical fallback. It is keyword/ranked chunk search through Supabase `manual_chunks`, not AI. Use exact Boeing/manual terminology where possible, such as `speed trim` instead of `trim speed`. Use search results to find the relevant manual, page number, and excerpt, then verify in the official manual.
