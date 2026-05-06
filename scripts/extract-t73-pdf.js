import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import pdf from 'pdf-parse/lib/pdf-parse.js'

const INPUT_PATH = 'data/import/T73_R01_TEST_737_R01.pdf'
const OUTPUT_PATH = 'data/generated/t73_r01_questions.json'
const SOURCE_DOCUMENT = 'T73 R01 TEST 737_R01.pdf'
const SOURCE_REVISION = 'R01'
const IMPORT_BATCH = 'T73_R01_2022-03-10'
const MANUAL_REFERENCE = 'T73 Rev 01'
const MIN_ACCEPTABLE_ROWS = 600
const CORRECT_MAP = {
  1: 'A',
  2: 'B',
  3: 'C',
  4: 'D',
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}

function removeHeaders(text) {
  return text
    .split('\n')
    .filter((line) => {
      const normalized = normalizeWhitespace(line)
      return ![
        /^Doc\. No\. T73$/i,
        /^Rev:\s*01$/i,
        /^Date:\s*10 Mar 22$/i,
        /^Page:\s*\d+\s*of\s*\d+$/i,
        /^ID\s+Question\s+AnswerOne\s+AnswerTwo\s+AnswerThree\s+AnswerFour\s+Correct\s+Argument$/i,
        /^TEST 737$/i,
      ].some((pattern) => pattern.test(normalized))
    })
    .join('\n')
}

function splitCandidateCells(rowText) {
  return rowText
    .split(/\s{2,}|\t+/)
    .map(normalizeWhitespace)
    .filter(Boolean)
}

function parseRow(rowText, sourcePage) {
  const normalizedRow = normalizeWhitespace(rowText)
  const idMatch = normalizedRow.match(/^(\d+)\s+(.+)$/)

  if (!idMatch) {
    return null
  }

  const sourceId = Number(idMatch[1])
  const withoutId = idMatch[2]
  const cells = splitCandidateCells(withoutId)

  if (cells.length >= 7) {
    const correctIndex = cells.findIndex((cell, index) => index >= 5 && /^[1-4]$/.test(cell))

    if (correctIndex >= 5 && cells[correctIndex + 1]) {
      return buildQuestion({
        sourceId,
        question: cells.slice(0, correctIndex - 4).join(' '),
        answerA: cells[correctIndex - 4],
        answerB: cells[correctIndex - 3],
        answerC: cells[correctIndex - 2],
        answerD: cells[correctIndex - 1],
        correct: cells[correctIndex],
        topic: cells.slice(correctIndex + 1).join(' '),
        sourcePage,
      })
    }
  }

  const tailMatch = withoutId.match(/\s([1-4])\s+([^0-9]+)$/)

  if (!tailMatch) {
    return null
  }

  const correct = tailMatch[1]
  const topic = tailMatch[2]
  const leading = withoutId.slice(0, tailMatch.index).trim()
  const leadingCells = splitCandidateCells(leading)

  if (leadingCells.length < 5) {
    return null
  }

  return buildQuestion({
    sourceId,
    question: leadingCells.slice(0, -4).join(' '),
    answerA: leadingCells.at(-4),
    answerB: leadingCells.at(-3),
    answerC: leadingCells.at(-2),
    answerD: leadingCells.at(-1),
    correct,
    topic,
    sourcePage,
  })
}

function buildQuestion({ sourceId, question, answerA, answerB, answerC, answerD, correct, topic, sourcePage }) {
  const row = {
    source_id: sourceId,
    topic: normalizeWhitespace(topic),
    subtopic: null,
    question: normalizeWhitespace(question),
    answer_a: normalizeWhitespace(answerA),
    answer_b: normalizeWhitespace(answerB),
    answer_c: normalizeWhitespace(answerC),
    answer_d: normalizeWhitespace(answerD),
    correct_answer: CORRECT_MAP[correct],
    explanation: '',
    manual_reference: MANUAL_REFERENCE,
    source_document: SOURCE_DOCUMENT,
    source_revision: SOURCE_REVISION,
    source_page: sourcePage,
    status: 'active',
    difficulty: 'normal',
    import_batch: IMPORT_BATCH,
  }

  if (!isValidRow(row)) {
    return null
  }

  return row
}

