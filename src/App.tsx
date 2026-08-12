import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { getStoredMarkers, getStoredNotes, getStoredNumber, getStoredNumberInRange, getStoredNumberOption, getStoredPlaybackMode, getStoredSongCategories, getStoredString, getStoredStringArray, getStoredUserCategories } from './app/storage'
import { pickTrackVariant, stopOscillator, type AppSection, type PlaybackMode, type PracticeMarker, type SongCategoryMap, type UserCategory } from './app/types'
import { BottomPlayer } from './components/BottomPlayer'
import { LibraryPanel } from './components/LibraryPanel'
import { PracticeLab } from './components/PracticeLab'
import { ReferencePanel } from './components/ReferencePanel'
import { RigPanel } from './components/RigPanel'
import { TitleBar } from './components/TitleBar'
import { TunerPanel } from './components/TunerPanel'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { useBassTuner } from './hooks/useBassTuner'
import {
  clamp,
  getNearestString,
  midiToFrequency,
  tuningPresets,
  type TuningPreset,
} from './lib/music'
import { lessonOptions, librarySongs, type LibrarySong, type TrackVariant } from './lib/tracks'
import { getNextQueueItem, getStoredQueueSongIds, moveItem, QUEUE_STORAGE_KEY } from './lib/queue'

const DEFAULT_TUNING = tuningPresets[0].id
const DEFAULT_A4 = 440
const TUNER_METER_RANGE_CENTS = 100
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const


