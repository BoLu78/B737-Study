import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ManualChunk = {
  id?: number
  manual_document_id?: number
  manual_code?: string | null
  title?: string | null
  aircraft?: string | null
  manual_type?: string | null
  page_number?: number | null
  chunk_index?: number | null
  chunk_text?: string | null
  storage_path?: string | null
  rank_score?: number | null
}

type Citation = {
  manual_code: string
  title: string
  page_number: number | null
  chunk_index: number | null
  storage_path: string
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const MAX_QUESTION_LENGTH = 600
const MAX_CHUNKS = 12
const MAX_CHUNK_CHARS = 1800

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || ''
}

function getImportantWords(question: string) {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'for',
    'from',
    'how',
    'into',
    'the',
    'this',
    'that',
    'what',
    'when',
    'where',
    'with',
    'explain',
    'describe',
    'system',
  ])

  return Array.from(
    new Set(
      question
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ''))
        .filter((word) => word.length > 2 && !stopWords.has(word)),
    ),
  ).slice(0, 8)
}

function normalizeChunkText(text: string | null | undefined) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHUNK_CHARS)
}

function buildCitation(chunk: ManualChunk): Citation {
  return {
    manual_code: String(chunk.manual_code || ''),
    title: String(chunk.title || ''),
    page_number: Number.isFinite(Number(chunk.page_number)) ? Number(chunk.page_number) : null,
    chunk_index: Number.isFinite(Number(chunk.chunk_index)) ? Number(chunk.chunk_index) : null,
    storage_path: String(chunk.storage_path || ''),
  }
}

function dedupeCitations(chunks: ManualChunk[]) {
  const seen = new Set<string>()
  const citations: Citation[] = []

  for (const chunk of chunks) {
    const citation = buildCitation(chunk)
    const key = [
      citation.manual_code,
      citation.title,
      citation.page_number,
      citation.chunk_index,
      citation.storage_path,
    ].join('|')

    if (!seen.has(key)) {
      seen.add(key)
      citations.push(citation)
    }
  }

  return citations
}

function buildContext(chunks: ManualChunk[]) {
  return chunks.map((chunk, index) => {
    const manualLabel = chunk.manual_code || chunk.title || 'Unknown manual'
    const pageLabel = chunk.page_number ?? 'unknown'
    const chunkLabel = chunk.chunk_index ?? 'unknown'
    const marker = `[${manualLabel} p.${pageLabel}]`

    return [
      `CHUNK ${index + 1} ${marker}`,
      `Manual code: ${chunk.manual_code || 'Unknown'}`,
      `Title: ${chunk.title || 'Unknown'}`,
      `Aircraft: ${chunk.aircraft || 'Unknown'}`,
      `Manual type: ${chunk.manual_type || 'Unknown'}`,
      `Page: ${pageLabel}`,
      `Chunk index: ${chunkLabel}`,
      `Text: ${normalizeChunkText(chunk.chunk_text)}`,
    ].join('\n')
  }).join('\n\n')
}

