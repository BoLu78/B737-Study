import { useState } from 'react'
import './App.css'

const APP_VERSION = 'v3.8'

const QUESTION_BANK = [
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

function App() {
  const topics = Array.from(new Set(QUESTION_BANK.map((item) => item.topic)))
  const [view, setView] = useState('dashboard')
  const [selectedTopic, setSelectedTopic] = useState(topics[0] ?? '')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [correct, setCorrect] = useState(false)

  const topicQuestions = QUESTION_BANK.filter((item) => item.topic === selectedTopic)
  const currentQuestion = topicQuestions[questionIndex]
  const completedCount = topicQuestions.length
  const activeQuestions = QUESTION_BANK.filter((item) => item.status === 'active').length

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

      <main className="app-main">
        {view === 'dashboard' && (
          <section className="dashboard-view">
            <div className="dashboard-grid">
              <article className="card card-strong">
                <h2>Start Quiz</h2>
                <p>Select a topic and begin a timed study run with instant feedback.</p>
                <label className="field-label" htmlFor="topic-select">
                  Topic
                </label>
                <select
                  id="topic-select"
                  value={selectedTopic}
                  onChange={handleSelectTopic}
                >
                  {topics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
                <div className="card-actions">
                  <button className="button button-primary" onClick={handleStartQuiz}>
                    Begin {selectedTopic}
                  </button>
                </div>
              </article>

              <article className="card">
                <h2>Question Database</h2>
                <p>Browse the current bank of questions, topics, and official correct answers.</p>
                <div className="card-actions">
                  <button className="button button-secondary" onClick={() => setView('database')}>
                    View Database
                  </button>
                </div>
              </article>

              <article className="card">
                <h2>Manuals & AI Search</h2>
                <p>Future feature will search manuals and generate research-backed explanations.</p>
                <div className="card-actions">
                  <button className="button button-secondary" onClick={() => setView('manuals')}>
                    Preview Feature
                  </button>
                </div>
              </article>

              <article className="card">
                <h2>Statistics</h2>
                <p>Quick overview of your study bank with counts for topics and active questions.</p>
                <div className="card-actions">
                  <button className="button button-secondary" onClick={() => setView('stats')}>
                    Open Statistics
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
                <h2>{selectedTopic}</h2>
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
                    <th>Answer</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {QUESTION_BANK.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.topic}</td>
                      <td>{item.question}</td>
                      <td>{String.fromCharCode(65 + item.correctAnswer)}</td>
                      <td>{item.status}</td>
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
                <strong>{QUESTION_BANK.length}</strong>
              </div>
              <div className="stat-card">
                <span>Topics</span>
                <strong>{topics.length}</strong>
              </div>
              <div className="stat-card">
                <span>Active questions</span>
                <strong>{activeQuestions}</strong>
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
