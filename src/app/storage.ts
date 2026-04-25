import type { PracticeMarker, SongCategoryMap, UserCategory } from './types'

export const getStoredNumber = (key: string, fallback: number) => {
  const value = Number(window.localStorage.getItem(key))
  return Number.isFinite(value) ? value : fallback
}

export const getStoredNumberInRange = (key: string, fallback: number, min: number, max: number) => {
  const value = getStoredNumber(key, fallback)
  return value >= min && value <= max ? value : fallback
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
