import test from 'node:test'
import assert from 'node:assert/strict'
import { assertUploadSize, encodingCandidates, prepareUpload, renamedForType, shouldResize, stageLargeUploads, targetDimensions, uploadBatches, uploadInBatches, UploadTooLargeError, MAX_FILE_BYTES, RESIZE_THRESHOLD_BYTES, UPLOAD_LIMIT_BYTES } from '../app/utils/uploadFile.ts'

const MB = 1024 * 1024

test('only large JPEG, PNG and WebP images are resized', () => {
  assert.equal(shouldResize({ type: 'image/jpeg', size: 5 * MB }), true)
  assert.equal(shouldResize({ type: 'image/png', size: RESIZE_THRESHOLD_BYTES + 1 }), true)
  assert.equal(shouldResize({ type: 'image/webp', size: 4 * MB }), true)
  assert.equal(shouldResize({ type: 'image/jpeg', size: RESIZE_THRESHOLD_BYTES }), false)
  assert.equal(shouldResize({ type: 'image/gif', size: 8 * MB }), false)
  assert.equal(shouldResize({ type: 'application/pdf', size: 8 * MB }), false)
})

test('target dimensions cap the longest edge without upscaling', () => {
  assert.deepEqual(targetDimensions(4032, 3024), { width: 2560, height: 1920 })
  assert.deepEqual(targetDimensions(3000, 6000), { width: 1280, height: 2560 })
  assert.deepEqual(targetDimensions(1920, 1080), { width: 1920, height: 1080 })
  assert.deepEqual(targetDimensions(2560, 100), { width: 2560, height: 100 })
  assert.deepEqual(targetDimensions(100000, 10), { width: 2560, height: 1 })
})

test('transparent formats never become JPEG and names follow the output type', () => {
  assert.deepEqual(encodingCandidates('image/jpeg'), ['image/jpeg'])
  assert.deepEqual(encodingCandidates('image/png'), ['image/webp', 'image/png'])
  assert.deepEqual(encodingCandidates('image/webp'), ['image/webp'])
  assert.equal(renamedForType('IMG_0001.PNG', 'image/webp'), 'IMG_0001.webp')
  assert.equal(renamedForType('receipt.photo.jpeg', 'image/jpeg'), 'receipt.photo.jpg')
  assert.equal(renamedForType('.png', 'image/png'), 'image.png')
})

test('files over 5 MB are rejected with a readable message', () => {
  assert.doesNotThrow(() => assertUploadSize({ name: 'ok.pdf', type: 'application/pdf', size: MAX_FILE_BYTES }))
  assert.doesNotThrow(() => assertUploadSize({ name: 'ok.pdf', type: 'application/pdf', size: 4.6 * MB }))
  assert.throws(() => assertUploadSize({ name: 'scan.pdf', type: 'application/pdf', size: 6.2 * MB }), (error: unknown) =>
    error instanceof UploadTooLargeError && error.message.includes('"scan.pdf" is 6.2 MB') && error.message.includes('5 MB or smaller'))
})

test('a photo over 5 MB is refused before it would be shrunk', async () => {
  const photo = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'phone.jpg', { type: 'image/jpeg' })
  await assert.rejects(prepareUpload(photo), UploadTooLargeError)
})

test('files over the request limit are sent in pieces and named in the form', async () => {
  const form = new FormData()
  form.append('purpose', 'application')
  form.append('files', new File([new Uint8Array(1000)], 'small.pdf', { type: 'application/pdf' }))
  form.append('files', new File([new Uint8Array(4.5 * MB)], 'permit.pdf', { type: 'application/pdf' }))
  const pieces: { index: string, total: string, size: number }[] = []
  const staged = await stageLargeUploads(form, async piece => { pieces.push({ index: String(piece.get('index')), total: String(piece.get('total')), size: (piece.get('chunk') as Blob).size }) })
  assert.deepEqual(pieces.map(piece => [piece.index, piece.total]), [['0', '3'], ['1', '3'], ['2', '3']])
  assert.equal(pieces.reduce((sum, piece) => sum + piece.size, 0), 4.5 * MB)
  assert.ok(pieces.every(piece => piece.size <= 2 * MB))
  assert.equal(staged.get('purpose'), 'application')
  assert.deepEqual(staged.getAll('files').map(file => (file as File).name), ['small.pdf'])
  const chunked = JSON.parse(String(staged.get('chunkedFiles')))
  assert.equal(chunked.length, 1)
  assert.equal(chunked[0].name, 'permit.pdf')
  assert.match(chunked[0].uploadId, /^[a-f0-9]{32}$/)
  const untouched = new FormData()
  untouched.append('files', new File([new Uint8Array(UPLOAD_LIMIT_BYTES)], 'fits.pdf'))
  assert.equal(await stageLargeUploads(untouched, async () => { throw new Error('should not send') }), untouched)
})

test('batches keep each request under the size limit and file cap', () => {
  const files = [3, 1, 0.5, 2, 2, 4].map(size => ({ size: size * MB }))
  assert.deepEqual(uploadBatches(files).map(batch => batch.map(file => file.size / MB)), [[3, 1], [0.5, 2], [2], [4]])
  assert.deepEqual(uploadBatches([]), [])
  assert.deepEqual(uploadBatches(Array.from({ length: 45 }, () => ({ size: 10 })), UPLOAD_LIMIT_BYTES, 20).map(batch => batch.length), [20, 20, 5])
})

test('uploadInBatches sends each batch and joins the results in order', async () => {
  const file = (name: string, size: number) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
  const sent: string[][] = []
  const results = await uploadInBatches([file('a.pdf', 3 * MB), file('b.pdf', 2 * MB), file('c.pdf', 10)], async batch => {
    sent.push(batch.map(entry => entry.name))
    return batch.map(entry => ({ id: entry.name }))
  })
  assert.deepEqual(sent, [['a.pdf'], ['b.pdf', 'c.pdf']])
  assert.deepEqual(results.map(entry => entry.id), ['a.pdf', 'b.pdf', 'c.pdf'])
  await assert.rejects(uploadInBatches([file('big.pdf', 5.5 * MB)], async () => { throw new Error('should not send') }), UploadTooLargeError)
})
