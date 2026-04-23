export type TuningString = {
  label: string
  note: string
  midi: number
  frequency: number
}

export type TuningPreset = {
  id: string
  name: string
  subtitle: string
  strings: TuningString[]
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const noteToMidi = (note: string) => {
  const match = /^([A-G])(#?)(-?\d+)$/.exec(note)

  if (!match) {
    throw new Error(`Invalid note format: ${note}`)
  }

  const [, base, sharp, octaveString] = match
  const octave = Number.parseInt(octaveString, 10)
  const noteName = `${base}${sharp}`
  const noteIndex = NOTE_NAMES.indexOf(noteName)

  if (noteIndex === -1) {
    throw new Error(`Unsupported note name: ${note}`)
  }

  return (octave + 1) * 12 + noteIndex
}

export const midiToFrequency = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12)

export const noteToFrequency = (note: string, a4 = 440) => midiToFrequency(noteToMidi(note), a4)

export const midiToNote = (midi: number) => {
  const noteIndex = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES[noteIndex]}${octave}`
}

export const frequencyToMidi = (frequency: number, a4 = 440) => {
  if (frequency <= 0) {
    return 0
  }

  return 69 + 12 * Math.log2(frequency / a4)
}

export const frequencyToNote = (frequency: number, a4 = 440) => {
  const midi = Math.round(frequencyToMidi(frequency, a4))
  return midiToNote(midi)
}

export const centsOffFromPitch = (frequency: number, targetFrequency: number) =>
  1200 * Math.log2(frequency / targetFrequency)

const buildString = (label: string, note: string): TuningString => {
  const midi = noteToMidi(note)

  return {
    label,
    note,
    midi,
    frequency: midiToFrequency(midi),
  }
}

export const tuningPresets: TuningPreset[] = [
  {
    id: 'standard-4',
    name: '4 String Standard',
    subtitle: 'E A D G',
    strings: [
      buildString('4th', 'E1'),
      buildString('3rd', 'A1'),
      buildString('2nd', 'D2'),
      buildString('1st', 'G2'),
    ],
  },
  {
    id: 'drop-d',
    name: 'Drop D',
    subtitle: 'D A D G',
    strings: [
      buildString('4th', 'D1'),
      buildString('3rd', 'A1'),
      buildString('2nd', 'D2'),
      buildString('1st', 'G2'),
    ],
  },
  {
    id: 'five-standard',
    name: '5 String Standard',
    subtitle: 'B E A D G',
    strings: [
      buildString('5th', 'B0'),
      buildString('4th', 'E1'),
      buildString('3rd', 'A1'),
      buildString('2nd', 'D2'),
      buildString('1st', 'G2'),
    ],
  },
  {
    id: 'tenor',
    name: 'Tenor Bass',
    subtitle: 'A D G C',
    strings: [
      buildString('4th', 'A1'),
      buildString('3rd', 'D2'),
      buildString('2nd', 'G2'),
      buildString('1st', 'C3'),
    ],
  },
]

export const getNearestString = (frequency: number, tuning: TuningPreset, a4 = 440) => {
  const candidates = tuning.strings.map((item) => {
    const targetFrequency = midiToFrequency(item.midi, a4)
    const cents = centsOffFromPitch(frequency, targetFrequency)
    return {
      ...item,
      targetFrequency,
      cents,
      distance: Math.abs(cents),
    }
  })

  return candidates.sort((left, right) => left.distance - right.distance)[0]
}

export const getChromaticTarget = (frequency: number, a4 = 440) => {
  const midi = Math.round(frequencyToMidi(frequency, a4))
  const targetFrequency = midiToFrequency(midi, a4)

  return {
    midi,
    note: midiToNote(midi),
    targetFrequency,
    cents: centsOffFromPitch(frequency, targetFrequency),
  }
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const formatFrequency = (value: number) => `${value.toFixed(1)} Hz`

export const formatNoteName = (note: string) => {
  const match = /^([A-G]#?)(-?\d+)$/.exec(note)
  return match ? { pitchClass: match[1], octave: match[2] } : { pitchClass: note, octave: '' }
}
