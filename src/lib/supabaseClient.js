import { createClient } from '@supabase/supabase-js'
import { getCanonicalTopic } from '../utils/topicNormalizer'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured =
  !!(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export async function getCurrentSession() {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  try {
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      return {
        data: null,
        error: error.message,
      }
    }

    return {
      data: data.session,
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err.message || 'Unable to read the current session.',
    }
  }
}

export function onAuthStateChange(callback) {
  if (!supabase) {
    return {
      unsubscribe: () => {},
    }
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })

  return data.subscription
}

export async function signInWithEmailPassword(email, password) {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return {
        data: null,
        error: error.message,
      }
    }

    return {
      data: data.session,
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err.message || 'Unable to sign in.',
    }
  }
}

export async function signOut() {
  if (!supabase) {
    return {
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  try {
    const { error } = await supabase.auth.signOut()

    return {
      error: error ? error.message : null,
    }
  } catch (err) {
    return {
      error: err.message || 'Unable to sign out.',
    }
  }
}

export async function createSignedManualUrl(storagePath, storageBucket = 'manuals') {
  if (!supabase) {
    return {
      signedUrl: null,
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  if (typeof storagePath !== 'string' || !storagePath.trim()) {
    return {
      signedUrl: null,
      error: 'Manual storage path is missing.',
    }
  }

  const normalizedStoragePath = storagePath.trim()
  const normalizedStorageBucket = String(storageBucket || '').trim() || 'manuals'

  try {
    const { data: session, error: sessionError } = await getCurrentSession()

    if (sessionError || !session) {
      return {
        signedUrl: null,
        error: 'You must sign in before opening manuals.',
      }
    }

    const { data, error } = await supabase.storage
      .from(normalizedStorageBucket)
      .createSignedUrl(normalizedStoragePath, 300)

    if (error) {
      const errorMessage = String(error.message || '').toLowerCase()
      const isAccessOrMissingFileError =
        errorMessage.includes('not found') ||
        errorMessage.includes('denied') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('forbidden')

      return {
        signedUrl: null,
        error: isAccessOrMissingFileError
          ? 'Manual file not found or access denied.'
          : 'Unable to create signed URL. Check storage policy and file path.',
      }
    }

    if (!data?.signedUrl) {
      return {
        signedUrl: null,
        error: 'Unable to create signed URL. Check storage policy and file path.',
      }
    }

    return {
      signedUrl: data.signedUrl,
      error: null,
    }
  } catch {
    return {
      signedUrl: null,
      error: 'Unable to create signed URL. Check storage policy and file path.',
    }
  }
}

export async function loadQuestionsFromSupabase() {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  try {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('status', 'active')
      .order('id', { ascending: true })

    if (error) {
      return {
        data: null,
        error: error.message,
      }
    }

    if (!data || data.length === 0) {
      return {
        data: null,
        error: 'No active questions found in Supabase.',
      }
    }

    return {
      data: data.map((row) => {
        const correctAnswerLetter = String(row.correct_answer || '').trim().toUpperCase()
        const correctAnswerMap = { A: 0, B: 1, C: 2, D: 3 }
        const correctAnswerIndex = correctAnswerMap[correctAnswerLetter] ?? 0

        return {
          id: row.id,
          sourceId: row.source_id ?? null,
          rawTopic: row.topic,
          topic: getCanonicalTopic(row.topic),
          subtopic: row.subtopic || null,
          question: row.question,
          answers: [row.answer_a, row.answer_b, row.answer_c, row.answer_d],
          correctAnswer: correctAnswerIndex,
          correctAnswerLetter,
          explanation: row.explanation,
          manualReference: row.manual_reference || null,
          sourceDocument: row.source_document || null,
          sourcePage: row.source_page ?? null,
          status: row.status,
          difficulty: row.difficulty || null,
        }
      }),
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err.message || 'An unexpected error occurred while loading questions.',
    }
  }
}

export async function loadManualDocuments() {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  try {
    const { data, error } = await supabase
      .from('manual_documents')
      .select('id, title, code, aircraft, manual_type, revision, storage_bucket, storage_path, status, notes')
      .eq('status', 'active')
      .order('aircraft', { ascending: true })
      .order('manual_type', { ascending: true })
      .order('title', { ascending: true })

    if (error) {
      return {
        data: null,
        error: error.message,
      }
    }

    return {
      data: data || [],
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err.message || 'An unexpected error occurred while loading manual documents.',
    }
  }
}

export async function countManualChunks() {
  if (!supabase) {
    return {
      count: null,
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  try {
    const { count, error } = await supabase
      .from('manual_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    if (error) {
      return {
        count: null,
        error: error.message,
      }
    }

    return {
      count: Number.isInteger(count) ? count : 0,
      error: null,
    }
  } catch (err) {
    return {
      count: null,
      error: err.message || 'Unable to count manual chunks.',
    }
  }
}

function getManualSearchWords(query) {
  return Array.from(
    new Set(
      String(query || '')
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ''))
        .filter((word) => word.length > 1),
    ),
  )
}

function isLowValueManualChunk(chunkText, pageNumber) {
  const normalizedText = String(chunkText || '').toLowerCase()

  return (
    /table of contents|abbreviations|abbreviation list|revision log|revision record|title page|intentionally blank|chapter index/.test(normalizedText) ||
    (Number(pageNumber) <= 10 && /preface|copyright|proprietary|revision/.test(normalizedText)) ||
    normalizedText.length < 120
  )
}

function scoreManualChunkSearchResult(row, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const words = getManualSearchWords(normalizedQuery)
  const chunkText = String(row?.chunk_text || '').toLowerCase()
  const title = String(row?.title || '').toLowerCase()
  const manualCode = String(row?.manual_code || '').toLowerCase()
  const matchingWordCount = words.filter((word) => (
    chunkText.includes(word) ||
    title.includes(word) ||
    manualCode.includes(word)
  )).length
  const allWordsInText = words.length > 0 && words.every((word) => chunkText.includes(word))

  let score = 0

  if (normalizedQuery && chunkText.includes(normalizedQuery)) score += 1000
  if (normalizedQuery && (title.includes(normalizedQuery) || manualCode.includes(normalizedQuery))) score += 800
  if (allWordsInText) score += 600

  score += matchingWordCount * 45

  if (isLowValueManualChunk(row?.chunk_text, row?.page_number)) {
    score -= 220
  }

  return score
}

function sortManualSearchResults(data, query, limit) {
  return [...(data || [])]
    .map((row) => ({
      ...row,
      rank_score: Number.isFinite(Number(row.rank_score))
        ? Number(row.rank_score)
        : scoreManualChunkSearchResult(row, query),
    }))
    .sort((first, second) => (
      Number(second.rank_score || 0) - Number(first.rank_score || 0) ||
      String(first.manual_code || '').localeCompare(String(second.manual_code || '')) ||
      Number(first.page_number || 0) - Number(second.page_number || 0) ||
      Number(first.chunk_index || 0) - Number(second.chunk_index || 0)
    ))
    .slice(0, limit)
}

export async function loadManualChunksSearch(options = {}, fallbackLimit = 20) {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  const searchOptions = typeof options === 'string'
    ? { query: options, limit: fallbackLimit }
    : options || {}
  const {
    query = '',
    manualType = '',
    aircraft = '',
    limit = 20,
  } = searchOptions
  const normalizedQuery = String(query || '').trim()
  const normalizedManualType = String(manualType || '').trim()
  const normalizedAircraft = String(aircraft || '').trim()
  const safeLimit = Number.isInteger(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 20) : 20

  if (!normalizedQuery) {
    return {
      data: [],
      error: null,
    }
  }

  const runDirectFallbackSearch = async () => {
    const fetchLimit = Math.min(safeLimit * 5, 100)
    const buildBaseQuery = () => {
      let request = supabase
        .from('manual_chunks')
        .select('id, manual_document_id, manual_code, aircraft, manual_type, title, storage_path, page_number, chunk_index, chunk_text, status')
        .eq('status', 'active')
        .limit(fetchLimit)

      if (normalizedManualType) {
        request = request.eq('manual_type', normalizedManualType)
      }

      if (normalizedAircraft) {
        request = request.eq('aircraft', normalizedAircraft)
      }

      return request
    }

    let request = buildBaseQuery()

    request = request.textSearch('chunk_text', normalizedQuery, {
      config: 'english',
      type: 'websearch',
    })

    let { data, error } = await request
      .order('manual_code', { ascending: true })
      .order('page_number', { ascending: true })
      .order('chunk_index', { ascending: true })

    if (error || !data?.length) {
      const words = getManualSearchWords(normalizedQuery)
      const ilikeClauses = [
        `chunk_text.ilike.%${normalizedQuery}%`,
        `title.ilike.%${normalizedQuery}%`,
        `manual_code.ilike.%${normalizedQuery}%`,
        ...words.flatMap((word) => [
          `chunk_text.ilike.%${word}%`,
          `title.ilike.%${word}%`,
          `manual_code.ilike.%${word}%`,
        ]),
      ]
      const fallbackRequest = buildBaseQuery()
        .or(ilikeClauses.join(','))
        .order('manual_code', { ascending: true })
        .order('page_number', { ascending: true })
        .order('chunk_index', { ascending: true })

      const fallbackResult = await fallbackRequest
      data = fallbackResult.data
      error = fallbackResult.error
    }

    if (error) {
      throw new Error(error.message)
    }

    return sortManualSearchResults(data || [], normalizedQuery, safeLimit)
  }

  try {
    const { data, error } = await supabase.rpc('search_manual_chunks', {
      search_query: normalizedQuery,
      aircraft_filter: normalizedAircraft || null,
      manual_type_filter: normalizedManualType || null,
      result_limit: safeLimit,
    })

    if (!error) {
      return {
        data: sortManualSearchResults(data || [], normalizedQuery, safeLimit),
        error: null,
      }
    }

    const fallbackData = await runDirectFallbackSearch()

    return {
      data: fallbackData,
      error: null,
    }
  } catch (err) {
    try {
      const fallbackData = await runDirectFallbackSearch()

      return {
        data: fallbackData,
        error: null,
      }
    } catch (fallbackErr) {
      return {
        data: null,
        error: fallbackErr.message || err.message || 'Unable to search manual chunks.',
      }
    }
  }
}

export async function askManuals(question, filters = {}) {
  if (!supabase) {
    return {
      data: null,
      error: 'Supabase is not configured. Check environment variables.',
    }
  }

  const normalizedQuestion = String(question || '').replace(/\s+/g, ' ').trim()

  if (!normalizedQuestion) {
    return {
      data: null,
      error: 'Ask a manual question first.',
    }
  }

  try {
    const { data: session, error: sessionError } = await getCurrentSession()

    if (sessionError || !session?.access_token) {
      return {
        data: null,
        error: 'Sign in before asking manuals.',
      }
    }

    const { data, error } = await supabase.functions.invoke('manual-answer', {
      body: {
        question: normalizedQuestion,
        aircraft: String(filters.aircraft || '').trim() || null,
        manual_type: String(filters.manualType || filters.manual_type || '').trim() || null,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (error) {
      let functionErrorMessage = ''

      try {
        if (error.context && typeof error.context.json === 'function') {
          const errorBody = await error.context.json()
          functionErrorMessage = errorBody?.error || ''
        }
      } catch {
        functionErrorMessage = ''
      }

      return {
        data: null,
        error: functionErrorMessage || error.message || 'Manual AI is not configured yet. Deploy the Edge Function and set the OpenAI API key in Supabase secrets.',
      }
    }

    if (data?.error) {
      return {
        data: null,
        error: data.error,
      }
    }

    return {
      data: {
        answer: data?.answer || '',
        citations: Array.isArray(data?.citations) ? data.citations : [],
        used_chunks: Number.isInteger(Number(data?.used_chunks)) ? Number(data.used_chunks) : 0,
        model: data?.model || '',
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err.message || 'Manual AI is not configured yet. Deploy the Edge Function and set the OpenAI API key in Supabase secrets.',
    }
  }
}
