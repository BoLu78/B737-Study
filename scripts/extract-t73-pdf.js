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
const MIN_ACCEPTABLE_ROWS = 640
const DEBUG = process.argv.includes('--debug')

const CORRECT_MAP = {
  1: 'A',
  2: 'B',
  3: 'C',
  4: 'D',
}

const KNOWN_TOPICS = [
  'Performance and flight planning',
  'Flight instrument display',
  'LONG HAUL - ETOPS',
  'Aeroplane General',
  'ANTI-ICE / RAIN',
  'Automatic flight',
  'Fire protection',
  'Flight Controls',
  'Dangerous Goods',
  'RVSM / B-RNAV',
  'Communications',
  'Engines / APU',
  'General basic',
  'Landing gear',
  'Air system',
  'Electrical',
  'Limitations',
  'Hydraulics',
  'Safety',
  'Fuel',
]

const COLUMN_BANDS = [
  ['id', 0, 80],
  ['question', 80, 190],
  ['answer_a', 190, 315],
  ['answer_b', 315, 440],
  ['answer_c', 440, 565],
  ['answer_d', 565, 695],
  ['correct', 695, 725],
  ['topic', 725, Infinity],
]

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}

function appendText(current, next) {
  const cleanNext = normalizeWhitespace(next)

  if (!cleanNext) {
    return current
  }

  if (!current) {
    return cleanNext
  }

  if (/^[,.;:?!)]/.test(cleanNext) || /[-/]$/.test(current)) {
    return `${current}${cleanNext}`
  }

  return `${current} ${cleanNext}`
}

function getColumnName(columnPosition) {
  return COLUMN_BANDS.find(([, min, max]) => columnPosition >= min && columnPosition < max)?.[0] || null
}

function isHeaderOrFooter(text) {
  return [
    /^Doc\. No\. T73$/i,
    /^Rev:\s*01$/i,
    /^Date:\s*10 Mar 22$/i,
    /^Page:\s*\d+\s*of\s*\d+$/i,
    /^ID$/i,
    /^Question$/i,
    /^AnswerOne$/i,
    /^AnswerTwo$/i,
    /^AnswerThree$/i,
    /^AnswerFour$/i,
    /^Correct$/i,
    /^Argumen$/i,
    /^Argument$/i,
    /^t$/i,
    /^TEST 737$/i,
  ].some((pattern) => pattern.test(text))
}

function createEmptyRow(sourceId, sourcePage, rowPosition) {
  return {
    source_id: sourceId,
    source_page: sourcePage,
    row_position: rowPosition,
    topic: '',
    question: '',
    answer_a: '',
    answer_b: '',
    answer_c: '',
    answer_d: '',
    correct: '',
  }
}

function findRowForItem(rowStarts, rowPosition) {
  if (rowStarts.length === 0) {
    return null
  }

  for (let index = 0; index < rowStarts.length; index += 1) {
    const previous = rowStarts[index - 1]
    const current = rowStarts[index]
    const next = rowStarts[index + 1]
    const lowerBound = previous ? (previous.rowPosition + current.rowPosition) / 2 : current.rowPosition - 14
    const upperBound = next ? (current.rowPosition + next.rowPosition) / 2 : current.rowPosition + 18

    if (rowPosition >= lowerBound && rowPosition < upperBound) {
      return current
    }
  }

  return null
}

function getTextItems(pageData) {
  return pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  })
}

function getItemGeometry(item) {
  return {
    text: normalizeWhitespace(item.str),
    rowPosition: item.transform[4],
    columnPosition: item.transform[5],
    width: item.width || 0,
  }
}

function splitIdQuestion(text) {
  const match = text.match(/^(\d{1,3})(?:\s+|$)(.*)$/)

  if (!match) {
    return null
  }

  const sourceId = Number(match[1])

  if (sourceId < 1 || sourceId > 645) {
    return null
  }

  return {
    sourceId,
    questionRemainder: normalizeWhitespace(match[2]),
  }
}

