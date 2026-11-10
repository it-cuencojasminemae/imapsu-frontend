import type { Worker } from 'tesseract.js'
import { matchOrNumber } from '~/utils/orNumber'

// Receipts are read in the tenant's browser. The free Render instance has too
// little memory and CPU for Tesseract: one phone photo failed its health check.
// Unlike the meter reader, this worker reads letters too ("OR No.").

// Long enough for "OR No." to stay legible, small enough for phones to read quickly.
const OCR_MAX_EDGE = 1600
// After this the tenant types the number instead of waiting.
const OCR_TIMEOUT_MS = 30_000

let workerPromise: Promise<Worker> | null = null

const getWorker = () => {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng', 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      gzip: false
    }))
    // A failed start (e.g. OCR assets missing) must not block later attempts.
    workerPromise.catch(() => { workerPromise = null })
  }
  return workerPromise
}

// Downscaled and turned upright so recognition is quick even on low-end phones.
async function prepareForOcr(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, OCR_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob ?? file), 'image/png'))
  } finally {
    bitmap.close()
  }
}

export const useReceiptOcr = () => {
  // Resolves to the OR number, or null when none was found, reading failed or
  // took too long. Never rejects.
  const readOrNumber = async (file: Blob): Promise<string | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), OCR_TIMEOUT_MS) })
    const read = (async () => {
      const [worker, image] = await Promise.all([getWorker(), prepareForOcr(file)])
      const { data } = await worker.recognize(image)
      return matchOrNumber(data.text ?? '')
    })().catch(() => null)
    try {
      return await Promise.race([read, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  return { readOrNumber }
}
