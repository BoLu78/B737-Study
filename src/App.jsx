import { useState, useEffect, useCallback } from 'react'
import './App.css'
import { loadQuestionsFromSupabase } from './lib/supabaseClient'

const APP_VERSION = 'v4.2'
const DATA_SOURCE_SUPABASE = 'Supabase'
const DATA_SOURCE_FALLBACK = 'Local fallback'
const CORRECT_ANSWER_OPTIONS = ['A', 'B', 'C', 'D']
const STATUS_OPTIONS = ['active', 'draft', 'to_verify', 'obsolete']
const DIFFICULTY_OPTIONS = ['easy', 'normal', 'hard']
const REQUIRED_ADMIN_FIELDS = [
  'topic',
  'question',
  'answer_a',
  'answer_b',
  'answer_c',
  'answer_d',
  'correct_answer',
  'status',
  'difficulty',
]

const EMPTY_ADMIN_FORM = {
  topic: '',
  subtopic: '',
  question: '',
  answer_a: '',
  answer_b: '',
  answer_c: '',
  answer_d: '',
  correct_answer: 'A',
  explanation: '',
  manual_reference: '',
  source_document: '',
  status: 'draft',
  difficulty: 'normal',
}

const FALLBACK_QUESTIONS = [
  {
    id: 'AS-01',
    topic: 'Air System',
    question: 'Which component regulates cabin pressure by modulating outflow air?',
    answers: ['Outflow valve', 'Pack heat exchanger', 'Ram air inlet', 'Recirculation fan'],
    correctAnswer: 0,
    explanation:
      'The outflow valve controls cabin pressure by releasing bleed air from the cabin at a controlled rate.',
    status: 'active',
  },
  {
    id: 'FC-02',
    topic: 'Flight Controls',
    question: 'What is the primary function of the trailing edge flaps during takeoff?',
    answers: ['Increase lift', 'Reduce drag', 'Stabilize yaw', 'Lock spoilers'],
    correctAnswer: 0,
    explanation:
      'Trailing edge flaps increase wing camber and lift at lower speeds during takeoff and landing.',
    status: 'active',
  },
  {
    id: 'FU-03',
    topic: 'Fuel',
    question: 'Which tank is typically used first on the B737 to maintain aircraft balance?',
    answers: ['Center tank', 'Left main tank', 'Right main tank', 'Auxiliary tank'],
    correctAnswer: 0,
    explanation:
      'The center tank is normally drained first to maintain an optimal lateral balance and CG.',
    status: 'active',
  },
  {
    id: 'HY-04',
    topic: 'Hydraulics',
    question: 'How many hydraulic systems provide primary flight control power on the B737?',
    answers: ['Two', 'Three', 'One', 'Four'],
    correctAnswer: 1,
    explanation:
      'The B737 uses three hydraulic systems (A, B, and standby) for primary flight control power.',
    status: 'active',
  },
  {
    id: 'LM-05',
    topic: 'Limitations',
    question: 'Which limit must be observed for maximum landing weight?',
    answers: ['Structural limit', 'Cabin pressure limit', 'Engine oil limit', 'Flap speed limit'],
    correctAnswer: 0,
    explanation:
      'Maximum landing weight is a structural limitation to ensure the airframe is within certified landing loads.',
    status: 'active',
  },
  {
    id: 'ET-06',
    topic: 'Long Haul / ETOPS',
    question: 'ETOPS planning is most critical for flights that operate beyond what point?',
    answers: ['60 minutes from diversion airport', '70 feet AGL', 'Below FL200', 'During taxi'],
    correctAnswer: 0,
    explanation:
      'ETOPS rules apply when the aircraft is beyond the maximum diversion time to a suitable alternate airport.',
    status: 'active',
  },
]

function buildAdminFormFromQuestion(question) {
  return {
    topic: question.topic || '',
    subtopic: question.subtopic || '',
    question: question.question || '',
    answer_a: question.answers?.[0] || '',
    answer_b: question.answers?.[1] || '',
    answer_c: question.answers?.[2] || '',
    answer_d: question.answers?.[3] || '',
    correct_answer: question.correctAnswerLetter || String.fromCharCode(65 + (question.correctAnswer ?? 0)),
    explanation: question.explanation || '',
    manual_reference: question.manualReference || '',
    source_document: question.sourceDocument || '',
    status: question.status || 'draft',
    difficulty: question.difficulty || 'normal',
  }
}

