import type { PracticeMarker, SongCategoryMap, UserCategory } from './types'

export const getStoredNumber = (key: string, fallback: number) => {
  const storedValue = window.localStorage.getItem(key)

  if (storedValue === null) {
    return fallback
  }

  const value = Number(storedValue)
  return Number.isFinite(value) ? value : fallback
}

export const getStoredNumberInRange = (key: string, fallback: number, min: number, max: number) => {
  const value = getStoredNumber(key, fallback)
  return value >= min && value <= max ? value : fallback
}

export const getStoredNumberOption = (key: string, fallback: number, options: readonly number[]) => {
  const value = getStoredNumber(key, fallback)
  return options.includes(value) ? value : fallback
}

export const getStoredString = (key: string, fallback: string) =>
  window.localStorage.getItem(key) ?? fallback

export const getStoredStringArray = (key: string) => {
  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as string[]) : []
  } catch {
    return []
  }
}

const playbackModes = [
  'sequential',
  'shuffle',
  'repeat-one',
  'stop-after-current',
  'repeat-list',
] as const

export const getStoredPlaybackMode = (key: string, fallback: typeof playbackModes[number]) => {
  const value = window.localStorage.getItem(key)
  return playbackModes.includes(value as typeof playbackModes[number])
    ? value as typeof playbackModes[number]
    : fallback
}

export const getStoredMarkers = () => {
  try {
    const value = window.localStorage.getItem('bass-record.markers')
    return value ? (JSON.parse(value) as PracticeMarker[]) : []
  } catch {
    return []
  }
}

export const getStoredNotes = () => {
  try {
    const value = window.localStorage.getItem('bass-record.practiceNotes')
    return value ? (JSON.parse(value) as Record<string, string>) : {}
  } catch {
    return {}
  }
}


export const getStoredUserCategories = () => {
  try {
    const value = window.localStorage.getItem('bass-record.userCategories')
    return value ? (JSON.parse(value) as UserCategory[]) : []
  } catch {
    return []
  }
}

export const getStoredSongCategories = () => {
  try {
    const value = window.localStorage.getItem('bass-record.songCategories')
    return value ? (JSON.parse(value) as SongCategoryMap) : {}
  } catch {
    return {}
  }
}
