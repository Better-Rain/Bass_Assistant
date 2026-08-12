import assert from 'node:assert/strict'
import test from 'node:test'

const values = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
  },
}

const {
  getStoredNumber,
  getStoredNumberOption,
  getStoredPlaybackMode,
} = await import('../src/app/storage.ts')

test('getStoredNumber uses its fallback when the key is missing', () => {
  values.clear()
  assert.equal(getStoredNumber('missing', 90), 90)
})

test('getStoredNumberOption rejects unsupported persisted values', () => {
  values.set('rate', '0')
  assert.equal(getStoredNumberOption('rate', 1, [0.75, 1, 1.25, 1.5]), 1)
})

test('getStoredPlaybackMode validates persisted modes', () => {
  values.set('mode', 'repeat-list')
  assert.equal(getStoredPlaybackMode('mode', 'sequential'), 'repeat-list')
  values.set('mode', 'invalid')
  assert.equal(getStoredPlaybackMode('mode', 'sequential'), 'sequential')
})