function normalizeQuestionRow(row) {
  repairMissingCorrect(row)

  const normalized = {
    source_id: row.source_id,
    topic: normalizeTopic(row.topic),
    subtopic: null,
    question: normalizeWhitespace(row.question),
    answer_a: normalizeWhitespace(row.answer_a),
    answer_b: normalizeWhitespace(row.answer_b),
    answer_c: normalizeWhitespace(row.answer_c),
    answer_d: normalizeWhitespace(row.answer_d),
    correct_answer: CORRECT_MAP[row.correct],
    explanation: '',
    manual_reference: MANUAL_REFERENCE,
    source_document: SOURCE_DOCUMENT,
    source_revision: SOURCE_REVISION,
    source_page: row.source_page,
    status: 'active',
    difficulty: 'normal',
    import_batch: IMPORT_BATCH,
  }

  repairQuestionAnswerA(normalized)
  repairMissingAnswerCells(normalized)

  return normalized
}

function normalizeTopic(topic) {
  const normalizedTopic = normalizeWhitespace(topic)
  const exactTopic = KNOWN_TOPICS.find((knownTopic) => knownTopic.toLowerCase() === normalizedTopic.toLowerCase())
  const compactTopic = normalizedTopic.replace(/\s+/g, '').toLowerCase()
  const compactExactTopic = KNOWN_TOPICS.find((knownTopic) => knownTopic.replace(/\s+/g, '').toLowerCase() === compactTopic)

  return exactTopic || compactExactTopic || normalizedTopic
}

function repairQuestionAnswerA(row) {
  if (row.answer_a || !row.question) {
    return
  }

  const trueFalseMatch = row.question.match(/^(.*)\s+(True|False)$/i)

  if (trueFalseMatch && /^false$/i.test(row.answer_b)) {
    row.question = normalizeWhitespace(trueFalseMatch[1])
    row.answer_a = normalizeWhitespace(trueFalseMatch[2])
    return
  }

  const splitMatch = row.question.match(/^(.*[?:])\s*(\S.+)$/)

  if (!splitMatch) {
    return
  }

  row.question = normalizeWhitespace(splitMatch[1])
  row.answer_a = normalizeWhitespace(splitMatch[2])
}

function repairMissingCorrect(row) {
  if (CORRECT_MAP[row.correct]) {
    return
  }

  const answerDMatch = normalizeWhitespace(row.answer_d).match(/^(.*)\s+([1-4])$/)

  if (!answerDMatch) {
    return
  }

  row.answer_d = answerDMatch[1]
  row.correct = answerDMatch[2]
}

function repairMissingAnswerCells(row) {
  if (!row.answer_a) {
    row.answer_a = 'Not applicable'
  }

  if (!row.answer_b) {
    row.answer_b = 'Not applicable'
  }

  if (!row.answer_c) {
    row.answer_c = 'Not applicable'
  }

  if (!row.answer_d) {
    row.answer_d = 'Not applicable'
  }
}

function isValidRow(row) {
  return Boolean(
    Number.isInteger(row.source_id) &&
      row.source_id >= 1 &&
      row.source_id <= 645 &&
      row.topic &&
      row.question &&
      row.answer_a &&
      row.answer_b &&
      row.answer_c &&
      row.answer_d &&
      /^[A-D]$/.test(row.correct_answer),
  )
}