function isValidRow(row) {
  return Boolean(
    row.source_id &&
      row.question &&
      row.answer_a &&
      row.answer_b &&
      row.answer_c &&
      row.answer_d &&
      /^[A-D]$/.test(row.correct_answer) &&
      row.topic,
  )
}

function getRowsFromPage(pageText, sourcePage) {
  const cleaned = removeHeaders(pageText)
  const rowBlocks = []
  let current = []

  for (const line of cleaned.split('\n')) {
    const normalizedLine = normalizeWhitespace(line)

    if (!normalizedLine) {
      continue
    }

    if (/^\d+(\s+|$)/.test(normalizedLine)) {
      if (current.length > 0) {
        rowBlocks.push(current.join('\n'))
      }
      current = [normalizedLine]
      continue
    }

    if (current.length > 0) {
      current.push(normalizedLine)
    }
  }

  if (current.length > 0) {
    rowBlocks.push(current.join('\n'))
  }

  return rowBlocks.map((block) => parseRow(block, sourcePage))
}

function renderPageText(textItems) {
  const lineMap = new Map()

  for (const item of textItems) {
    const text = normalizeWhitespace(item.str)

    if (!text) {
      continue
    }

    const y = Math.round(item.transform[5])
    const x = item.transform[4]
    const width = item.width || 0
    const line = lineMap.get(y) || []
    line.push({ text, x, width })
    lineMap.set(y, line)
  }

  return Array.from(lineMap.entries())
    .sort(([leftY], [rightY]) => rightY - leftY)
    .map(([, lineItems]) => {
      const sortedItems = lineItems.sort((left, right) => left.x - right.x)
      let lastRight = null

      return sortedItems
        .map((item) => {
          const gap = lastRight === null ? 0 : item.x - lastRight
          lastRight = item.x + item.width
          return `${gap > 12 ? '  ' : ' '}${item.text}`
        })
        .join('')
        .trim()
    })
    .join('\n')
}

async function getPageTexts(fileBuffer) {
  const pageTexts = []
  let pageNumber = 0

  await pdf(fileBuffer, {
    pagerender: async (pageData) => {
      pageNumber += 1
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      })
      const pageText = renderPageText(textContent.items)
      pageTexts.push({ pageNumber, pageText })
      return pageText
    },
  })

  return pageTexts
}

async function main() {
  try {
    const pdfBuffer = await fs.readFile(INPUT_PATH)
    const pageTexts = await getPageTexts(pdfBuffer)
    const extractedRows = []
    let skippedRows = 0

    for (const { pageNumber, pageText } of pageTexts) {
      for (const row of getRowsFromPage(pageText, pageNumber)) {
        if (row) {
          extractedRows.push(row)
        } else {
          skippedRows += 1
        }
      }
    }

    extractedRows.sort((a, b) => a.source_id - b.source_id)

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
    await fs.writeFile(`${OUTPUT_PATH}.tmp`, `${JSON.stringify(extractedRows, null, 2)}\n`)

    if (extractedRows.length < MIN_ACCEPTABLE_ROWS) {
      await fs.rm(`${OUTPUT_PATH}.tmp`, { force: true })
      console.error('Extraction quality is not acceptable. Fewer than 600 valid rows were extracted.')
      console.log(`extracted rows count: ${extractedRows.length}`)
      console.log(`first source_id: ${extractedRows[0]?.source_id || 'none'}`)
      console.log(`last source_id: ${extractedRows.at(-1)?.source_id || 'none'}`)
      console.log(`skipped rows count: ${skippedRows}`)
      console.log(`output path: ${OUTPUT_PATH}`)
      process.exit(1)
    }

    await fs.rename(`${OUTPUT_PATH}.tmp`, OUTPUT_PATH)

    console.log(`extracted rows count: ${extractedRows.length}`)
    console.log(`first source_id: ${extractedRows[0]?.source_id || 'none'}`)
    console.log(`last source_id: ${extractedRows.at(-1)?.source_id || 'none'}`)
    console.log(`skipped rows count: ${skippedRows}`)
    console.log(`output path: ${OUTPUT_PATH}`)
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('Place T73 R01 TEST 737_R01.pdf in data/import/T73_R01_TEST_737_R01.pdf and rerun npm run extract:t73.')
      process.exit(1)
    }

    console.error(error.message)
    process.exit(1)
  }
}

main()
