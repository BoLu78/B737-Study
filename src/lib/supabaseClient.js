import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured =
  !!(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

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
          topic: row.topic,
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
