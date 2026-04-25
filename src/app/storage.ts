import type { PracticeMarker } from './types'

export const getStoredNumber = (key: string, fallback: number) => {
  const value = Number(window.localStorage.getItem(key))
  return Number.isFinite(value) ? value : fallback
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

export const getStoredPlaybackPositions = () => {
  try {
    const value = window.localStorage.getItem('bass-record.playbackPositions')
    return value ? (JSON.parse(value) as Record<string, number>) : {}
  } catch {
    return {}
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