function parsePageByCoordinates(items, sourcePage) {
  const cleanItems = items
    .map(getItemGeometry)
    .filter((item) => item.text && !isHeaderOrFooter(item.text))

  const rowStarts = cleanItems
    .filter((item) => getColumnName(item.columnPosition) === 'id' && splitIdQuestion(item.text))
    .map((item) => ({
      ...splitIdQuestion(item.text),
      rowPosition: item.rowPosition,
    }))
    .sort((left, right) => left.rowPosition - right.rowPosition)

  const rowsById = new Map()

  for (const rowStart of rowStarts) {
    rowsById.set(rowStart.sourceId, createEmptyRow(rowStart.sourceId, sourcePage, rowStart.rowPosition))
    rowsById.get(rowStart.sourceId).question = appendText(rowsById.get(rowStart.sourceId).question, rowStart.questionRemainder)
  }

  for (const item of cleanItems.sort((left, right) => left.rowPosition - right.rowPosition || left.columnPosition - right.columnPosition)) {
    const rowStart = findRowForItem(rowStarts, item.rowPosition)

    if (!rowStart) {
      continue
    }

    const row = rowsById.get(rowStart.sourceId)
    const columnName = getColumnName(item.columnPosition)

    if (!row || !columnName) {
      continue
    }

    if (columnName === 'id') {
      const idQuestion = splitIdQuestion(item.text)

      if (idQuestion?.sourceId === row.source_id) {
        continue
      }

      if (!idQuestion) {
        row.question = appendText(row.question, item.text)
      }

      continue
    }

    if (columnName === 'correct') {
      const correctTopicMatch = item.text.match(/^([1-4])(?:\s+(.+))?$/)

      if (correctTopicMatch) {
        row.correct = correctTopicMatch[1]
        row.topic = appendText(row.topic, correctTopicMatch[2])
      }
      continue
    }

    if (columnName === 'topic') {
      row.topic = appendText(row.topic, item.text)
      continue
    }

    if (columnName !== 'id') {
      row[columnName] = appendText(row[columnName], item.text)
    }
  }

  return Array.from(rowsById.values()).map(normalizeQuestionRow)
}

function renderPageText(items) {
  const lineMap = new Map()

  for (const item of items.map(getItemGeometry)) {
    if (!item.text || isHeaderOrFooter(item.text)) {
      continue
    }

    const rowKey = Math.round(item.rowPosition)
    const line = lineMap.get(rowKey) || []
    line.push(item)
    lineMap.set(rowKey, line)
  }

  return Array.from(lineMap.entries())
    .sort(([leftRow], [rightRow]) => leftRow - rightRow)
    .map(([, lineItems]) =>
      lineItems
        .sort((left, right) => left.columnPosition - right.columnPosition)
        .map((item) => item.text)
        .join(' '),
    )
    .join('\n')
}

function extractKnownTopic(blockText) {
  const normalizedBlock = normalizeWhitespace(blockText)
  const topic = KNOWN_TOPICS.find((knownTopic) => normalizedBlock.toLowerCase().endsWith(knownTopic.toLowerCase()))

  if (!topic) {
    return null
  }

  return {
    topic,
    leadingText: normalizedBlock.slice(0, -topic.length).trim(),
  }
}

function parseFallbackBlock(blockText, sourcePage) {
  const normalizedBlock = normalizeWhitespace(blockText)
  const idMatch = normalizedBlock.match(/^(\d{1,3})\s+(.+)$/)

  if (!idMatch) {
    return null
  }

  const sourceId = Number(idMatch[1])
  const topicMatch = extractKnownTopic(idMatch[2])

  if (!topicMatch) {
    return null
  }

  const correctMatch = topicMatch.leadingText.match(/^(.*)\s+([1-4])$/)

  if (!correctMatch) {
    return null
  }

  const cells = correctMatch[1].split(/\s{2,}/).map(normalizeWhitespace).filter(Boolean)

  if (cells.length < 5) {
    return null
  }

  return normalizeQuestionRow({
    source_id: sourceId,
    source_page: sourcePage,
    question: cells.slice(0, -4).join(' '),
    answer_a: cells.at(-4),
    answer_b: cells.at(-3),
    answer_c: cells.at(-2),
    answer_d: cells.at(-1),
    correct: correctMatch[2],
    topic: topicMatch.topic,
  })
}

function parsePageByFallbackText(items, sourcePage) {
  const text = renderPageText(items)
  const blocks = []
  let currentBlock = []

  for (const line of text.split('\n')) {
    if (/^\d{1,3}\s+/.test(line)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join(' '))
      }
      currentBlock = [line]
      continue
    }

    if (currentBlock.length > 0) {
      currentBlock.push(line)
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join(' '))
  }

  return blocks.map((block) => parseFallbackBlock(block, sourcePage)).filter(Boolean)
}

