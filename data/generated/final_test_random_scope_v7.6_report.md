# Final Test Random Scope v7.6 Report

## CURRENT STATUS

- App version is v7.6.
- Question loading, topic practice, source question IDs, text cleanup, session completion, and wrong-answer review remain intact.
- Final Test now opens a setup screen before starting the session.

## PROBLEM

Final Test previously used the first 100 loaded questions with `slice(0, 100)`. That made every final test predictable and biased toward database order instead of exam-style random practice.

## RANDOM SELECTION LOGIC

- Added `src/utils/finalTestSelection.js`.
- Implemented Fisher-Yates `shuffleArray(array)` without mutating the original array.
- Final Test selection now:
  - filters eligible questions by scope
  - shuffles eligible questions
  - takes up to the requested count
  - stores the selected questions in session state
- The selected order is stable while moving through the test and changes only when starting or retrying a Final Test.

## FINAL TEST MODES

- All Questions: randomized selection from the full loaded question bank.
- Aircraft Systems: randomized selection from technical/system topics.
- Selected Topics: randomized selection from one or more user-selected topics.
- Test length options: 25, 50, and 100 questions.
- If fewer questions are available than requested, the app uses all eligible questions and shows a short note.

## AIRCRAFT SYSTEMS TOPIC MATCHING

Aircraft Systems mode matches normalized topic names against technical/system terms such as air system, air conditioning, anti-ice, automatic flight, flight controls, electrical, engines/APU, fuel, hydraulics, fire protection, oxygen, pressurization, landing gear, brakes, instruments, navigation, communications, doors, lights, warnings, autoflight, and autopilot.

Generic topics such as aeroplane general, limitations, performance, and procedures are not included unless no system topics are available.

## FINAL TEST SETUP UI

- Dashboard Final Test action now opens setup instead of immediately starting a test.
- Setup shows scope, question count options, available eligible questions, planned test size, and selected topic controls.
- Start button is disabled when the selected scope has no eligible questions.

## SESSION COMPLETION BEHAVIOR

- Final Test uses the existing answer checking behavior.
- Completion still shows total answered, correct, wrong, and score percentage.
- Wrong-answer review still works.
- Retry Final Test generates a new randomized set using the same scope and question count.

## CHANGED FILES

- `src/App.jsx`
- `src/App.css`
- `src/utils/finalTestSelection.js`
- `scripts/test-final-test-selection.js`
- `package.json`
- `package-lock.json`
- `README.md`
- `data/generated/final_test_random_scope_v7.6_report.md`

## TESTED BEHAVIOR

- `npm run finaltest:test-selection`
  - Loaded 645 local questions.
  - All Questions selected 100 unique questions.
  - Aircraft Systems found 326 eligible questions and selected 100 unique questions.
- `npm run build`
- `npm run lint -- --max-warnings=0`

## NEXT PATCH RECOMMENDATION

Add optional persisted final-test history in localStorage only, separate from topic stats, so the user can see recent final-test scores without writing personal results to Supabase.