function normalizeAdminForm(form) {
  return {
    topic: form.topic.trim(),
    subtopic: form.subtopic.trim(),
    question: form.question.trim(),
    answer_a: form.answer_a.trim(),
    answer_b: form.answer_b.trim(),
    answer_c: form.answer_c.trim(),
    answer_d: form.answer_d.trim(),
    correct_answer: form.correct_answer,
    explanation: form.explanation.trim(),
    manual_reference: form.manual_reference.trim(),
    source_document: form.source_document.trim(),
    status: form.status,
    difficulty: form.difficulty,
  }
}

function validateAdminForm(form) {
  const missingFields = REQUIRED_ADMIN_FIELDS.filter((field) => !String(form[field] || '').trim())

  if (missingFields.length > 0) {
    return `Required fields missing: ${missingFields.join(', ')}.`
  }

  if (!CORRECT_ANSWER_OPTIONS.includes(form.correct_answer)) {
    return 'Correct answer must be A, B, C, or D.'
  }

  if (!STATUS_OPTIONS.includes(form.status)) {
    return 'Status must be active, draft, to_verify, or obsolete.'
  }

  if (!DIFFICULTY_OPTIONS.includes(form.difficulty)) {
    return 'Difficulty must be easy, normal, or hard.'
  }

  return null
}

