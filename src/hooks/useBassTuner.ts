import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PitchDetector } from 'pitchy'

import { clamp, getChromaticTarget, getNearestString, type TuningPreset } from '../lib/music'

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
const CLARITY_THRESHOLD = 0.92
const RMS_THRESHOLD = 0.01
const SMOOTHING = 0.22

type PitchFrame = Float32Array<ArrayBuffer>

const initialSnapshot: PitchSnapshot = {
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
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const bufferRef = useRef<PitchFrame | null>(null)
  const detectorRef = useRef<PitchDetector<PitchFrame> | null>(null)
  const smoothedFrequencyRef = useRef<number | null>(null)
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
  }, [tuning])

  useEffect(() => {
    concertARef.current = concertA
  }, [concertA])

  const stopListening = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

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
    setError(null)
    setStatus('requesting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 1,
        },
      })

      const audioContext = new AudioContext({
        latencyHint: 'interactive',
      })
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      const audioTrack = stream.getAudioTracks()[0] ?? null
      const nextActiveInput = audioTrack
        ? {
            deviceId: audioTrack.getSettings().deviceId ?? selectedDeviceId,
            label: audioTrack.label || 'Current Input',
          }
        : null

      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.15
      source.connect(analyser)

      audioContextRef.current = audioContext
      streamRef.current = stream
      analyserRef.current = analyser
      bufferRef.current = new Float32Array(
        new ArrayBuffer(FFT_SIZE * Float32Array.BYTES_PER_ELEMENT),
      ) as PitchFrame
      detectorRef.current = PitchDetector.forFloat32Array(FFT_SIZE)
      smoothedFrequencyRef.current = null
      setActiveInput(nextActiveInput)

      const tick = () => {
        const currentAnalyser = analyserRef.current
        const detector = detectorRef.current
        const currentContext = audioContextRef.current
        const buffer = bufferRef.current

        if (!currentAnalyser || !detector || !currentContext || !buffer) {
          return
        }

        currentAnalyser.getFloatTimeDomainData(buffer)
        const level = getRmsLevel(buffer)
        const [rawFrequency, clarity] = detector.findPitch(buffer, currentContext.sampleRate)

        let nextSnapshot = {
          ...initialSnapshot,
          clarity,
          level,
          stability: clamp((clarity - CLARITY_THRESHOLD) / 0.08, 0, 1),
        }

        if (level >= RMS_THRESHOLD && clarity >= CLARITY_THRESHOLD && Number.isFinite(rawFrequency)) {
          const previous = smoothedFrequencyRef.current
          const frequency =
            previous === null ? rawFrequency : previous + (rawFrequency - previous) * SMOOTHING
          const currentConcertA = concertARef.current
          const currentTuning = tuningRef.current

          smoothedFrequencyRef.current = frequency

          const chromatic = getChromaticTarget(frequency, currentConcertA)
          const stringMatch = getNearestString(frequency, currentTuning, currentConcertA)

          nextSnapshot = {
            frequency,
            clarity,
            level,
            cents: stringMatch.cents,
            note: chromatic.note,
            stringMatch,
            chromatic,
            stability: clamp((clarity - CLARITY_THRESHOLD) / 0.08, 0, 1),
            updatedAt: performance.now(),
          }

          startTransition(() => {
            setHistory((current) => {
              if (current[0] === chromatic.note) {
                return current
              }

              return [chromatic.note, ...current].slice(0, 6)
            })
          })
        } else {
          smoothedFrequencyRef.current = null
        }

        setSnapshot(nextSnapshot)
        animationFrameRef.current = requestAnimationFrame(tick)
      }

      if (navigator.mediaDevices?.enumerateDevices) {
        const mediaDevices = await navigator.mediaDevices.enumerateDevices()
        const options = buildDeviceOptions(mediaDevices, nextActiveInput)
        startTransition(() => setDevices(options))
      }

      setStatus('running')
      animationFrameRef.current = requestAnimationFrame(tick)
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to access audio input.'

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
    () => Math.abs(snapshot.stringMatch?.cents ?? snapshot.cents ?? 999) <= 5,
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