async function extractPages(fileBuffer) {
  const pages = []
  let pageNumber = 0

  await pdf(fileBuffer, {
    pagerender: async (pageData) => {
      pageNumber += 1
      const textContent = await getTextItems(pageData)
      pages.push({
        pageNumber,
        items: textContent.items,
      })
      return ''
    },
  })

  return pages
}

function mergeRows(primaryRows, fallbackRows) {
  const rowsById = new Map(primaryRows.map((row) => [row.source_id, row]))

  for (const fallbackRow of fallbackRows) {
    const currentRow = rowsById.get(fallbackRow.source_id)

    if (!currentRow || !isValidRow(currentRow)) {
      rowsById.set(fallbackRow.source_id, fallbackRow)
    }
  }

  return Array.from(rowsById.values()).sort((left, right) => left.source_id - right.source_id)
}

function getSkippedRowIds(rows) {
  const validIds = new Set(rows.filter(isValidRow).map((row) => row.source_id))
  const skippedRowIds = []

  for (let sourceId = 1; sourceId <= 645; sourceId += 1) {
    if (!validIds.has(sourceId)) {
      skippedRowIds.push(sourceId)
    }
  }

  return skippedRowIds
}

async function main() {
  try {
    const pdfBuffer = await fs.readFile(INPUT_PATH)
    const pages = await extractPages(pdfBuffer)
    const coordinateRows = pages.flatMap((page) => parsePageByCoordinates(page.items, page.pageNumber))
    const fallbackRows = pages.flatMap((page) => parsePageByFallbackText(page.items, page.pageNumber))
    const mergedRows = mergeRows(coordinateRows, fallbackRows)
    const extractedRows = mergedRows.filter(isValidRow)
    const skippedRowIds = getSkippedRowIds(extractedRows)
    const parserStrategy = fallbackRows.length > 0
      ? 'coordinate column bands with fallback block parser'
      : 'coordinate column bands'

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })

    if (extractedRows.length < MIN_ACCEPTABLE_ROWS) {
      await fs.rm(OUTPUT_PATH, { force: true })
      console.error('Extraction quality is not acceptable. Fewer than 640 valid rows were extracted.')
      printSummary(parserStrategy, extractedRows, skippedRowIds)
      if (DEBUG) {
        printDebug(extractedRows, skippedRowIds, mergedRows)
      }
      process.exit(1)
    }

    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(extractedRows, null, 2)}\n`)
    printSummary(parserStrategy, extractedRows, skippedRowIds)

    if (DEBUG) {
      printDebug(extractedRows, skippedRowIds, mergedRows)
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('Place T73 R01 TEST 737_R01.pdf in data/import/T73_R01_TEST_737_R01.pdf and rerun npm run extract:t73.')
      process.exit(1)
    }

    console.error(error.message)
    process.exit(1)
  }
}

function printSummary(parserStrategy, rows, skippedRowIds) {
  console.log(`parser strategy used: ${parserStrategy}`)
  console.log(`extracted rows count: ${rows.length}`)
  console.log(`first source_id: ${rows[0]?.source_id || 'none'}`)
  console.log(`last source_id: ${rows.at(-1)?.source_id || 'none'}`)
  console.log(`skipped rows count: ${skippedRowIds.length}`)
  console.log(`output path: ${OUTPUT_PATH}`)
}

function printDebug(rows, skippedRowIds, allRows) {
  console.log('first 3 parsed rows:')
  console.log(JSON.stringify(rows.slice(0, 3), null, 2))
  console.log('last 3 parsed rows:')
  console.log(JSON.stringify(rows.slice(-3), null, 2))
  console.log(`skipped row IDs: ${skippedRowIds.join(', ') || 'none'}`)
  console.log('first 10 skipped row snapshots:')
  console.log(JSON.stringify(allRows.filter((row) => skippedRowIds.includes(row.source_id)).slice(0, 10), null, 2))
}

main()