function App() {
  const [questions, setQuestions] = useState(FALLBACK_QUESTIONS)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [dataSource, setDataSource] = useState(DATA_SOURCE_FALLBACK)
  const [view, setView] = useState('dashboard')
  const [selectedTopic, setSelectedTopic] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [adminForm, setAdminForm] = useState(null)
  const [adminMode, setAdminMode] = useState(null)
  const [adminFormError, setAdminFormError] = useState('')
  const [adminPreview, setAdminPreview] = useState(null)

  const applyDatabaseResult = useCallback((data, error) => {
    if (error || !data) {
      setQuestions(FALLBACK_QUESTIONS)
      setDataSource(DATA_SOURCE_FALLBACK)
      setLoadError(error || 'Unable to load questions from Supabase.')
      setIsLoading(false)
      return
    }

    setQuestions(data)
    setDataSource(DATA_SOURCE_SUPABASE)
    setIsLoading(false)
  }, [])

  const loadQuestionDatabase = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    const { data, error } = await loadQuestionsFromSupabase()
    applyDatabaseResult(data, error)
  }, [applyDatabaseResult])

  useEffect(() => {
    let isMounted = true

    const loadInitialQuestions = async () => {
      const { data, error } = await loadQuestionsFromSupabase()
      if (isMounted) {
        applyDatabaseResult(data, error)
      }
    }

    loadInitialQuestions()

    return () => {
      isMounted = false
    }
  }, [applyDatabaseResult])

  const topics = Array.from(new Set(questions.map((item) => item.topic)))
  const currentTopic = topics.includes(selectedTopic) ? selectedTopic : topics[0] || ''
  const topicQuestions = questions.filter((item) => item.topic === currentTopic)
  const currentQuestion = topicQuestions[questionIndex]
  const completedCount = topicQuestions.length
  const activeQuestions = questions.filter((item) => item.status === 'active').length

  const handleRefreshDatabase = async () => {
    await loadQuestionDatabase()
  }

  const handleSelectTopic = (event) => {
    setSelectedTopic(event.target.value)
    setQuestionIndex(0)
    setAnswered(false)
    setSelectedAnswer(null)
  }

  const handleStartQuiz = () => {
    setQuestionIndex(0)
    setAnswered(false)
    setSelectedAnswer(null)
    setView('quiz')
  }

  const handleAnswerClick = (index) => {
    if (answered || !currentQuestion) return
    setSelectedAnswer(index)
    setCorrect(index === currentQuestion.correctAnswer)
    setAnswered(true)
  }

  const handleNextQuestion = () => {
    setSelectedAnswer(null)
    setAnswered(false)
    setCorrect(false)
    setQuestionIndex((current) => {
      const next = current + 1
      return next < topicQuestions.length ? next : 0
    })
  }

  const handleBackToDashboard = () => {
    setView('dashboard')
    setSelectedAnswer(null)
    setAnswered(false)
    setQuestionIndex(0)
  }

  const handleOpenAdmin = () => {
    setView('admin')
    setAdminForm(null)
    setAdminMode(null)
    setAdminFormError('')
    setAdminPreview(null)
  }

  const handleNewQuestion = () => {
    setAdminMode('new')
    setAdminForm(EMPTY_ADMIN_FORM)
    setAdminFormError('')
    setAdminPreview(null)
  }

  const handleEditQuestion = (question) => {
    setAdminMode(`edit-${question.id}`)
    setAdminForm(buildAdminFormFromQuestion(question))
    setAdminFormError('')
    setAdminPreview(null)
  }

  const handleAdminFieldChange = (event) => {
    const { name, value } = event.target
    setAdminForm((current) => ({
      ...current,
      [name]: value,
    }))
    setAdminFormError('')
    setAdminPreview(null)
  }

  const handlePreviewChanges = () => {
    const validationError = validateAdminForm(adminForm)

    if (validationError) {
      setAdminFormError(validationError)
      setAdminPreview(null)
      return
    }

    setAdminPreview(normalizeAdminForm(adminForm))
    setAdminFormError('')
  }

  const handleCancelAdminForm = () => {
    setAdminForm(null)
    setAdminMode(null)
    setAdminFormError('')
    setAdminPreview(null)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">B737 Study App</p>
          <h1>Quiz database, manual search and AI explanations</h1>
          <p className="subtitle">
            A pilot-focused dashboard for study readiness and future manual intelligence.
          </p>
        </div>
        <span className="version-badge">{APP_VERSION}</span>
      </header>

      {loadError && (
        <div className="warning-banner">
          <strong>Database warning:</strong>
          <span> {loadError} Using local fallback.</span>
        </div>
      )}

      {isLoading && (
        <div className="info-banner">
          <span>Loading question database…</span>
        </div>
      )}

      <main className="app-main">
        {view === 'dashboard' && (
          <section className="dashboard-view">
            <div className="dashboard-header">
              <div>
                <span className="database-badge">
                  Database: {dataSource}
                </span>
                <span className="database-count">Loaded: {questions.length} questions</span>
              </div>
              <button className="button button-secondary" onClick={handleRefreshDatabase}>
                Refresh Database
              </button>
            </div>

            <div className="dashboard-grid">
              <article className="card card-strong">
                <h2>Start Quiz</h2>
                <p>Select a topic and begin a timed study run with instant feedback.</p>
                <label className="field-label" htmlFor="topic-select">
                  Topic
                </label>
                <select
                  id="topic-select"
                  value={currentTopic}
                  onChange={handleSelectTopic}
                  disabled={isLoading}
                >
                  {topics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
                <div className="card-actions">
                  <button
                    className="button button-primary"
                    onClick={handleStartQuiz}
                    disabled={isLoading || topicQuestions.length === 0}
                  >
                    Begin {currentTopic}
                  </button>
                </div>
              </article>

              <article className="card">
                <h2>Question Database</h2>
                <p>Browse the current bank of questions, topics, and official correct answers.</p>
                <div className="card-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => setView('database')}
                    disabled={isLoading}
                  >
                    View Database
                  </button>
                </div>
              </article>

              <article className="card">
                <h2>Manuals & AI Search</h2>
                <p>Future feature will search manuals and generate research-backed explanations.</p>
                <div className="card-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => setView('manuals')}
                    disabled={isLoading}
                  >
                    Preview Feature
                  </button>
                </div>
              </article>

              <article className="card">
                <h2>Statistics</h2>
                <p>Quick overview of your study bank with counts for topics and active questions.</p>
                <div className="card-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => setView('stats')}
                    disabled={isLoading}
                  >
                    Open Statistics
                  </button>
                </div>
              </article>

              <article className="card">
                <h2>Admin Questions</h2>
                <p>Add, review and prepare question updates. Secure write access will be enabled in the next step.</p>
                <div className="card-actions">
                  <button
                    className="button button-secondary"
                    onClick={handleOpenAdmin}
                    disabled={isLoading}
                  >
                    Open Admin
                  </button>
                </div>
              </article>
            </div>
          </section>
        )}

        {view === 'quiz' && (
          <section className="quiz-view">
            <div className="quiz-header">
              <div>
                <p className="eyebrow">Quiz mode</p>
                <h2>{currentTopic}</h2>
                <p className="subtitle">Question {questionIndex + 1} of {completedCount}</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            {currentQuestion ? (
              <article className="question-card">
                <p className="question-id">{currentQuestion.id}</p>
                <h3>{currentQuestion.question}</h3>
                {currentQuestion.difficulty && (
                  <p className="question-meta">Difficulty: {currentQuestion.difficulty}</p>
                )}
                <div className="answer-grid">
                  {currentQuestion.answers.map((answer, index) => {
                    const isSelected = selectedAnswer === index
                    const isCorrectAnswer = currentQuestion.correctAnswer === index
                    const answerClass = answered
                      ? isCorrectAnswer
                        ? 'answer-button answer-correct'
                        : isSelected
                        ? 'answer-button answer-wrong'
                        : 'answer-button answer-disabled'
                      : 'answer-button'

                    return (
                      <button
                        key={answer}
                        className={answerClass}
                        onClick={() => handleAnswerClick(index)}
                        disabled={answered}
                      >
                        <span className="answer-key">{String.fromCharCode(65 + index)}</span>
                        {answer}
                      </button>
                    )
                  })}
                </div>

                {answered && (
                  <div className={correct ? 'feedback feedback-correct' : 'feedback feedback-wrong'}>
                    {correct ? 'Correct answer' : 'Incorrect answer'}
                  </div>
                )}

                {answered && (
                  <div className="explanation-box">
                    <p className="explanation-label">Explanation</p>
                    <p>{currentQuestion.explanation}</p>
                    {currentQuestion.manualReference && (
                      <p className="explanation-reference">
                        <strong>Manual Reference:</strong> {currentQuestion.manualReference}
                      </p>
                    )}
                  </div>
                )}

                <div className="quiz-actions">
                  <button className="button button-primary" onClick={handleNextQuestion}>
                    {questionIndex + 1 < completedCount ? 'Next question' : 'Restart topic'}
                  </button>
                  <button className="button button-secondary" onClick={handleBackToDashboard}>
                    Back to dashboard
                  </button>
                </div>
              </article>
            ) : (
              <article className="question-card">
                <p>No questions are available for this topic.</p>
                <button className="button button-secondary" onClick={handleBackToDashboard}>
                  Back to dashboard
                </button>
              </article>
            )}
          </section>
        )}

        {view === 'database' && (
          <section className="database-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Question Database</p>
                <h2>Full question bank</h2>
                <p className="subtitle">Review official answers and topic status for each entry.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Topic</th>
                    <th>Question</th>
                    <th>Correct</th>
                    <th>Difficulty</th>
                    <th>Status</th>
                    <th>Source document</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.topic}</td>
                      <td>{item.question.substring(0, 50)}...</td>
                      <td>{item.correctAnswerLetter || String.fromCharCode(65 + item.correctAnswer)}</td>
                      <td>{item.difficulty || '—'}</td>
                      <td>{item.status}</td>
                      <td>{item.sourceDocument || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === 'manuals' && (
          <section className="placeholder-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Manuals & AI Search</p>
                <h2>Research assistant preview</h2>
                <p className="subtitle">
                  Future capability will search uploaded manuals and generate source-based explanations.
                </p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="placeholder-card">
              <p>
                In a future release, manuals and technical data will be indexed so the AI assistant can provide
                research-backed explanations. The official question database answer remains the authoritative
                reference; AI explanations are supplementary study support.
              </p>
            </div>
          </section>
        )}

        {view === 'admin' && (
          <section className="admin-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Admin Questions</p>
                <h2>Admin Questions</h2>
                <p className="subtitle">
                  Prepare question database changes. Write access is disabled until secure admin authentication is configured.
                </p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="warning-banner">
              <span>
                Admin write mode is not enabled yet. Changes made here are preview-only and will not be saved to Supabase.
              </span>
            </div>

            <div className="admin-actions">
              <button className="button button-primary" onClick={handleNewQuestion}>
                New Question
              </button>
            </div>

            {adminForm && (
              <article className="admin-form-card">
                <div>
                  <p className="eyebrow">{adminMode === 'new' ? 'New Question' : 'Edit Question'}</p>
                  <h3>{adminMode === 'new' ? 'Prepare a new question' : 'Prepare question update'}</h3>
                </div>

                <div className="admin-form-grid">
                  <label className="field-label">
                    Topic
                    <input name="topic" value={adminForm.topic} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Subtopic
                    <input name="subtopic" value={adminForm.subtopic} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label admin-form-wide">
                    Question
                    <textarea name="question" value={adminForm.question} onChange={handleAdminFieldChange} rows="4" />
                  </label>
                  <label className="field-label">
                    Answer A
                    <input name="answer_a" value={adminForm.answer_a} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Answer B
                    <input name="answer_b" value={adminForm.answer_b} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Answer C
                    <input name="answer_c" value={adminForm.answer_c} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Answer D
                    <input name="answer_d" value={adminForm.answer_d} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label">
                    Correct answer
                    <select name="correct_answer" value={adminForm.correct_answer} onChange={handleAdminFieldChange}>
                      {CORRECT_ANSWER_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Status
                    <select name="status" value={adminForm.status} onChange={handleAdminFieldChange}>
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Difficulty
                    <select name="difficulty" value={adminForm.difficulty} onChange={handleAdminFieldChange}>
                      {DIFFICULTY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Source document
                    <input name="source_document" value={adminForm.source_document} onChange={handleAdminFieldChange} />
                  </label>
                  <label className="field-label admin-form-wide">
                    Explanation
                    <textarea name="explanation" value={adminForm.explanation} onChange={handleAdminFieldChange} rows="4" />
                  </label>
                  <label className="field-label admin-form-wide">
                    Manual reference
                    <input name="manual_reference" value={adminForm.manual_reference} onChange={handleAdminFieldChange} />
                  </label>
                </div>

                {adminFormError && <p className="form-error">{adminFormError}</p>}

                <div className="admin-form-actions">
                  <button className="button button-primary" onClick={handlePreviewChanges}>
                    Preview Changes
                  </button>
                  <button className="button button-secondary" onClick={handleCancelAdminForm}>
                    Cancel
                  </button>
                  <div className="disabled-save-wrap">
                    <button className="button button-secondary" disabled title="Disabled until secure admin authentication is configured.">
                      Save to Supabase
                    </button>
                    <span>Disabled until secure admin authentication is configured.</span>
                  </div>
                </div>

                {adminPreview && (
                  <div className="preview-panel">
                    <p className="explanation-label">Preview object</p>
                    <pre>{JSON.stringify(adminPreview, null, 2)}</pre>
                  </div>
                )}
              </article>
            )}

            <div className="admin-list">
              {questions.map((item) => (
                <article className="admin-question-card" key={item.id}>
                  <div className="admin-question-body">
                    <span className="question-id">{item.id}</span>
                    <h3>{item.question}</h3>
                    <dl className="admin-question-meta">
                      <div>
                        <dt>Topic</dt>
                        <dd>{item.topic}</dd>
                      </div>
                      <div>
                        <dt>Correct answer</dt>
                        <dd>{item.correctAnswerLetter || String.fromCharCode(65 + item.correctAnswer)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{item.status || '—'}</dd>
                      </div>
                      <div>
                        <dt>Difficulty</dt>
                        <dd>{item.difficulty || '—'}</dd>
                      </div>
                      <div>
                        <dt>Source document</dt>
                        <dd>{item.sourceDocument || '—'}</dd>
                      </div>
                    </dl>
                  </div>
                  <button className="button button-secondary" onClick={() => handleEditQuestion(item)}>
                    Edit
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === 'stats' && (
          <section className="stats-view">
            <div className="section-header">
              <div>
                <p className="eyebrow">Statistics</p>
                <h2>Study bank summary</h2>
                <p className="subtitle">Basic insights for your pilot review workflow.</p>
              </div>
              <button className="button button-ghost" onClick={handleBackToDashboard}>
                Back to dashboard
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Total questions</span>
                <strong>{questions.length}</strong>
              </div>
              <div className="stat-card">
                <span>Topics</span>
                <strong>{topics.length}</strong>
              </div>
              <div className="stat-card">
                <span>Active questions</span>
                <strong>{activeQuestions}</strong>
              </div>
              <div className="stat-card">
                <span>Data source</span>
                <strong>{dataSource}</strong>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        Online-first study cockpit ready for future Supabase integration.
      </footer>
    </div>
  )
}

export default App