function extractOpenAIText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') {
    return payload.output_text.trim()
  }

  const output = Array.isArray(payload.output) ? payload.output : []
  const textParts: string[] = []

  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : []

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== 'object') continue
      const text = (contentItem as { text?: unknown }).text
      if (typeof text === 'string') {
        textParts.push(text)
      }
    }
  }

  return textParts.join('\n').trim()
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const openAIKey = Deno.env.get('OPENAI_API_KEY')
  const model = Deno.env.get('OPENAI_MODEL') || DEFAULT_MODEL

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Manual AI is not configured yet. Supabase environment is missing.' }, 500)
  }

  if (!openAIKey) {
    return jsonResponse({
      error: 'Manual AI is not configured yet. Deploy the Edge Function and set OPENAI_API_KEY in Supabase secrets.',
    }, 500)
  }

  const accessToken = getBearerToken(request)

  if (!accessToken) {
    return jsonResponse({ error: 'Sign in before asking manuals.' }, 401)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)

  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Sign in before asking manuals.' }, 401)
  }

  let body: { question?: unknown; aircraft?: unknown; manual_type?: unknown }

  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400)
  }

  const question = String(body.question || '').replace(/\s+/g, ' ').trim()
  const aircraft = String(body.aircraft || '').trim() || null
  const manualType = String(body.manual_type || '').trim() || null

  if (question.length < 6) {
    return jsonResponse({ error: 'Ask a longer manual question.' }, 400)
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return jsonResponse({ error: `Manual questions must be ${MAX_QUESTION_LENGTH} characters or fewer.` }, 400)
  }

  let chunks: ManualChunk[] = []

  const rpcResult = await supabase.rpc('search_manual_chunks', {
    search_query: question,
    aircraft_filter: aircraft,
    manual_type_filter: manualType,
    result_limit: MAX_CHUNKS,
  })

  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    chunks = rpcResult.data as ManualChunk[]
  }

  if (chunks.length === 0) {
    const importantWords = getImportantWords(question)
    let query = supabase
      .from('manual_chunks')
      .select('id, manual_document_id, manual_code, aircraft, manual_type, title, storage_path, page_number, chunk_index, chunk_text')
      .eq('status', 'active')
      .limit(MAX_CHUNKS)
      .order('manual_code', { ascending: true })
      .order('page_number', { ascending: true })
      .order('chunk_index', { ascending: true })

    if (aircraft) {
      query = query.eq('aircraft', aircraft)
    }

    if (manualType) {
      query = query.eq('manual_type', manualType)
    }

    if (importantWords.length > 0) {
      query = query.or(importantWords.map((word) => `chunk_text.ilike.%${word}%`).join(','))
    } else {
      query = query.ilike('chunk_text', `%${question}%`)
    }

    const fallbackResult = await query

    if (fallbackResult.error) {
      return jsonResponse({ error: 'Unable to retrieve manual chunks for this question.' }, 500)
    }

    chunks = (fallbackResult.data || []) as ManualChunk[]
  }

  chunks = chunks
    .filter((chunk) => normalizeChunkText(chunk.chunk_text).length > 0)
    .slice(0, MAX_CHUNKS)

  if (chunks.length === 0) {
    return jsonResponse({
      answer: 'The imported manual chunks did not return enough information to answer this question. Try the exact Boeing/manual system name or a shorter query, and verify in the official manual.',
      citations: [],
      used_chunks: 0,
      model,
    })
  }

  const context = buildContext(chunks)
  const citations = dedupeCitations(chunks)
  const instructions = [
    'You answer B737 pilot-study questions using only the provided manual chunks.',
    'Never invent aircraft system details.',
    'If the chunks are insufficient, say clearly that the retrieved manual chunks are insufficient.',
    'Write in simple technical English for pilot study.',
    'Be concise but useful.',
    'Use bullet points only when helpful.',
    'Explain concept, operation, limitations, and pilot-relevant notes only when supported by the chunks.',
    'Include citation markers after relevant statements, using the marker shown for each chunk, for example [B737-MAX-FCOM-V2 p.365].',
    'Avoid long direct quotations from manuals. Paraphrase and summarize.',
    'Treat official manuals as authoritative. Mention verification in the official manual when appropriate.',
  ].join(' ')

  const openAIResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAIKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                `Question: ${question}`,
                '',
                'Manual chunks:',
                context,
              ].join('\n'),
            },
          ],
        },
      ],
      max_output_tokens: 900,
    }),
  })

  if (!openAIResponse.ok) {
    return jsonResponse({ error: 'Manual AI could not generate an answer. Check Edge Function logs and OpenAI configuration.' }, 500)
  }

  const openAIPayload = await openAIResponse.json() as Record<string, unknown>
  const answer = extractOpenAIText(openAIPayload)

  if (!answer) {
    return jsonResponse({ error: 'Manual AI returned an empty answer.' }, 500)
  }

  return jsonResponse({
    answer,
    citations,
    used_chunks: chunks.length,
    model,
  })
})
