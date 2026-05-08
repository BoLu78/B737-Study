# Manual Chunks SQL Split Report v6.0

## CURRENT STATUS

The full local manual chunk SQL import was successfully split into smaller independently executable SQL files for Supabase SQL Editor.

AI answer generation remains disabled. The "Ask manuals" button remains disabled.

## ORIGINAL FULL SQL

- Source file: `data/generated/manual_chunks_insert.sql`
- Status: preserved
- Size: 12,269,645 bytes
- Chunk count from preview JSON: 7,600
- Problem addressed: Supabase SQL Editor rejected the full file because the query was too large.

## SPLIT STRATEGY

The split workflow reads `data/generated/manual_chunks_preview.json` as the source of truth and regenerates SQL parts using the same upsert pattern as the original full SQL:

- JSON payload per part
- `jsonb_to_recordset`
- join to `public.manual_documents` on `manual_documents.code = payload.manual_document_code`
- insert/upsert into `public.manual_chunks`
- conflict target `(manual_document_id, page_number, chunk_index)`
- `status = 'active'`

Each part is independent and does not require a previous part to have run.

## BATCH SIZE

- Default batch size: 500 chunks per SQL file
- Command used: `npm run manuals:chunks:split`
- Custom batch size is available with:

```bash
node scripts/split-manual-chunks-sql.js --batch-size 300
```

## GENERATED PART FILES

Output directory:

- `data/generated/manual_chunks_sql_parts/`

Generated files:

- `manual_chunks_insert_part_001.sql` - 500 chunks - 940,633 bytes
- `manual_chunks_insert_part_002.sql` - 500 chunks - 908,693 bytes
- `manual_chunks_insert_part_003.sql` - 500 chunks - 787,290 bytes
- `manual_chunks_insert_part_004.sql` - 500 chunks - 802,640 bytes
- `manual_chunks_insert_part_005.sql` - 500 chunks - 705,753 bytes
- `manual_chunks_insert_part_006.sql` - 500 chunks - 571,701 bytes
- `manual_chunks_insert_part_007.sql` - 500 chunks - 775,308 bytes
- `manual_chunks_insert_part_008.sql` - 500 chunks - 937,201 bytes
- `manual_chunks_insert_part_009.sql` - 500 chunks - 969,486 bytes
- `manual_chunks_insert_part_010.sql` - 500 chunks - 747,229 bytes
- `manual_chunks_insert_part_011.sql` - 500 chunks - 764,215 bytes
- `manual_chunks_insert_part_012.sql` - 500 chunks - 766,644 bytes
- `manual_chunks_insert_part_013.sql` - 500 chunks - 728,028 bytes
- `manual_chunks_insert_part_014.sql` - 500 chunks - 729,051 bytes
- `manual_chunks_insert_part_015.sql` - 500 chunks - 947,716 bytes
- `manual_chunks_insert_part_016.sql` - 100 chunks - 216,633 bytes

Largest part size: 969,486 bytes.

## SUPABASE IMPORT INSTRUCTIONS

1. Open each file in `data/generated/manual_chunks_sql_parts/`.
2. Copy the full content of one part at a time.
3. Paste it into Supabase SQL Editor.
4. Run it.
5. Wait for success.
6. Continue with the next part.
7. After all parts are imported, run:

```bash
npm run manuals:check
```

Expected result: active manual chunks greater than 0, ideally around 7,600.

## FINAL CHECK COMMAND

```bash
npm run manuals:check
```

## NEXT PATCH RECOMMENDATION

After all split SQL parts are imported and `npm run manuals:check` confirms active manual chunks, add a secure backend-only AI answer function with citations. Keep provider keys out of the browser and keep the "Ask manuals" button disabled until that backend is verified.
