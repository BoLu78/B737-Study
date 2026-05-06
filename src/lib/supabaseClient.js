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

export async function createSignedManualUrl(storagePath) {
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

  try {
    const { data: session, error: sessionError } = await getCurrentSession()

    if (sessionError || !session) {
      return {
        signedUrl: null,
        error: 'You must sign in before opening manuals.',
      }
    }

    const { data, error } = await supabase.storage
      .from('manuals')
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
