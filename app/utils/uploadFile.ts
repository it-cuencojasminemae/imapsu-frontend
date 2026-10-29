// Vercel functions reject request bodies over 4.5 MB, so uploads stay under 4 MB including multipart overhead.
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024
export const RESIZE_THRESHOLD_BYTES = 3.5 * 1024 * 1024
export const MAX_IMAGE_EDGE = 2560
export const JPEG_QUALITY = 0.85
export const MAX_FILES_PER_REQUEST = 20

const resizableTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const extensions: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

type FileLike = { name: string, type: string, size: number }

export class UploadTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadTooLargeError'
  }
}

export const formatMegabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

// Animated GIFs and documents are never re-encoded; they only face the size check.
export const shouldResize = (file: Pick<FileLike, 'type' | 'size'>) =>
  resizableTypes.has(file.type) && file.size > RESIZE_THRESHOLD_BYTES

export function targetDimensions(width: number, height: number, maxEdge = MAX_IMAGE_EDGE) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// PNG and WebP may carry transparency, so they never become JPEG.
export const encodingCandidates = (type: string): string[] =>
  type === 'image/jpeg' ? ['image/jpeg'] : type === 'image/webp' ? ['image/webp'] : ['image/webp', 'image/png']

export const renamedForType = (name: string, type: string) => {
  const stem = name.replace(/\.[^./\\]+$/, '') || 'image'
  return stem + (extensions[type] ?? '')
}

export function assertUploadSize(file: FileLike) {
  if (file.size <= UPLOAD_LIMIT_BYTES) return
  throw new UploadTooLargeError(`"${file.name}" is ${formatMegabytes(file.size)}. Files must be under 4 MB. Compress it or upload a smaller version.`)
}

// Groups files in order so each request body stays under the upload limit and the backend's per-request file cap.
export function uploadBatches<T extends Pick<FileLike, 'size'>>(files: T[], limit = UPLOAD_LIMIT_BYTES, maxFiles = MAX_FILES_PER_REQUEST): T[][] {
  const batches: T[][] = []
  let current: T[] = [], total = 0
  for (const file of files) {
    if (current.length && (total + file.size > limit || current.length >= maxFiles)) {
      batches.push(current)
      current = []
      total = 0
    }
    current.push(file)
    total += file.size
  }
  if (current.length) batches.push(current)
  return batches
}

const encode = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>(resolve =>
  canvas.toBlob(blob => resolve(blob && blob.type === type ? blob : null), type, type === 'image/png' ? undefined : JPEG_QUALITY))

async function downscaleImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { width, height } = targetDimensions(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    let smallest: Blob | null = null
    for (const type of encodingCandidates(file.type)) {
      const blob = await encode(canvas, type)
      if (blob && (!smallest || blob.size < smallest.size)) smallest = blob
    }
    if (!smallest || smallest.size >= file.size) return file
    return new File([smallest], renamedForType(file.name, smallest.type), { type: smallest.type, lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}

export async function prepareUpload(file: File): Promise<File> {
  let prepared = file
  if (shouldResize(file)) {
    try { prepared = await downscaleImage(file) } catch { /* An undecodable image falls through to the size check. */ }
  }
  assertUploadSize(prepared)
  return prepared
}

// Prepares every file first, then sends them in request-sized batches and returns the combined results in order.
export async function uploadInBatches<T>(files: File[], send: (batch: File[]) => Promise<T[] | null | undefined>): Promise<T[]> {
  const prepared: File[] = []
  for (const file of files) prepared.push(await prepareUpload(file))
  const results: T[] = []
  for (const batch of uploadBatches(prepared)) results.push(...((await send(batch)) ?? []))
  return results
}
