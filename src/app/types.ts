import { defaultVariantOrder, type LibrarySong, type TrackVariant } from '../lib/tracks'

export type AppSection = 'tuner' | 'library' | 'practice' | 'input'

export type PracticeMarker = {
  id: string
  songId: string
  time: number
  label: string
}

export const sectionItems: { id: AppSection; label: string }[] = [
  { id: 'tuner', label: 'Tuner' },
  { id: 'library', label: 'Library' },
  { id: 'practice', label: 'Practice' },
  { id: 'input', label: 'Input' },
]

export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }

  const rounded = Math.floor(seconds)
  const minutes = Math.floor(rounded / 60)
  const remainingSeconds = rounded % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export const pickTrackVariant = (song: LibrarySong, preferredVariant: TrackVariant) => {
  const variants = song.variants
  return (
    variants[preferredVariant] ??
    defaultVariantOrder.map((variant) => variants[variant]).find(Boolean) ??
    null
  )
}

export const stopOscillator = (oscillator: OscillatorNode | null | undefined) => {
  if (!oscillator) {
    return
  }

  try {
    oscillator.stop()
  } catch {
    // Ignore repeated stop calls during rapid toggles.
  }
}
