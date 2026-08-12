import assert from 'node:assert/strict'
import test from 'node:test'

import { getNextQueueItem, moveItem, sanitizeQueueSongIds } from '../src/lib/queue.ts'

test('moveItem reorders an item without mutating the input', () => {
  const original = ['a', 'b', 'c']
  assert.deepEqual(moveItem(original, 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(original, ['a', 'b', 'c'])
})

test('moveItem returns a copy for invalid indexes', () => {
  const original = ['a', 'b']
  const result = moveItem(original, -1, 1)
  assert.deepEqual(result, original)
  assert.notStrictEqual(result, original)
})

test('sanitizeQueueSongIds filters unknown and duplicate songs', () => {
  const availableSongIds = new Set(['song-a', 'song-b'])
  assert.deepEqual(
    sanitizeQueueSongIds(['song-a', 'missing', 'song-a', 42, 'song-b'], availableSongIds),
    ['song-a', 'song-b'],
  )
})

const queue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

test('getNextQueueItem follows sequential order and stops at the end', () => {
  assert.equal(getNextQueueItem(queue, 'a', 'sequential', 1)?.id, 'b')
  assert.equal(getNextQueueItem(queue, 'c', 'sequential', 1), null)
})

test('getNextQueueItem wraps repeat-list and honors stop-after-current', () => {
  assert.equal(getNextQueueItem(queue, 'c', 'repeat-list', 1)?.id, 'a')
  assert.equal(getNextQueueItem(queue, 'a', 'stop-after-current', 1, false), null)
})

test('getNextQueueItem shuffle excludes the active item', () => {
  assert.equal(getNextQueueItem(queue, 'a', 'shuffle', 1, true, () => 0)?.id, 'b')
})
