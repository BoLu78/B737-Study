# Manual AI Disabled v6.5 Report

## CURRENT STATUS

The project is moving to v6.5. Manual access remains private through Supabase Storage, the manual catalog remains visible, and Raw Manual Chunk Search remains available for finding relevant excerpts and page references.

## WHY INTERNAL AI WAS DISABLED

The user decided not to use paid API keys inside this app. Explanations will be handled externally with ChatGPT Plus when desired. The app should stay focused on finding authoritative manual references rather than generating internal AI answers.

## WHAT WAS REMOVED OR DISABLED

- Removed the active Manual AI Answer UI from Manual References.
- Removed the frontend `askManuals()` helper that called the Supabase Edge Function.
- Removed the `manual-answer` Supabase Edge Function source.
- Removed the local `manuals:ai:test` script and helper.
- Removed active README setup steps for OpenAI secrets and Edge Function deployment.

## WHAT STILL WORKS

- Supabase-backed question database and quiz behavior.
- Existing question/source metadata search.
- Private manual PDF access through signed Supabase Storage URLs.
- Manual Library catalog cards and Open manual buttons.
- Raw Manual Chunk Search against imported `manual_chunks`.
- Manual/page/chunk/storage-path display in search results.

## USER WORKFLOW

1. Open Manual References.
2. Use Raw Manual Chunk Search with exact manual terminology.
3. Review matching manual title/code, page number, chunk index, excerpt, and storage path.
4. Open the private manual PDF and verify the official page.
5. For an external explanation, copy the excerpt and page reference into ChatGPT Plus.

## NEXT PATCH RECOMMENDATION

Add a copy button on each raw chunk result to copy the excerpt plus manual title/code and page number in a clean citation format for external study workflows.
