export const CANONICAL_TOPICS = [
  'Aeroplane General',
  'Air system',
  'ANTI-ICE / RAIN',
  'Automatic flight',
  'Communications',
  'Electrical',
  'Engines / APU',
  'Fire protection',
  'Flight Controls',
  'Flight instrument display',
  'Limitations',
  'Fuel',
  'Hydraulics',
  'Landing gear',
  'Performance and flight planning',
  'General basic',
  'Dangerous Goods',
  'Safety',
  'RVSM / B-RNAV',
  'LONG HAUL - ETOPS',
  'Load balance and servicing',
  'Flight management, navigation',
  'Low visibility operations',
  'Warning System',
]

function cleanTopic(rawTopic) {
  return String(rawTopic ?? '').trim().replace(/\s+/g, ' ')
}

export function normalizeTopic(rawTopic) {
  return cleanTopic(rawTopic)
    .toLowerCase()
    .replace(/[./\\_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '')
}

const TOPIC_ALIASES = new Map(
  [
    ...CANONICAL_TOPICS.map((topic) => [normalizeTopic(topic), topic]),
    ['airsystem', 'Air system'],
    ['longhauletops', 'LONG HAUL - ETOPS'],
    ['longhauletop', 'LONG HAUL - ETOPS'],
    ['automaticfligh', 'Automatic flight'],
    ['loadbalanceandservicin', 'Load balance and servicing'],
    ['flightmanagementnavigatio', 'Flight management, navigation'],
    ['flightmanagementnavigati', 'Flight management, navigation'],
    ['lowvisibilityoperation', 'Low visibility operations'],
    ['warningsystem', 'Warning System'],
  ],
)

export function getCanonicalTopic(rawTopic) {
  const cleanedTopic = cleanTopic(rawTopic)
  const normalizedTopic = normalizeTopic(cleanedTopic)

  if (!normalizedTopic) {
    return cleanedTopic
  }

  const exactTopic = TOPIC_ALIASES.get(normalizedTopic)
  if (exactTopic) {
    return exactTopic
  }

  const closeTopic = CANONICAL_TOPICS.find((topic) => {
    const canonicalTopic = normalizeTopic(topic)
    const lengthDifference = canonicalTopic.length - normalizedTopic.length

    return lengthDifference > 0 && lengthDifference <= 2 && canonicalTopic.startsWith(normalizedTopic)
  })

  return closeTopic || cleanedTopic
}
