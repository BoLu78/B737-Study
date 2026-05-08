# B737 Study App

Pilot-focused B737 question study app for topic practice and final-test preparation, with protected manual catalog access and raw manual chunk search as secondary support.

## Local Setup

```bash
npm install
npm run dev
```

Local dev command:

```bash
npm run dev
```

Build command:

```bash
npm run build
```

GitHub Pages URL:

```text
https://bolu78.github.io/B737-Study/
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

## GitHub Pages Deployment

The deployed app is built for:

```text
https://bolu78.github.io/B737-Study/
```

GitHub Pages builds need the browser-safe Supabase values as repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use the project URL format for `VITE_SUPABASE_URL`, for example:

```text
https://gqziskajamzcinvbyheq.supabase.co
```

Do not use the REST endpoint form:

```text
https://gqziskajamzcinvbyheq.supabase.co/rest/v1/
```

Add them in GitHub:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

After changing secrets, rerun the GitHub Actions deploy workflow or push a new commit. Do not commit Supabase keys to the repository. The deploy workflow checks that required secrets are present, but does not print their values.

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

## Study Workflow

The dashboard is focused on the core study actions only:

- Continue resumes the current topic session.
- Practice by Topic opens the full Topics page.
- Final Test starts an exam-style run from the loaded question bank.
- Compact metrics show loaded questions, answered questions, accuracy, and weak-topic count.
- Topic Performance shows strengths, weak areas, and topics not studied yet.

Topic selection lives in the Topics page so the dashboard does not show a partial or confusing topic list.

Topic performance is stored locally in the browser using completed practice sessions. Supabase remains the source for the question database; no Supabase progress tables are required.

During topic practice:

- Topic practice shows a session result summary after completion.
- Wrong answers can be reviewed after the session.
- The question flow does not show manual support cards, difficulty badges, or static explanation/manual-reference boxes.
- Imported question text is cleaned at display time for obvious PDF extraction artifacts.

Manuals are secondary support. Use Manual References and Raw Manual Chunk Search outside the question flow to find official manual/page references, then verify in the private manual PDF.

Original Supabase question records are not automatically modified by display cleanup. To inspect imported text quality, run:

```bash
npm run questions:test-cleaner
npm run questions:audit-text
```

## Raw Manual Chunk Search

Raw Manual Chunk Search remains available as a technical fallback. It is keyword/ranked chunk search through Supabase `manual_chunks`, not AI. Use exact Boeing/manual terminology where possible, such as `speed trim` instead of `trim speed`. Use search results to find the relevant manual, page number, and excerpt, then verify in the official manual.
