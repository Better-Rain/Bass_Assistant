import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PitchDetector } from 'pitchy'

import {
  clamp,
  getChromaticTarget,
  getNearestString,
  getStringPitchMatch,
  median,
  type TuningPreset,
} from '../lib/music'

export type TunerStatus = 'idle' | 'requesting' | 'running' | 'error'

export type DeviceOption = {
  deviceId: string
  label: string
  isAlias?: boolean
}

export type ActiveInput = {
  deviceId: string
  label: string
}

export type PitchSnapshot = {
  detectedFrequency: number | null
  frequency: number | null
  clarity: number
  level: number
  cents: number | null
  note: string | null
  stringMatch: ReturnType<typeof getNearestString> | null
  chromatic: ReturnType<typeof getChromaticTarget> | null
  stability: number
  updatedAt: number | null
}

type UseBassTunerArgs = {
  selectedDeviceId: string
  tuning: TuningPreset
  concertA: number
}

const FFT_SIZE = 8192
const DISPLAY_CLARITY_THRESHOLD = 0.8
const CLARITY_THRESHOLD = 0.92
const RMS_THRESHOLD = 0.01
const MIN_DETECTED_FREQUENCY = 20
const MAX_DETECTED_FREQUENCY = 600
const DETECTED_FREQUENCY_WINDOW_SIZE = 3
const DETECTED_FREQUENCY_SMOOTHING = 0.3
const FREQUENCY_WINDOW_SIZE = 7
const INITIAL_LOCK_FRAMES = 4
const SWITCH_LOCK_FRAMES = 10
const SWITCH_ADVANTAGE_CENTS = 35
const SIGNAL_HOLD_FRAMES = 12
const NOTE_REATTACK_SILENCE_FRAMES = 6
const LOCK_RELEASE_FRAMES = 36
const SMOOTHING = 0.14

type PitchFrame = Float32Array<ArrayBuffer>

const initialSnapshot: PitchSnapshot = {
  detectedFrequency: null,
  frequency: null,
  clarity: 0,
  level: 0,
  cents: null,
  note: null,
  stringMatch: null,
  chromatic: null,
  stability: 0,
  updatedAt: null,
}

const getRmsLevel = (buffer: Float32Array) => {
  let sum = 0

  for (let index = 0; index < buffer.length; index += 1) {
    sum += buffer[index] ** 2
  }

  return Math.sqrt(sum / buffer.length)
}

