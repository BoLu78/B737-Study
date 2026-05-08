import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const PREVIEW_INPUT_PATH = 'data/generated/manual_chunks_preview.json'
const OUTPUT_DIRECTORY = 'data/generated/manual_chunks_sql_parts'
const DEFAULT_BATCH_SIZE = 500
const REQUIRED_FIELDS = [
  'manual_document_code',
  'page_number',
  'chunk_index',
  'chunk_text',
  'token_estimate',
  'source_hash',
]
const DOLLAR_QUOTE_TAG = 'manual_chunks_part'

function parseBatchSize() {
  const batchSizeIndex = process.argv.indexOf('--batch-size')

  if (batchSizeIndex === -1) {
    return DEFAULT_BATCH_SIZE
  }

  const rawBatchSize = process.argv[batchSizeIndex + 1]
  const batchSize = Number(rawBatchSize)

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('--batch-size must be a positive integer.')
  }

  return batchSize
}

function padPartNumber(partNumber) {
  return String(partNumber).padStart(3, '0')
}

function validateChunk(chunk, index) {
  const missingFields = REQUIRED_FIELDS.filter((field) => chunk[field] === undefined || chunk[field] === null)

  if (missingFields.length > 0) {
    throw new Error(`Chunk ${index + 1} is missing required fields: ${missingFields.join(', ')}.`)
  }

  if (!String(chunk.manual_document_code).trim()) {
    throw new Error(`Chunk ${index + 1} has an empty manual_document_code.`)
  }

  if (!Number.isInteger(Number(chunk.page_number))) {
    throw new Error(`Chunk ${index + 1} has an invalid page_number.`)
  }

  if (!Number.isInteger(Number(chunk.chunk_index))) {
    throw new Error(`Chunk ${index + 1} has an invalid chunk_index.`)
  }

  if (typeof chunk.chunk_text !== 'string' || !chunk.chunk_text.trim()) {
    throw new Error(`Chunk ${index + 1} has empty chunk_text.`)
  }
}

function normalizeChunk(chunk) {
  return {
    manual_document_code: String(chunk.manual_document_code).trim(),
    page_number: Number(chunk.page_number),
    chunk_index: Number(chunk.chunk_index),
    chunk_text: chunk.chunk_text,
    token_estimate: Number.isInteger(Number(chunk.token_estimate)) ? Number(chunk.token_estimate) : null,
    source_hash: String(chunk.source_hash || '').trim(),
  }
}

function buildSql(chunks, partNumber, partCount) {
  const payload = JSON.stringify(chunks, null, 2)
  const dollarQuoteDelimiter = `$${DOLLAR_QUOTE_TAG}_${padPartNumber(partNumber)}$`

  if (payload.includes(dollarQuoteDelimiter)) {
    throw new Error(`Chunk payload contains SQL dollar quote delimiter ${dollarQuoteDelimiter}.`)
  }

  return `-- Manual chunks insert part ${padPartNumber(partNumber)} of ${padPartNumber(partCount)}.
-- Review before executing in Supabase SQL Editor.
-- Generated from local manual chunk preview JSON only.
-- Do not commit real manual content.

with payload as (
  select *
  from jsonb_to_recordset(${dollarQuoteDelimiter}${payload}${dollarQuoteDelimiter}::jsonb) as chunk_payload (
    manual_document_code text,
    page_number integer,
    chunk_index integer,
    chunk_text text,
    token_estimate integer,
    source_hash text
  )
),
resolved_chunks as (
  select
    manual_documents.id as manual_document_id,
    manual_documents.code as manual_code,
    manual_documents.aircraft,
    manual_documents.manual_type,
    manual_documents.title,
    manual_documents.storage_bucket,
    manual_documents.storage_path,
    payload.page_number,
    payload.chunk_index,
    payload.chunk_text,
    payload.token_estimate,
    payload.source_hash
  from payload
  join public.manual_documents
    on manual_documents.code = payload.manual_document_code
)
insert into public.manual_chunks (
  manual_document_id,
  manual_code,
  aircraft,
  manual_type,
  title,
  storage_bucket,
  storage_path,
  page_number,
  chunk_index,
  chunk_text,
  token_estimate,
  source_hash,
  status
)
select
  manual_document_id,
  manual_code,
  aircraft,
  manual_type,
  title,
  storage_bucket,
  storage_path,
  page_number,
  chunk_index,
  chunk_text,
  token_estimate,
  source_hash,
  'active'
from resolved_chunks
on conflict (manual_document_id, page_number, chunk_index)
do update set
  manual_code = excluded.manual_code,
  aircraft = excluded.aircraft,
  manual_type = excluded.manual_type,
  title = excluded.title,
  storage_bucket = excluded.storage_bucket,
  storage_path = excluded.storage_path,
  chunk_text = excluded.chunk_text,
  token_estimate = excluded.token_estimate,
  source_hash = excluded.source_hash,
  status = 'active',
  updated_at = now();
`
}

async function main() {
  const batchSize = parseBatchSize()
  const rawPreview = await fs.readFile(PREVIEW_INPUT_PATH, 'utf8')
  const chunks = JSON.parse(rawPreview)

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error(`${PREVIEW_INPUT_PATH} must contain a non-empty JSON array.`)
  }

  const normalizedChunks = chunks.map((chunk, index) => {
    validateChunk(chunk, index)
    return normalizeChunk(chunk)
  })

  const partCount = Math.ceil(normalizedChunks.length / batchSize)

  await fs.rm(OUTPUT_DIRECTORY, { recursive: true, force: true })
  await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true })

  const writtenFiles = []

  for (let index = 0; index < normalizedChunks.length; index += batchSize) {
    const partNumber = Math.floor(index / batchSize) + 1
    const partChunks = normalizedChunks.slice(index, index + batchSize)
    const fileName = `manual_chunks_insert_part_${padPartNumber(partNumber)}.sql`
    const filePath = path.join(OUTPUT_DIRECTORY, fileName)
    const sql = buildSql(partChunks, partNumber, partCount)

    await fs.writeFile(filePath, sql)

    writtenFiles.push({
      filePath,
      chunks: partChunks.length,
      bytes: Buffer.byteLength(sql),
    })
  }

  process.stdout.write('MANUAL CHUNKS SQL SPLIT v6.0\n')
  process.stdout.write(`Source preview: ${PREVIEW_INPUT_PATH}\n`)
  process.stdout.write(`Total chunks: ${normalizedChunks.length}\n`)
  process.stdout.write(`Batch size: ${batchSize}\n`)
  process.stdout.write(`Generated parts: ${writtenFiles.length}\n`)
  process.stdout.write(`Output directory: ${OUTPUT_DIRECTORY}\n`)
  process.stdout.write('Generated files:\n')

  writtenFiles.forEach((file) => {
    process.stdout.write(`- ${file.filePath} (${file.chunks} chunks, ${file.bytes} bytes)\n`)
  })

  process.stdout.write('No Supabase import, PDF operation, secret read, or AI call was executed.\n')
}

main().catch((error) => {
  process.stderr.write(`Manual chunk SQL split failed: ${error.message}\n`)
  process.exit(1)
})
