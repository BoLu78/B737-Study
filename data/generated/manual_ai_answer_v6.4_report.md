# Manual AI Answer v6.4 Report

## CURRENT STATUS

The app is moving from v6.3 to v6.4. Manual documents and chunks remain private/imported through Supabase, and Raw Manual Chunk Search remains available as a technical fallback.

## WHY RAW SEARCH WAS NOT ENOUGH

Raw chunk search returns excerpts, but pilot study questions need a concise explanation synthesized from the best matching manual chunks. The user should see a useful answer plus manual/page citations, not just a list of matching text fragments.

## PROVIDER CHOICE

The v6.4 backend uses the OpenAI Responses API from a Supabase Edge Function. The default model is `gpt-5.4-mini` to control cost. The model can be overridden with the Supabase secret `OPENAI_MODEL`.

## EDGE FUNCTION

Added `supabase/functions/manual-answer/index.ts`.

The function requires POST, validates the Supabase Auth bearer token, validates the question, retrieves up to 12 active manual chunks, prefers `public.search_manual_chunks`, falls back to direct `manual_chunks` keyword search, and calls OpenAI server-side only. It returns `answer`, `citations`, `used_chunks`, and `model`.

## FRONTEND CHANGES

Added `askManuals(question, filters)` in `src/lib/supabaseClient.js`.

Added a Manual AI Answer section in Manual References above Raw Manual Chunk Search. It supports aircraft/manual type filters, loading and error states, answer display, citations, used chunk count, and model display. Raw Manual Chunk Search remains visible and unchanged as fallback search.

## REQUIRED SUPABASE SECRETS

Required:

```bash
supabase secrets set OPENAI_API_KEY=your_key_here
```

Optional:

```bash
supabase secrets set OPENAI_MODEL=gpt-5.4-mini
```

No OpenAI provider key is used or exposed in frontend code.

## DEPLOYMENT STEPS

1. Apply database migrations through v6.3, including `010_manual_chunks_search_relevance_v6_3.sql`.
2. Set Supabase secrets for `OPENAI_API_KEY` and optionally `OPENAI_MODEL`.
3. Deploy the Edge Function:

```bash
supabase functions deploy manual-answer
```

4. Sign in to the app with a Supabase Auth user.
5. Ask a manual question from Manual References.

## TEST QUESTION

Use:

```text
Explain the Speed Trim System
```

Expected result: a concise technical explanation based on retrieved manual chunks, citation markers in the answer, a citations list showing manual title/code and page number, used chunk count, and model name.

## NEXT PATCH RECOMMENDATION

Add user-facing citation links that open the private PDF through signed Supabase Storage URLs and, if practical, navigate users to the cited page after opening the manual.