export const useBassTuner = ({ selectedDeviceId, tuning, concertA }: UseBassTunerArgs) => {
  const [status, setStatus] = useState<TunerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [activeInput, setActiveInput] = useState<ActiveInput | null>(null)
  const [snapshot, setSnapshot] = useState<PitchSnapshot>(initialSnapshot)
  const [history, setHistory] = useState<string[]>([])

  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const bufferRef = useRef<PitchFrame | null>(null)
  const detectorRef = useRef<PitchDetector<PitchFrame> | null>(null)
  const smoothedFrequencyRef = useRef<number | null>(null)
  const detectedFrequencyWindowRef = useRef<number[]>([])
  const smoothedDetectedFrequencyRef = useRef<number | null>(null)
  const frequencyWindowRef = useRef<number[]>([])
  const lockedStringNoteRef = useRef<string | null>(null)
  const lockCandidateRef = useRef<{ note: string; frames: number } | null>(null)
  const silenceFramesRef = useRef(0)
  const lastStableSnapshotRef = useRef<PitchSnapshot>(initialSnapshot)
  const listenSessionRef = useRef(0)
  const tuningRef = useRef(tuning)
  const concertARef = useRef(concertA)

  const buildDeviceOptions = useCallback(
    (mediaDevices: MediaDeviceInfo[], currentActiveInput?: ActiveInput | null) => {
      const mapped = mediaDevices
        .filter((item) => item.kind === 'audioinput')
        .map((item, index) => {
          const isAlias = item.deviceId === 'default' || item.deviceId === 'communications'
          const label =
            item.label ||
            (item.deviceId === 'default'
              ? 'System Default Input'
              : item.deviceId === 'communications'
                ? 'Communications Input'
                : `Audio Input ${index + 1}`)

          return {
            deviceId: item.deviceId,
            label,
            isAlias,
          }
        })

      const unique = new Map<string, DeviceOption>()

      for (const item of mapped) {
        if (!unique.has(item.deviceId)) {
          unique.set(item.deviceId, item)
        }
      }

      if (
        currentActiveInput?.deviceId &&
        !unique.has(currentActiveInput.deviceId) &&
        currentActiveInput.label
      ) {
        unique.set(currentActiveInput.deviceId, {
          deviceId: currentActiveInput.deviceId,
          label: `${currentActiveInput.label} (Active)`,
        })
      }

      return [...unique.values()].sort((left, right) => {
        if (!!left.isAlias !== !!right.isAlias) {
          return left.isAlias ? 1 : -1
        }

        return left.label.localeCompare(right.label)
      })
    },
    [],
  )

  useEffect(() => {
    tuningRef.current = tuning
    lockedStringNoteRef.current = null
    lockCandidateRef.current = null
    frequencyWindowRef.current = []
    smoothedFrequencyRef.current = null
    detectedFrequencyWindowRef.current = []
    smoothedDetectedFrequencyRef.current = null
    lastStableSnapshotRef.current = initialSnapshot
  }, [tuning])

  useEffect(() => {
    concertARef.current = concertA
  }, [concertA])

  const stopListening = useCallback(() => {
    listenSessionRef.current += 1

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    sourceRef.current?.disconnect()
    sourceRef.current = null
    analyserRef.current?.disconnect()
    analyserRef.current = null
    bufferRef.current = null
    detectorRef.current = null

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    audioContextRef.current?.close().catch(() => undefined)
    audioContextRef.current = null
    smoothedFrequencyRef.current = null
    frequencyWindowRef.current = []
    detectedFrequencyWindowRef.current = []
    smoothedDetectedFrequencyRef.current = null
    lockedStringNoteRef.current = null
    lockCandidateRef.current = null
    silenceFramesRef.current = 0
    lastStableSnapshotRef.current = initialSnapshot
  }, [])

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return
    }

    const mediaDevices = await navigator.mediaDevices.enumerateDevices()
    const options = buildDeviceOptions(mediaDevices, activeInput)

    startTransition(() => setDevices(options))
  }, [activeInput, buildDeviceOptions])

  const startListening = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('This browser does not support microphone access.')
      return
    }

    stopListening()
    const sessionId = listenSessionRef.current
    let acquiredStream: MediaStream | null = null
    let acquiredContext: AudioContext | null = null

    setActiveInput(null)
    setSnapshot(initialSnapshot)
    setError(null)
    setStatus('requesting')

    try {
      acquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 1,
        },
      })

      if (sessionId !== listenSessionRef.current) {
        for (const track of acquiredStream.getTracks()) {
          track.stop()
        }
        return
      }

      acquiredContext = new AudioContext({
        latencyHint: 'interactive',
      })

      if (sessionId !== listenSessionRef.current) {
        for (const track of acquiredStream.getTracks()) {
          track.stop()
        }
        await acquiredContext.close().catch(() => undefined)
        return
      }

      const source = acquiredContext.createMediaStreamSource(acquiredStream)
      const analyser = acquiredContext.createAnalyser()
      const audioTrack = acquiredStream.getAudioTracks()[0] ?? null
      const nextActiveInput = audioTrack
        ? {
            deviceId: audioTrack.getSettings().deviceId ?? selectedDeviceId,
            label: audioTrack.label || 'Current Input',
          }
        : null

      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.12
      source.connect(analyser)

      audioContextRef.current = acquiredContext
      sourceRef.current = source
      streamRef.current = acquiredStream
      analyserRef.current = analyser
      bufferRef.current = new Float32Array(
        new ArrayBuffer(FFT_SIZE * Float32Array.BYTES_PER_ELEMENT),
      ) as PitchFrame
      detectorRef.current = PitchDetector.forFloat32Array(FFT_SIZE)
      smoothedFrequencyRef.current = null
      frequencyWindowRef.current = []
      detectedFrequencyWindowRef.current = []
      smoothedDetectedFrequencyRef.current = null
      lockedStringNoteRef.current = null
      lockCandidateRef.current = null
      silenceFramesRef.current = 0
      lastStableSnapshotRef.current = initialSnapshot
      setActiveInput(nextActiveInput)

      const tick = () => {
        const currentAnalyser = analyserRef.current
        const detector = detectorRef.current
        const currentContext = audioContextRef.current
        const buffer = bufferRef.current

        if (
          sessionId !== listenSessionRef.current ||
          !currentAnalyser ||
          !detector ||
          !currentContext ||
          !buffer
        ) {
          return
        }

        currentAnalyser.getFloatTimeDomainData(buffer)
        const level = getRmsLevel(buffer)
        const [rawFrequency, clarity] = detector.findPitch(buffer, currentContext.sampleRate)
        const stability = clamp((clarity - CLARITY_THRESHOLD) / 0.08, 0, 1)
        const frequencyInRange =
          Number.isFinite(rawFrequency) &&
          rawFrequency >= MIN_DETECTED_FREQUENCY &&
          rawFrequency <= MAX_DETECTED_FREQUENCY
        const pitchPresent =
          level >= RMS_THRESHOLD &&
          clarity >= DISPLAY_CLARITY_THRESHOLD &&
          frequencyInRange
        const validSignal =
          pitchPresent && clarity >= CLARITY_THRESHOLD
        const previousSilenceFrames = silenceFramesRef.current
        let detectedFrequency: number | null = null

        if (pitchPresent) {
          const previousDetectedFrequency = smoothedDetectedFrequencyRef.current
          const rawFrequencyJumpCents = previousDetectedFrequency === null
            ? 0
            : Math.abs(1200 * Math.log2(rawFrequency / previousDetectedFrequency))
          const resetDetectedFrequency =
            previousSilenceFrames >= 3 || rawFrequencyJumpCents >= 150
          const detectedWindow = (resetDetectedFrequency
            ? [rawFrequency]
            : [...detectedFrequencyWindowRef.current, rawFrequency]
          ).slice(-DETECTED_FREQUENCY_WINDOW_SIZE)
          const filteredDetectedFrequency = median(detectedWindow)

          detectedFrequency =
            previousDetectedFrequency === null ||
            resetDetectedFrequency
              ? filteredDetectedFrequency
              : previousDetectedFrequency +
                (filteredDetectedFrequency - previousDetectedFrequency) *
                  DETECTED_FREQUENCY_SMOOTHING

          detectedFrequencyWindowRef.current = detectedWindow
          smoothedDetectedFrequencyRef.current = detectedFrequency
          silenceFramesRef.current = 0
        } else {
          silenceFramesRef.current += 1
        }

        if (pitchPresent && previousSilenceFrames >= NOTE_REATTACK_SILENCE_FRAMES) {
          lockedStringNoteRef.current = null
          lockCandidateRef.current = null
          frequencyWindowRef.current = []
          smoothedFrequencyRef.current = null
          lastStableSnapshotRef.current = initialSnapshot
        }

        const detectedChromatic = detectedFrequency === null
          ? null
          : getChromaticTarget(detectedFrequency, concertARef.current)

        let nextSnapshot: PitchSnapshot = {
          ...initialSnapshot,
          detectedFrequency,
          clarity,
          level,
          note: detectedChromatic?.note ?? null,
          chromatic: detectedChromatic,
          stability,
          updatedAt: detectedFrequency === null ? null : performance.now(),
        }

        if (validSignal && detectedFrequency !== null) {
          const currentConcertA = concertARef.current
          const currentTuning = tuningRef.current
          const bestMatch = getNearestString(detectedFrequency, currentTuning, currentConcertA)
          let lockedNote = lockedStringNoteRef.current

          if (!lockedNote) {
            const currentCandidate = lockCandidateRef.current
            const nextCandidate =
              currentCandidate?.note === bestMatch.note
                ? { note: bestMatch.note, frames: currentCandidate.frames + 1 }
                : { note: bestMatch.note, frames: 1 }

            lockCandidateRef.current = nextCandidate

            if (nextCandidate.frames >= INITIAL_LOCK_FRAMES) {
              lockedNote = bestMatch.note
              lockedStringNoteRef.current = lockedNote
              lockCandidateRef.current = null
              frequencyWindowRef.current = []
              smoothedFrequencyRef.current = null
            }
          } else if (bestMatch.note !== lockedNote) {
            const lockedString = currentTuning.strings.find((item) => item.note === lockedNote)

            if (!lockedString) {
              lockedStringNoteRef.current = null
              lockCandidateRef.current = null
              frequencyWindowRef.current = []
              smoothedFrequencyRef.current = null
              lockedNote = null
            } else {
              const lockedMatch = getStringPitchMatch(
                detectedFrequency,
                lockedString,
                currentConcertA,
              )
              const clearlyBetterTarget =
                bestMatch.distance + SWITCH_ADVANTAGE_CENTS < lockedMatch.distance

              if (clearlyBetterTarget) {
                const currentCandidate = lockCandidateRef.current
                const nextCandidate =
                  currentCandidate?.note === bestMatch.note
                    ? { note: bestMatch.note, frames: currentCandidate.frames + 1 }
                    : { note: bestMatch.note, frames: 1 }

                lockCandidateRef.current = nextCandidate

                if (nextCandidate.frames >= SWITCH_LOCK_FRAMES) {
                  lockedNote = bestMatch.note
                  lockedStringNoteRef.current = lockedNote
                  lockCandidateRef.current = null
                  frequencyWindowRef.current = []
                  smoothedFrequencyRef.current = null
                }
              } else {
                lockCandidateRef.current = null
              }
            }
          } else {
            lockCandidateRef.current = null
          }

          const lockedString = currentTuning.strings.find((item) => item.note === lockedNote)

          if (lockedString) {
            const rawLockedMatch = getStringPitchMatch(rawFrequency, lockedString, currentConcertA)
            const frequencyWindow = [
              ...frequencyWindowRef.current,
              rawLockedMatch.detectedFundamental,
            ].slice(-FREQUENCY_WINDOW_SIZE)
            const filteredFrequency = median(frequencyWindow)
            const previous = smoothedFrequencyRef.current
            const frequency =
              previous === null
                ? filteredFrequency
                : previous + (filteredFrequency - previous) * SMOOTHING

            frequencyWindowRef.current = frequencyWindow
            smoothedFrequencyRef.current = frequency

            const chromatic = getChromaticTarget(frequency, currentConcertA)
            const stringMatch = getStringPitchMatch(frequency, lockedString, currentConcertA)

            nextSnapshot = {
              detectedFrequency,
              frequency,
              clarity,
              level,
              cents: stringMatch.cents,
              note: chromatic.note,
              stringMatch,
              chromatic,
              stability,
              updatedAt: performance.now(),
            }
            lastStableSnapshotRef.current = nextSnapshot

            startTransition(() => {
              setHistory((current) => {
                if (current[0] === chromatic.note) {
                  return current
                }

                return [chromatic.note, ...current].slice(0, 6)
              })
            })
          }
        } else if (pitchPresent && lastStableSnapshotRef.current.frequency !== null) {
          lockCandidateRef.current = null
          nextSnapshot = {
            ...lastStableSnapshotRef.current,
            detectedFrequency,
            clarity,
            level,
            stability,
            updatedAt: performance.now(),
          }
        } else if (pitchPresent) {
          lockCandidateRef.current = null
        } else if (!pitchPresent) {
          lockCandidateRef.current = null

          if (
            silenceFramesRef.current <= SIGNAL_HOLD_FRAMES &&
            smoothedDetectedFrequencyRef.current !== null
          ) {
            const heldFrequency = smoothedDetectedFrequencyRef.current
            const heldChromatic = getChromaticTarget(heldFrequency, concertARef.current)

            nextSnapshot = lastStableSnapshotRef.current.frequency !== null
              ? {
                  ...lastStableSnapshotRef.current,
                  detectedFrequency: heldFrequency,
                  clarity,
                  level,
                  stability,
                }
              : {
                  ...initialSnapshot,
                  detectedFrequency: heldFrequency,
                  clarity,
                  level,
                  note: heldChromatic.note,
                  chromatic: heldChromatic,
                  stability,
                  updatedAt: performance.now(),
                }
          }

          if (silenceFramesRef.current >= LOCK_RELEASE_FRAMES) {
            lockedStringNoteRef.current = null
            lockCandidateRef.current = null
            frequencyWindowRef.current = []
            smoothedFrequencyRef.current = null
            detectedFrequencyWindowRef.current = []
            smoothedDetectedFrequencyRef.current = null
            lastStableSnapshotRef.current = initialSnapshot
            nextSnapshot = {
              ...initialSnapshot,
              clarity,
              level,
              stability,
            }
          }
        }

        setSnapshot(nextSnapshot)
        animationFrameRef.current = requestAnimationFrame(tick)
      }

      if (navigator.mediaDevices?.enumerateDevices) {
        const mediaDevices = await navigator.mediaDevices.enumerateDevices()

        if (sessionId !== listenSessionRef.current) {
          return
        }

        const options = buildDeviceOptions(mediaDevices, nextActiveInput)
        startTransition(() => setDevices(options))
      }

      if (sessionId !== listenSessionRef.current) {
        return
      }

      setStatus('running')
      animationFrameRef.current = requestAnimationFrame(tick)
    } catch (caughtError) {
      if (acquiredStream && streamRef.current !== acquiredStream) {
        for (const track of acquiredStream.getTracks()) {
          track.stop()
        }
      }

      if (acquiredContext && audioContextRef.current !== acquiredContext) {
        await acquiredContext.close().catch(() => undefined)
      }

      if (sessionId !== listenSessionRef.current) {
        return
      }

      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to access audio input.'

      stopListening()
      setActiveInput(null)
      setStatus('error')
      setError(message)
      setSnapshot(initialSnapshot)
    }
  }, [buildDeviceOptions, selectedDeviceId, stopListening])

  useEffect(() => {
    void refreshDevices()

    const onDeviceChange = () => {
      void refreshDevices()
    }

    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange)

    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange)
  }, [refreshDevices])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void startListening()
    }, 0)

    return () => {
      window.clearTimeout(timer)
      stopListening()
    }
  }, [selectedDeviceId, startListening, stopListening])

  const inTune = useMemo(
    () => Math.abs(snapshot.stringMatch?.cents ?? snapshot.cents ?? 999) <= 7,
    [snapshot.cents, snapshot.stringMatch],
  )

  return {
    activeInput,
    devices,
    error,
    history,
    inTune,
    restart: startListening,
    snapshot,
    status,
  }
}
