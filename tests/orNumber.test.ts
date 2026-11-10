import test from 'node:test'
import assert from 'node:assert/strict'
import { matchOrNumber } from '../app/utils/orNumber.ts'

test('reads the common ways a receipt prints its OR number', () => {
  assert.equal(matchOrNumber('UNIVERSITY CASHIER\nOfficial Receipt No. 0012345\nAmount 16,938.38'), '0012345')
  assert.equal(matchOrNumber('O.R. No: A-88231'), 'A-88231')
  assert.equal(matchOrNumber('OR#8823109'), '8823109')
  assert.equal(matchOrNumber('Receipt Number 55/2026'), '55/2026')
  assert.equal(matchOrNumber('OFFICIAL RECEIPT 7781234'), '7781234')
})

test('finds nothing when the picture has no OR number', () => {
  assert.equal(matchOrNumber(''), null)
  assert.equal(matchOrNumber('Thank you for your payment'), null)
  assert.equal(matchOrNumber('OR 12'), null)
})

test('never returns a number the server would refuse', () => {
  assert.equal(matchOrNumber(`OR No. ${'9'.repeat(41)}`), null)
})
