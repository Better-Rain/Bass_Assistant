export const QUEUE_STORAGE_KEY = 'bass-record.queue'

type QueuePlaybackMode = 'sequential' | 'shuffle' | 'repeat-one' | 'stop-after-current' | 'repeat-list'

export const getNextQueueItem = <T extends { id: string }>(
  items: readonly T[],
  activeItemId: string | null,
  playbackMode: QueuePlaybackMode,
  direction: -1 | 1,
  manual = true,
  random = Math.random,
): T | null => {
  if (items.length === 0 || (!manual && playbackMode === 'stop-after-current')) {
    return null
  }

  if (playbackMode === 'shuffle') {
    if (items.length === 1) {
      return items[0]
    }

    const candidates = activeItemId ? items.filter((item) => item.id !== activeItemId) : items
    return candidates[Math.floor(random() * candidates.length)] ?? null
  }

  const currentIndex = activeItemId ? items.findIndex((item) => item.id === activeItemId) : -1
  const baseIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : items.length
  const nextIndex = baseIndex + direction

  if (nextIndex < 0 || nextIndex >= items.length) {
    return playbackMode === 'repeat-list'
      ? items[(nextIndex + items.length) % items.length]
      : null
  }

  return items[nextIndex]
}

export const moveItem = <T>(items: readonly T[], fromIndex: number, toIndex: number): T[] => {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items]
  }

  const nextItems = [...items]
  const [movedItem] = nextItems.splice(fromIndex, 1)
  nextItems.splice(toIndex, 0, movedItem)
  return nextItems
}

export const sanitizeQueueSongIds = (value: unknown, availableSongIds: ReadonlySet<string>): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  return value.filter((songId): songId is string => {
    if (typeof songId !== 'string' || !availableSongIds.has(songId) || seen.has(songId)) {
      return false
    }

    seen.add(songId)
    return true
  })
}

export const getStoredQueueSongIds = (availableSongIds: ReadonlySet<string>): string[] => {
  try {
    const rawValue = window.localStorage.getItem(QUEUE_STORAGE_KEY)
    return sanitizeQueueSongIds(rawValue ? JSON.parse(rawValue) : [], availableSongIds)
  } catch {
    return []
  }
}