function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState(() =>
    getStoredString('bass-record.device', ''),
  )
  const [activeSection, setActiveSection] = useState<AppSection>('tuner')
  const [selectedTuningId, setSelectedTuningId] = useState(() =>
    getStoredString('bass-record.tuning', DEFAULT_TUNING),
  )
  const [concertA, setConcertA] = useState(() =>
    getStoredNumberInRange('bass-record.a4', DEFAULT_A4, 430, 450),
  )
  const [referenceStringNote, setReferenceStringNote] = useState('E1')
  const [referenceEnabled, setReferenceEnabled] = useState(false)
  const [selectedSongId, setSelectedSongId] = useState<string | null>(librarySongs[0]?.id ?? null)
  const [preferredVariant, setPreferredVariant] = useState<TrackVariant>('backing')
  const availableSongIds = useMemo(() => new Set(librarySongs.map((song) => song.id)), [])
  const [queueSongIds, setQueueSongIds] = useState<string[]>(() => getStoredQueueSongIds(availableSongIds))
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(() =>
    getStoredPlaybackMode('bass-record.playbackMode', 'sequential'),
  )
  const [queueOpen, setQueueOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLibraryFilterId, setSelectedLibraryFilterId] = useState('all')
  const [userCategories, setUserCategories] = useState<UserCategory[]>(getStoredUserCategories)
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>(() =>
    getStoredStringArray('bass-record.hiddenCategories'),
  )
  const [managedCategoryIds, setManagedCategoryIds] = useState<string[]>(() =>
    getStoredStringArray('bass-record.managedCategories'),
  )
  const [songCategories, setSongCategories] = useState<SongCategoryMap>(getStoredSongCategories)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [favoritesOnly] = useState(false)
  const [onlyBacking] = useState(false)
  const [favoriteSongIds, setFavoriteSongIds] = useState<string[]>(() =>
    getStoredStringArray('bass-record.favorites'),
  )
  const [playbackRate, setPlaybackRate] = useState(() =>
    getStoredNumberOption('bass-record.playbackRate', 1, PLAYBACK_RATES),
  )
  const [abLoopEnabled, setAbLoopEnabled] = useState(false)
  const [loopStart, setLoopStart] = useState<number | null>(null)
  const [loopEnd, setLoopEnd] = useState<number | null>(null)
  const [metronomeEnabled, setMetronomeEnabled] = useState(false)
  const [tempo, setTempo] = useState(() => getStoredNumber('bass-record.tempo', 90))
  const [practiceMarkers, setPracticeMarkers] = useState<PracticeMarker[]>(getStoredMarkers)
  const [practiceNotes, setPracticeNotes] = useState<Record<string, string>>(getStoredNotes)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlayNextTrackRef = useRef(false)
  const pendingTrackAutoplayRef = useRef(false)
  const isPlayingRef = useRef(false)
  const seamlessVariantSwitchRef = useRef<{
    songId: string
    variant: TrackVariant
    time: number
    wasPlaying: boolean
  } | null>(null)
  const lastSavedSecondRef = useRef(-1)
  const referenceContextRef = useRef<AudioContext | null>(null)
  const metronomeContextRef = useRef<AudioContext | null>(null)
  const metronomeTimerRef = useRef<number | null>(null)
  const referenceNodesRef = useRef<{
    primary: OscillatorNode
    octave: OscillatorNode
    output: GainNode
    tremolo: GainNode
  } | null>(null)
  const activeSongRef = useRef<LibrarySong | null>(null)
  const queueSongsRef = useRef<LibrarySong[]>([])
  const playbackModeRef = useRef<PlaybackMode>('sequential')
  const stopReferenceTone = useCallback(() => {
    const nodes = referenceNodesRef.current
    const audioContext = referenceContextRef.current

    referenceNodesRef.current = null
    referenceContextRef.current = null

    if (nodes) {
      try {
        const now = audioContext?.currentTime ?? 0
        nodes.output.gain.cancelScheduledValues(now)
        nodes.output.gain.setValueAtTime(0, now)
      } catch {
        // The context may already be closed during a rapid page or device transition.
      }

      stopOscillator(nodes.primary)
      stopOscillator(nodes.octave)
      nodes.primary.disconnect()
      nodes.octave.disconnect()
      nodes.tremolo.disconnect()
      nodes.output.disconnect()
    }

    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => undefined)
    }
  }, [])

  const tuning = useMemo<TuningPreset>(
    () => tuningPresets.find((item) => item.id === selectedTuningId) ?? tuningPresets[0],
    [selectedTuningId],
  )
  const activeReferenceNote = tuning.strings.some((item) => item.note === referenceStringNote)
    ? referenceStringNote
    : tuning.strings[0].note

  const { activeInput, devices, error, history, inTune, restart, snapshot, status } = useBassTuner({
    selectedDeviceId,
    tuning,
    concertA,
  })

  const favoriteSongIdSet = useMemo(() => new Set(favoriteSongIds), [favoriteSongIds])
  const visibleDeviceId =
    devices.some((device) => device.deviceId === selectedDeviceId) ? selectedDeviceId : ''
  const candidateMatch = snapshot.detectedFrequency === null
    ? null
    : getNearestString(snapshot.detectedFrequency, tuning, concertA)
  const targetMatch = snapshot.stringMatch ?? candidateMatch
  const targetLocked = snapshot.stringMatch !== null
  const tuningCents = targetMatch?.cents ?? 0
  const clampedCents = clamp(tuningCents, -TUNER_METER_RANGE_CENTS, TUNER_METER_RANGE_CENTS)
  const needleOffset =
    `${((clampedCents + TUNER_METER_RANGE_CENTS) / (TUNER_METER_RANGE_CENTS * 2)) * 100}%`
  const signalPresent = snapshot.detectedFrequency !== null
  const signalLevel = Math.round(clamp(snapshot.level * 500, 0, 100))
  const clarityPercent = Math.round(snapshot.clarity * 100)
  const targetString = targetMatch?.note ?? null
  const targetFrequency = targetMatch?.targetFrequency ?? null
  const namedDevices = devices.filter((device) => !device.isAlias)
  const aliasOnly = devices.length > 0 && namedDevices.length === 0
  const perfectlyTuned =
    targetLocked && Math.abs(tuningCents) <= 3 && snapshot.clarity >= 0.94

  const filteredSongs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const selectedUserCategory = userCategories.find((category) => category.id === selectedLibraryFilterId)
    const selectedLesson = lessonOptions.find((lesson) => lesson.id === selectedLibraryFilterId)
    const selectedCategoryIsManaged = managedCategoryIds.includes(selectedLibraryFilterId)

    return librarySongs.filter((song) => {
      const assignedCategories = songCategories[song.id] ?? []
      const matchesFilter =
        selectedLibraryFilterId === 'all' ||
        (selectedLesson
          ? selectedCategoryIsManaged
            ? assignedCategories.includes(selectedLesson.id)
            : song.lessonId === selectedLesson.id
          : false) ||
        (selectedUserCategory ? assignedCategories.includes(selectedUserCategory.id) : false)
      const matchesFavorites = !favoritesOnly || favoriteSongIdSet.has(song.id)
      const matchesBacking = !onlyBacking || Boolean(song.variants.backing)
      const searchableText = `${song.title} ${song.lessonName} ${song.level ?? ''} ${song.tags.join(' ')}`
      const matchesSearch = !normalizedQuery || searchableText.toLowerCase().includes(normalizedQuery)

      return matchesFilter && matchesFavorites && matchesBacking && matchesSearch
    })
  }, [favoriteSongIdSet, favoritesOnly, managedCategoryIds, onlyBacking, searchQuery, selectedLibraryFilterId, songCategories, userCategories])

  const activeSong = useMemo(() => {
    if (!selectedSongId) {
      return null
    }

    return librarySongs.find((song) => song.id === selectedSongId) ?? null
  }, [selectedSongId])

  const activeTrack = useMemo(
    () => (activeSong ? pickTrackVariant(activeSong, preferredVariant) : null),
    [activeSong, preferredVariant],
  )

  const queueSongs = useMemo(
    () => queueSongIds.map((songId) => librarySongs.find((song) => song.id === songId)).filter((song): song is NonNullable<typeof song> => Boolean(song)),
    [queueSongIds],
  )

  const getCategorySongs = useCallback((categoryId: string) => {
    const selectedUserCategory = userCategories.find((category) => category.id === categoryId)
    const selectedLesson = lessonOptions.find((lesson) => lesson.id === categoryId)
    const selectedCategoryIsManaged = managedCategoryIds.includes(categoryId)

    return librarySongs.filter((song) => {
      const assignedCategories = songCategories[song.id] ?? []

      if (selectedLesson) {
        return selectedCategoryIsManaged
          ? assignedCategories.includes(selectedLesson.id)
          : song.lessonId === selectedLesson.id
      }

      return selectedUserCategory ? assignedCategories.includes(selectedUserCategory.id) : false
    })
  }, [managedCategoryIds, songCategories, userCategories])

  const getNextQueueSong = useCallback((direction: -1 | 1, manual = true) => {
    return getNextQueueItem(queueSongs, activeSong?.id ?? null, playbackMode, direction, manual)
  }, [activeSong, playbackMode, queueSongs])

  useEffect(() => {
    activeSongRef.current = activeSong
    queueSongsRef.current = queueSongs
    playbackModeRef.current = playbackMode
  }, [activeSong, playbackMode, queueSongs])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const getNextQueueSongFromRefs = useCallback((direction: -1 | 1, manual = true) => {
    return getNextQueueItem(
      queueSongsRef.current,
      activeSongRef.current?.id ?? null,
      playbackModeRef.current,
      direction,
      manual,
    )
  }, [])

  const backingReadyCount = useMemo(
    () => librarySongs.filter((song) => song.availableVariants.includes('backing')).length,
    [],
  )

  const currentTip = useMemo(() => {
    if (status === 'error') {
      return 'Browser microphone permission is missing. Allow audio input and reconnect.'
    }

    if (!signalPresent) {
      return 'Play a single open string and let the tuner lock the fundamental for one or two seconds.'
    }

    if (snapshot.level < 0.01) {
      return 'Input is weak. Raise Scarlett Solo gain until the ring flashes green gently.'
    }

    if (!targetLocked && targetString && targetFrequency !== null) {
      const direction = Math.abs(tuningCents) <= 3
        ? 'Hold the note steady while the target locks.'
        : tuningCents > 0
          ? 'Loosen the tuner slightly.'
          : 'Tighten the tuner slowly.'

      return `${snapshot.detectedFrequency?.toFixed(1)} Hz detected. Nearest target is ${targetString} at ${targetFrequency.toFixed(1)} Hz. ${direction}`
    }

    if (snapshot.clarity < 0.94) {
      return 'The note is rich in overtones. Try plucking closer to the middle and a little softer.'
    }

    if (perfectlyTuned) {
      return `${targetString} is centered. Move on to the next string when ready.`
    }

    return tuningCents > 0 ? 'Pitch is sharp. Loosen the tuner slightly.' : 'Pitch is flat. Tighten the tuner slowly.'
  }, [
    perfectlyTuned,
    signalPresent,
    snapshot.clarity,
    snapshot.detectedFrequency,
    snapshot.level,
    status,
    targetFrequency,
    targetLocked,
    targetString,
    tuningCents,
  ])

  const sectionTitle = useMemo(() => {
    switch (activeSection) {
      case 'tuner':
        return 'Live Tuner'
      case 'library':
        return 'Practice Library'
      case 'practice':
        return 'Practice Lab'
      case 'input':
        return 'Input Rig'
    }
  }, [activeSection])

  const activeSongMarkers = useMemo(
    () => practiceMarkers.filter((marker) => marker.songId === activeSong?.id),
    [activeSong?.id, practiceMarkers],
  )

  const activePracticeNote = activeSong ? (practiceNotes[activeSong.id] ?? '') : ''

  const analysisBars = useMemo(
    () => Array.from({ length: 28 }, (_, index) => {
      const historyBias = history[index % Math.max(history.length, 1)] ? 12 : 0
      const wave = Math.sin(index * 0.74 + currentTime * 0.22) * 18
      return Math.round(clamp(28 + signalLevel * 0.34 + clarityPercent * 0.16 + historyBias + wave, 12, 92))
    }),
    [clarityPercent, currentTime, history, signalLevel],
  )

  const deviceHint = useMemo(() => {
    if (error) {
      return error
    }

    if (activeInput && namedDevices.length <= 1) {
      return `Browser is currently monitoring: ${activeInput.label}`
    }

    if (aliasOnly) {
      return 'The browser only exposed default aliases. Reconnect the interface or refresh permission to restore the full list.'
    }

    return 'Use the INST input on Scarlett Solo and disable OS-level noise suppression or auto gain.'
  }, [activeInput, aliasOnly, error, namedDevices.length])

  const quickStats = [
    {
      label: 'Library',
      value: `${librarySongs.length} tracks`,
      detail: `${backingReadyCount} backing versions`,
    },
    {
      label: 'Favorites',
      value: `${favoriteSongIds.length}`,
      detail: 'Saved practice picks',
    },
    {
      label: 'Input',
      value: activeInput?.label ?? 'Awaiting input',
      detail: status === 'running' ? 'Live monitoring' : 'Reconnect if needed',
    },
  ]

  useEffect(() => {
    window.localStorage.setItem('bass-record.device', selectedDeviceId)
  }, [selectedDeviceId])

  useEffect(() => {
    window.localStorage.setItem('bass-record.tuning', selectedTuningId)
  }, [selectedTuningId])

  useEffect(() => {
    window.localStorage.setItem('bass-record.a4', String(concertA))
  }, [concertA])

  useEffect(() => {
    window.localStorage.setItem('bass-record.favorites', JSON.stringify(favoriteSongIds))
  }, [favoriteSongIds])

  useEffect(() => {
    window.localStorage.setItem('bass-record.userCategories', JSON.stringify(userCategories))
  }, [userCategories])

  useEffect(() => {
    window.localStorage.setItem('bass-record.hiddenCategories', JSON.stringify(hiddenCategoryIds))
  }, [hiddenCategoryIds])

  useEffect(() => {
    window.localStorage.setItem('bass-record.managedCategories', JSON.stringify(managedCategoryIds))
  }, [managedCategoryIds])

  useEffect(() => {
    window.localStorage.setItem('bass-record.songCategories', JSON.stringify(songCategories))
  }, [songCategories])

  useEffect(() => {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueSongIds))
  }, [queueSongIds])

  useEffect(() => {
    window.localStorage.setItem('bass-record.playbackMode', playbackMode)
  }, [playbackMode])

  useEffect(() => {
    window.localStorage.setItem('bass-record.playbackRate', String(playbackRate))
  }, [playbackRate])

  useEffect(() => {
    window.localStorage.setItem('bass-record.tempo', String(tempo))
  }, [tempo])

  useEffect(() => {
    window.localStorage.setItem('bass-record.markers', JSON.stringify(practiceMarkers))
  }, [practiceMarkers])

  useEffect(() => {
    window.localStorage.setItem('bass-record.practiceNotes', JSON.stringify(practiceNotes))
  }, [practiceNotes])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    audio.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    const onTimeUpdate = () => {
      if (
        abLoopEnabled &&
        loopStart !== null &&
        loopEnd !== null &&
        loopEnd > loopStart + 0.5 &&
        audio.currentTime >= loopEnd
      ) {
        audio.currentTime = loopStart
      }

      setCurrentTime(audio.currentTime)

      const wholeSecond = Math.floor(audio.currentTime)

      if (wholeSecond === lastSavedSecondRef.current) {
        return
      }
      lastSavedSecondRef.current = wholeSecond
    }

    const onLoadStart = () => {
      lastSavedSecondRef.current = -1
      setCurrentTime(0)
      setDuration(0)
    }

    const onLoadedMetadata = () => {
      if (activeSong) {
        const pendingSwitch = seamlessVariantSwitchRef.current
        const shouldResumeVariantSwitch =
          pendingSwitch?.songId === activeSong.id && pendingSwitch.variant === activeTrack?.variant
        const resumeAt = shouldResumeVariantSwitch ? pendingSwitch.time : 0
        const safeResumeAt =
          resumeAt > 0 && audio.duration > 1 ? Math.min(resumeAt, audio.duration - 0.5) : 0

        if (safeResumeAt > 0) {
          audio.currentTime = safeResumeAt
        }

        if (shouldResumeVariantSwitch) {
          seamlessVariantSwitchRef.current = null
          autoPlayNextTrackRef.current = false

          if (pendingSwitch.wasPlaying) {
            void audio.play().catch(() => {
              setIsPlaying(false)
            })
          }
        }
      }

      setDuration(audio.duration || 0)
      setCurrentTime(audio.currentTime || 0)

      if (pendingTrackAutoplayRef.current) {
        pendingTrackAutoplayRef.current = false
        void audio.play().catch(() => {
          setIsPlaying(false)
        })
      }
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      const currentActiveSong = activeSongRef.current
      const currentPlaybackMode = playbackModeRef.current

      if (!currentActiveSong) {
        setIsPlaying(false)
        return
      }

      if (currentPlaybackMode === 'repeat-one') {
        audio.currentTime = 0
        void audio.play().catch(() => setIsPlaying(false))
        return
      }

      const nextSong = getNextQueueSongFromRefs(1, false)

      if (!nextSong) {
        setIsPlaying(false)
        return
      }

      autoPlayNextTrackRef.current = true
      setLoopStart(null)
      setLoopEnd(null)
      setAbLoopEnabled(false)
      setSelectedSongId(nextSong.id)
    }

    audio.addEventListener('loadstart', onLoadStart)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('loadstart', onLoadStart)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [abLoopEnabled, activeSong, activeTrack, getNextQueueSongFromRefs, loopEnd, loopStart])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (!activeTrack) {
      seamlessVariantSwitchRef.current = null
      pendingTrackAutoplayRef.current = false
      audio.pause()
      audio.load()
      return
    }

    const pendingSwitch = seamlessVariantSwitchRef.current
    const shouldDeferVariantPlay =
      Boolean(
        pendingSwitch &&
          pendingSwitch.songId === activeSong?.id &&
          pendingSwitch.variant === activeTrack.variant,
      )

    pendingTrackAutoplayRef.current = !shouldDeferVariantPlay && (autoPlayNextTrackRef.current || isPlayingRef.current)
    audio.load()

    if (!shouldDeferVariantPlay) {
      autoPlayNextTrackRef.current = false
    }
  }, [activeSong?.id, activeTrack])

  useEffect(() => {
    stopReferenceTone()

    if (!referenceEnabled || activeSection !== 'input') {
      return
    }

    const audioContext = new AudioContext({ latencyHint: 'interactive' })
    const output = audioContext.createGain()
    const tremolo = audioContext.createGain()
    const primary = audioContext.createOscillator()
    const octave = audioContext.createOscillator()

    referenceContextRef.current = audioContext

    const frequency = midiToFrequency(
      tuning.strings.find((item) => item.note === activeReferenceNote)?.midi ?? tuning.strings[0].midi,
      concertA,
    )

    primary.type = 'triangle'
    primary.frequency.value = frequency
    octave.type = 'sine'
    octave.frequency.value = frequency * 2

    tremolo.gain.value = 0.72
    output.gain.value = 0

    primary.connect(tremolo)
    octave.connect(tremolo)
    tremolo.connect(output)
    output.connect(audioContext.destination)

    primary.start()
    octave.start()
    void audioContext.resume().catch(() => undefined)

    output.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 0.08)
    referenceNodesRef.current = { primary, octave, output, tremolo }

    return stopReferenceTone
  }, [activeReferenceNote, activeSection, concertA, referenceEnabled, stopReferenceTone, tuning])

  useEffect(() => {
    if (!metronomeEnabled) {
      if (metronomeTimerRef.current !== null) {
        window.clearInterval(metronomeTimerRef.current)
        metronomeTimerRef.current = null
      }
      metronomeContextRef.current?.close().catch(() => undefined)
      metronomeContextRef.current = null

      return
    }

    const audioContext =
      metronomeContextRef.current ?? new AudioContext({ latencyHint: 'interactive' })
    metronomeContextRef.current = audioContext

    const playClick = () => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = 'square'
      oscillator.frequency.value = 1120
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.055)
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.06)
    }

    playClick()
    metronomeTimerRef.current = window.setInterval(playClick, 60000 / tempo)

    return () => {
      if (metronomeTimerRef.current !== null) {
        window.clearInterval(metronomeTimerRef.current)
        metronomeTimerRef.current = null
      }
    }
  }, [metronomeEnabled, tempo])

  useEffect(() => {
    return () => {
      stopReferenceTone()
      metronomeContextRef.current?.close().catch(() => undefined)
      metronomeContextRef.current = null
    }
  }, [stopReferenceTone])

  const togglePlayback = async () => {
    const audio = audioRef.current

    if (!audio || !activeTrack) {
      return
    }

    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        setIsPlaying(false)
      }
      return
    }

    audio.pause()
  }

  const jumpSong = (direction: -1 | 1) => {
    const nextSong = getNextQueueSong(direction)

    if (!nextSong) {
      return
    }

    requestSongPlayback(nextSong.id)
  }

  const toggleFavorite = (songId: string) => {
    setFavoriteSongIds((current) =>
      current.includes(songId) ? current.filter((id) => id !== songId) : [...current, songId],
    )
  }

  const requestSongPlayback = (songId: string) => {
    const audio = audioRef.current

    if (songId === selectedSongId && audio && activeTrack) {
      void audio.play().catch(() => {
        setIsPlaying(false)
      })
      return
    }

    pendingTrackAutoplayRef.current = true
    autoPlayNextTrackRef.current = true
    setLoopStart(null)
    setLoopEnd(null)
    setAbLoopEnabled(false)
    setSelectedSongId(songId)
  }

  const handleSongPlay = (songId: string) => {
    setQueueSongIds((current) => current.includes(songId) ? current : [...current, songId])
    requestSongPlayback(songId)
  }

  const playCategory = (categoryId: string) => {
    const categorySongs = getCategorySongs(categoryId)

    setQueueSongIds(categorySongs.map((song) => song.id))
    setQueueOpen(true)

    if (categorySongs[0]) {
      requestSongPlayback(categorySongs[0].id)
    }
  }

  const removeQueueSong = (songId: string) => {
    setQueueSongIds((current) => current.filter((id) => id !== songId))
  }

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    setQueueSongIds((current) => moveItem(current, fromIndex, toIndex))
  }

  const handleVariantSelect = (variant: TrackVariant) => {
    if (variant === preferredVariant) {
      return
    }

    const audio = audioRef.current
    const seamlessVariants: TrackVariant[] = ['backing', 'full']
    const canSeamlessSwitch =
      Boolean(
        audio &&
          activeSong &&
          activeTrack &&
          activeSong.variants[variant] &&
          seamlessVariants.includes(activeTrack.variant),
      ) &&
      seamlessVariants.includes(variant)

    if (canSeamlessSwitch && audio && activeSong) {
      seamlessVariantSwitchRef.current = {
        songId: activeSong.id,
        variant,
        time: audio.currentTime || currentTime,
        wasPlaying: !audio.paused,
      }
      autoPlayNextTrackRef.current = false
    } else {
      seamlessVariantSwitchRef.current = null
      autoPlayNextTrackRef.current = isPlaying
    }

    setPreferredVariant(variant)
  }

  const setLoopPoint = (point: 'start' | 'end') => {
    const nextTime = audioRef.current?.currentTime ?? currentTime

    if (point === 'start') {
      setLoopStart(nextTime)

      if (loopEnd !== null && loopEnd <= nextTime) {
        setLoopEnd(null)
      }

      return
    }

    setLoopEnd(nextTime)

    if (loopStart !== null && nextTime <= loopStart) {
      setLoopStart(null)
    }
  }

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditableTarget(event.target)) {
        return
      }

      const audio = audioRef.current
      const key = event.key.toLowerCase()

      if (event.code === 'Space') {
        if (event.target instanceof HTMLButtonElement) {
          return
        }

        if (!audio || !activeTrack) {
          return
        }

        event.preventDefault()
        if (audio.paused) {
          void audio.play().catch(() => setIsPlaying(false))
        } else {
          audio.pause()
        }
        return
      }

      if (!audio || !activeTrack) {
        return
      }

      if (key === 'a') {
        event.preventDefault()
        const nextTime = audio.currentTime
        setLoopStart(nextTime)
        if (loopEnd !== null && loopEnd <= nextTime) {
          setLoopEnd(null)
        }
        return
      }

      if (key === 'b') {
        event.preventDefault()
        const nextTime = audio.currentTime
        setLoopEnd(nextTime)
        if (loopStart !== null && nextTime <= loopStart) {
          setLoopStart(null)
        }
        return
      }

      if (key === 'l' && loopStart !== null && loopEnd !== null && loopEnd > loopStart) {
        event.preventDefault()
        setAbLoopEnabled((current) => !current)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTrack, loopEnd, loopStart])

  const addMarker = () => {
    if (!activeSong) {
      return
    }

    const markerTime = audioRef.current?.currentTime ?? currentTime
    setPracticeMarkers((current) => [
      ...current,
      {
        id: `${activeSong.id}-${Date.now()}`,
        songId: activeSong.id,
        time: markerTime,
        label: `Marker ${current.filter((marker) => marker.songId === activeSong.id).length + 1}`,
      },
    ])
  }

  const removeMarker = (markerId: string) => {
    setPracticeMarkers((current) => current.filter((marker) => marker.id !== markerId))
  }

  const jumpToTime = (time: number) => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    audio.currentTime = time
    setCurrentTime(time)
  }

  const updatePracticeNote = (note: string) => {
    if (!activeSong) {
      return
    }

    setPracticeNotes((current) => ({ ...current, [activeSong.id]: note }))
  }

  const createCategory = (name: string) => {
    const trimmedName = name.trim()

    if (!trimmedName) {
      return
    }

    const duplicate = userCategories.some(
      (category) => category.name.toLowerCase() === trimmedName.toLowerCase(),
    )

    if (duplicate) {
      return
    }

    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const id = `cat-${Date.now()}${slug ? `-${slug}` : ''}`
    setUserCategories((current) => [...current, { id, name: trimmedName }])
    setSelectedLibraryFilterId(id)
    setEditingCategoryId(id)
  }

  const renameCategory = (categoryId: string, name: string) => {
    const trimmedName = name.trim()

    if (!trimmedName || lessonOptions.some((lesson) => lesson.id === categoryId)) {
      return
    }

    const duplicate = userCategories.some(
      (category) => category.id !== categoryId && category.name.toLowerCase() === trimmedName.toLowerCase(),
    )

    if (duplicate) {
      return
    }

    setUserCategories((current) => current.map((category) =>
      category.id === categoryId ? { ...category, name: trimmedName } : category,
    ))
  }

  const restoreHiddenCategories = () => {
    setHiddenCategoryIds([])
  }

  const deleteCategory = (categoryId: string) => {
    const isBuiltInCategory = lessonOptions.some((lesson) => lesson.id === categoryId)

    if (isBuiltInCategory) {
      setHiddenCategoryIds((current) => current.includes(categoryId) ? current : [...current, categoryId])
      if (selectedLibraryFilterId === categoryId) {
        setSelectedLibraryFilterId('all')
      }
      if (editingCategoryId === categoryId) {
        setEditingCategoryId(null)
      }
      return
    }

    setUserCategories((current) => current.filter((category) => category.id !== categoryId))
    setManagedCategoryIds((current) => current.filter((id) => id !== categoryId))
    setSongCategories((current) => {
      const nextMap: SongCategoryMap = {}

      for (const [songId, categoryIds] of Object.entries(current)) {
        const nextCategoryIds = categoryIds.filter((id) => id !== categoryId)

        if (nextCategoryIds.length > 0) {
          nextMap[songId] = nextCategoryIds
        }
      }

      return nextMap
    })

    if (selectedLibraryFilterId === categoryId) {
      setSelectedLibraryFilterId('all')
    }

    if (editingCategoryId === categoryId) {
      setEditingCategoryId(null)
    }
  }

  const saveCategorySongs = (categoryId: string, songIds: string[]) => {
    const nextSongIdSet = new Set(songIds)

    setSongCategories((current) => {
      const nextMap: SongCategoryMap = {}
      const allSongIds = new Set([...Object.keys(current), ...librarySongs.map((song) => song.id)])

      for (const songId of allSongIds) {
        const withoutCategory = (current[songId] ?? []).filter((id) => id !== categoryId)
        const nextCategories = nextSongIdSet.has(songId)
          ? [...withoutCategory, categoryId]
          : withoutCategory

        if (nextCategories.length > 0) {
          nextMap[songId] = nextCategories
        }
      }

      return nextMap
    })

    setManagedCategoryIds((current) => current.includes(categoryId) ? current : [...current, categoryId])
    setSelectedLibraryFilterId(categoryId)
    setEditingCategoryId(null)
  }

  const showTuner = activeSection === 'tuner'
  const showRig = activeSection === 'tuner' || activeSection === 'input'
  const showReference = activeSection === 'input'
  const showLibraryPanel = activeSection === 'library'
  const showPracticeLab = activeSection === 'practice'
  const showWorkspaceSide = showRig || showReference || showLibraryPanel



  return (
    <div className="app-shell app-window">
      <div className="noise-overlay" />
      <audio ref={audioRef} preload="metadata" src={activeTrack?.filePath} />

      <TitleBar />

      <Sidebar
        activeSection={activeSection}
        onSectionChange={(section) => {
          if (section !== 'input') {
            setReferenceEnabled(false)
          }

          if (section !== 'practice') {
            setMetronomeEnabled(false)
          }

          setActiveSection(section)
        }}
        quickStats={quickStats}
      />

      <section className="app-main">
        <Topbar
          sectionTitle={sectionTitle}
          searchQuery={searchQuery}
          status={status}
          perfectlyTuned={perfectlyTuned}
          onSearchChange={setSearchQuery}
        />

        <div className={`content-scroll content-scroll-${activeSection}`}>
          <div className={`workspace-grid workspace-grid-${activeSection} ${showWorkspaceSide ? '' : 'workspace-grid-single'}`}>
            {showPracticeLab && (
              <PracticeLab
                activeSong={activeSong}
                currentTime={currentTime}
                duration={duration}
                analysisBars={analysisBars}
                loopStart={loopStart}
                loopEnd={loopEnd}
                abLoopEnabled={abLoopEnabled}
                tempo={tempo}
                metronomeEnabled={metronomeEnabled}
                activeSongMarkers={activeSongMarkers}
                activePracticeNote={activePracticeNote}
                onSetLoopPoint={setLoopPoint}
                onToggleAbLoop={() => setAbLoopEnabled((current) => !current)}
                onTempoChange={setTempo}
                onToggleMetronome={() => setMetronomeEnabled((current) => !current)}
                onAddMarker={addMarker}
                onRemoveMarker={removeMarker}
                onJumpToTime={jumpToTime}
                onUpdatePracticeNote={updatePracticeNote}
              />
            )}

            {showTuner && (
              <TunerPanel
                snapshot={snapshot}
                tuning={tuning}
                concertA={concertA}
                targetLocked={targetLocked}
                signalPresent={signalPresent}
                targetString={targetString}
                targetFrequency={targetFrequency}
                tuningCents={tuningCents}
                needleOffset={needleOffset}
                perfectlyTuned={perfectlyTuned}
                inTune={inTune}
                signalLevel={signalLevel}
                clarityPercent={clarityPercent}
              />
            )}

            {showWorkspaceSide && (
            <aside className="workspace-side">
              {showRig && (
                <RigPanel
                  visibleDeviceId={visibleDeviceId}
                  devices={devices}
                  concertA={concertA}
                  tuning={tuning}
                  error={error}
                  deviceHint={deviceHint}
                  onDeviceChange={setSelectedDeviceId}
                  onConcertAChange={setConcertA}
                  onTuningChange={setSelectedTuningId}
                  onRestart={() => void restart()}
                />
              )}

              {showReference && (
                <ReferencePanel
                  tuning={tuning}
                  activeReferenceNote={activeReferenceNote}
                  referenceEnabled={referenceEnabled}
                  currentTip={currentTip}
                  history={history}
                  onToggleReference={() => setReferenceEnabled((current) => !current)}
                  onSelectReferenceNote={(note) => {
                    setReferenceStringNote(note)
                    setReferenceEnabled(true)
                  }}
                />
              )}

              {showLibraryPanel && (
                <LibraryPanel
                  selectedFilterId={selectedLibraryFilterId}
                  queueSongs={filteredSongs}
                  allSongs={librarySongs}
                  activeSong={activeSong}
                  favoriteSongIdSet={favoriteSongIdSet}
                  userCategories={userCategories}
                  hiddenCategoryIds={hiddenCategoryIds}
                  managedCategoryIds={managedCategoryIds}
                  songCategories={songCategories}
                  editingCategoryId={editingCategoryId}
                  onFilterSelect={setSelectedLibraryFilterId}
                  onSongPlay={handleSongPlay}
                  onPlayCategory={playCategory}
                  onToggleFavorite={toggleFavorite}
                  onCreateCategory={createCategory}
                  onRenameCategory={renameCategory}
                  onDeleteCategory={deleteCategory}
                  onRestoreHiddenCategories={restoreHiddenCategories}
                  onOpenCategoryEditor={setEditingCategoryId}
                  onCloseCategoryEditor={() => setEditingCategoryId(null)}
                  onSaveCategorySongs={saveCategorySongs}
                />
              )}
            </aside>
            )}
          </div>
        </div>

      </section>

      <BottomPlayer
        activeSong={activeSong}
        activeTrack={activeTrack}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        preferredVariant={preferredVariant}
        playbackRate={playbackRate}
        playbackMode={playbackMode}
        queueSongs={queueSongs}
        onJumpSong={jumpSong}
        onTogglePlayback={() => void togglePlayback()}
        onSeek={(nextTime) => {
          const audio = audioRef.current

          if (!audio) {
            return
          }

          audio.currentTime = nextTime
          setCurrentTime(nextTime)
        }}
        onVariantSelect={handleVariantSelect}
        onPlaybackRateChange={setPlaybackRate}
        onPlaybackModeChange={setPlaybackMode}
        onQueueSongSelect={requestSongPlayback}
        onRemoveQueueSong={removeQueueSong}
        onReorderQueue={reorderQueue}
        onClearQueue={() => {
          setQueueSongIds([])
          setQueueOpen(false)
        }}
        queueOpen={queueOpen}
        onToggleQueue={() => setQueueOpen((current) => !current)}
        onCloseQueue={() => setQueueOpen(false)}
      />
    </div>
  )
}

export default App
