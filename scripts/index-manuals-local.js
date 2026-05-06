import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import pdf from 'pdf-parse/lib/pdf-parse.js'

const MANIFEST_PATH = 'data/manuals-local/manuals-manifest.json'
const PREVIEW_OUTPUT_PATH = 'data/generated/manual_chunks_preview.json'
const SQL_OUTPUT_PATH = 'data/generated/manual_chunks_insert.sql'
const DEFAULT_MAX_CHARS = 2800
const CHUNK_OVERLAP_CHARS = 240
const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--write')

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

function createSourceHash(parts) {
  return crypto
    .createHash('sha256')
    .update(parts.join('|'))
    .digest('hex')
}

function splitIntoChunks(text, maxChars = DEFAULT_MAX_CHARS) {
  if (text.length <= maxChars) {
    return [text]
  }

  const chunks = []
  let start = 0

  while (start < text.length) {
    const hardEnd = Math.min(start + maxChars, text.length)
    const softEnd = text.lastIndexOf('. ', hardEnd)
    const end = softEnd > start + Math.floor(maxChars * 0.55) ? softEnd + 1 : hardEnd
    const chunk = text.slice(start, end).trim()

    if (chunk) {
      chunks.push(chunk)
    }

    if (end >= text.length) {
      break
    }

    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1)
  }

  return chunks
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function extractPdfPages(filePath) {
  const buffer = await fs.readFile(filePath)
  const pages = []
  let pageNumber = 0

  await pdf(buffer, {
    pagerender: async (pageData) => {
      pageNumber += 1
      const textContent = await pageData.getTextContent()
      const text = normalizeWhitespace(textContent.items.map((item) => item.str).join(' '))
      pages.push({ page_number: pageNumber, text })
      return text
    },
  })

  return pages
}

function buildSql(chunks) {
  const payload = JSON.stringify(chunks, null, 2)

  return `-- Manual chunks insert. Review before executing in Supabase SQL Editor.
-- Generated from local PDFs only. Do not commit real manual content.

with payload as (
  select *
  from jsonb_to_recordset($manual_chunks$${payload}$manual_chunks$::jsonb) as chunk_payload (
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

async function ensureOutputDirectory() {
  await fs.mkdir(path.dirname(PREVIEW_OUTPUT_PATH), { recursive: true })
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH)

  if (!Array.isArray(manifest)) {
    throw new Error('Manual manifest must be an array.')
  }

  const chunks = []

  for (const item of manifest) {
    const manualDocumentCode = normalizeWhitespace(item.manual_document_code)
    const localPdfPath = normalizeWhitespace(item.local_pdf_path)

    if (!manualDocumentCode || !localPdfPath) {
      throw new Error('Each manifest item must include manual_document_code and local_pdf_path.')
    }

    const pages = await extractPdfPages(localPdfPath)

    for (const page of pages) {
      if (!page.text) continue

      splitIntoChunks(page.text).forEach((chunkText, chunkIndex) => {
        chunks.push({
          manual_document_code: manualDocumentCode,
          page_number: page.page_number,
          chunk_index: chunkIndex,
          chunk_text: chunkText,
          token_estimate: estimateTokens(chunkText),
          source_hash: createSourceHash([
            manualDocumentCode,
            localPdfPath,
            String(page.page_number),
            String(chunkIndex),
            chunkText,
          ]),
        })
      })
    }
  }

  await ensureOutputDirectory()
  await fs.writeFile(PREVIEW_OUTPUT_PATH, `${JSON.stringify(chunks, null, 2)}\n`)
  await fs.writeFile(SQL_OUTPUT_PATH, buildSql(chunks))

  const mode = DRY_RUN ? 'dry-run' : 'write'
  process.stdout.write(`Manual indexing ${mode} prepared ${chunks.length} chunks.\n`)
  process.stdout.write(`Preview: ${PREVIEW_OUTPUT_PATH}\n`)
  process.stdout.write(`SQL: ${SQL_OUTPUT_PATH}\n`)
  process.stdout.write('No Supabase import, storage operation, or AI call was executed.\n')
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
