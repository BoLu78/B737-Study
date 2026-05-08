# Manual Search Relevance v6.3 Report

## CURRENT STATUS

Manual Chunk Search is visible in the Manual References page and remains non-AI keyword search against imported `public.manual_chunks` rows.

## CHANGED FILES

- `src/App.jsx`
- `src/App.css`
- `src/lib/supabaseClient.js`
- `scripts/check-manual-search.js`
- `supabase/migrations/010_manual_chunks_search_relevance_v6_3.sql`
- `package.json`
- `package-lock.json`
- `README.md`

## SEARCH BEHAVIOR BEFORE

Manual chunk search used a basic frontend Supabase query and stable ordering. Results could surface generic preface, abbreviation, limitation, or front-matter chunks before more useful system content.

## SEARCH BEHAVIOR AFTER

Manual chunk search prefers the new `public.search_manual_chunks` RPC. Ranking now prioritizes exact phrase matches, title/manual-code phrase matches, all query words present in chunk text, full-text matches, then partial fallback matches. Low-value front matter is penalized rather than removed.

## RPC FUNCTION

Migration `010_manual_chunks_search_relevance_v6_3.sql` creates or replaces:

`public.search_manual_chunks(search_query, aircraft_filter, manual_type_filter, result_limit)`

The RPC returns active manual chunks with `rank_score`, ordered best-first.

## FALLBACK BEHAVIOR

If the RPC is unavailable or fails, `loadManualChunksSearch` falls back to direct `manual_chunks` queries and applies local ranking in the browser. No AI provider is called.

## TEST QUERIES

Use:

```bash
npm run manuals:search:check
```

Sample queries:

- `speed trim`
- `hydraulic`
- `rejected takeoff`
- `autopilot`

The helper prints the top 5 results with manual code, page, rank score, and a short excerpt. It hides secrets.

## NEXT PATCH RECOMMENDATION

Apply migration 010 in Supabase, run `npm run manuals:search:check`, then tune ranking weights only if real query samples still surface front matter above relevant system pages.
