// Finds the Official Receipt (OR) number in text read from a receipt picture.
// The tenant always reviews the number before submitting, so a miss only
// means typing it by hand.

const OR_NUMBER_PATTERNS: RegExp[] = [
  // "Official Receipt No. 123456"
  /\bofficial\s+receipt\s+(?:no\.?|number)\s*[:#.-]*\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i,
  // "OR No. 123456", "O.R. No: 123456", "OR#123456", "ORNo 123456"
  /\bo\.?\s?r\.?\s*(?:no\.?|number|#)\s*[:#.-]*\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i,
  // "Receipt No. 123456" (generic receipt number)
  /\breceipt\s+(?:no\.?|number)\s*[:#.-]*\s*([A-Za-z0-9][A-Za-z0-9/-]*)/i,
  // "Official Receipt 123456" / "OR 123456" (bare number, digits only)
  /\b(?:official\s+receipt|or)\s*[:#.-]*\s*([0-9][0-9/-]{3,})/i
]

// Matches what the server accepts as a number read from the picture.
const OR_NUMBER_SHAPE = /^[A-Za-z0-9][A-Za-z0-9/.-]{0,39}$/

export function matchOrNumber(text: string): string | null {
  const normalized = text.replace(/\r/g, ' ').replace(/[ \t]+/g, ' ')
  for (const pattern of OR_NUMBER_PATTERNS) {
    const value = normalized.match(pattern)?.[1]?.trim().replace(/[^A-Za-z0-9/.-]$/g, '')
    if (value && OR_NUMBER_SHAPE.test(value)) return value
  }
  return null
}
