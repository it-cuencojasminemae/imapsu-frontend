import test from 'node:test'
import assert from 'node:assert/strict'
import { assertUploadSize, encodingCandidates, renamedForType, shouldResize, targetDimensions, uploadBatches, uploadInBatches, UploadTooLargeError, RESIZE_THRESHOLD_BYTES, UPLOAD_LIMIT_BYTES } from '../app/utils/uploadFile.ts'

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

test('files over 4 MB are rejected with a readable message', () => {
  assert.doesNotThrow(() => assertUploadSize({ name: 'ok.pdf', type: 'application/pdf', size: UPLOAD_LIMIT_BYTES }))
  assert.throws(() => assertUploadSize({ name: 'scan.pdf', type: 'application/pdf', size: 6.2 * MB }), (error: unknown) =>
    error instanceof UploadTooLargeError && error.message.includes('"scan.pdf" is 6.2 MB') && error.message.includes('under 4 MB'))
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
  await assert.rejects(uploadInBatches([file('big.pdf', 5 * MB)], async () => { throw new Error('should not send') }), UploadTooLargeError)
})
