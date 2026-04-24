import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AudioLines,
  BarChart3,
  Bookmark,
  CircleAlert,
  Gauge,
  Guitar,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Search,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Volume2,
} from 'lucide-react'

import './App.css'
import { useBassTuner } from './hooks/useBassTuner'
import {
  clamp,
  formatFrequency,
  formatNoteName,
  midiToFrequency,
  tuningPresets,
  type TuningPreset,
} from './lib/music'
import {
  defaultVariantOrder,
  lessonOptions,
  librarySongs,
  variantOptions,
  type LibrarySong,
  type TrackVariant,
} from './lib/tracks'

const DEFAULT_TUNING = tuningPresets[0].id
const DEFAULT_A4 = 440

type AppSection = 'overview' | 'tuner' | 'library' | 'practice' | 'input'

type PracticeMarker = {
  id: string
  songId: string
  time: number
  label: string
}

const sectionItems: { id: AppSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tuner', label: 'Tuner' },
  { id: 'library', label: 'Library' },
  { id: 'practice', label: 'Practice' },
  { id: 'input', label: 'Input' },
]

const stopOscillator = (oscillator: OscillatorNode | null | undefined) => {
  if (!oscillator) {
    return
  }

  try {
    oscillator.stop()
  } catch {
    // Ignore repeated stop calls during rapid toggles.
  }
}

const getStoredNumber = (key: string, fallback: number) => {
  const value = Number(window.localStorage.getItem(key))
  return Number.isFinite(value) ? value : fallback
}

const getStoredString = (key: string, fallback: string) => window.localStorage.getItem(key) ?? fallback

const getStoredStringArray = (key: string) => {
  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as string[]) : []
  } catch {
    return []
  }
}

const getStoredPlaybackPositions = () => {
  try {
    const value = window.localStorage.getItem('bass-record.playbackPositions')
    return value ? (JSON.parse(value) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

const getStoredMarkers = () => {
  try {
    const value = window.localStorage.getItem('bass-record.markers')
    return value ? (JSON.parse(value) as PracticeMarker[]) : []
  } catch {
    return []
  }
}

const getStoredNotes = () => {
  try {
    const value = window.localStorage.getItem('bass-record.practiceNotes')
    return value ? (JSON.parse(value) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00'
  }

  const rounded = Math.floor(seconds)
  const minutes = Math.floor(rounded / 60)
  const remainingSeconds = rounded % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

const pickTrackVariant = (song: LibrarySong, preferredVariant: TrackVariant) => {
  const variants = song.variants
  return (
    variants[preferredVariant] ??
    defaultVariantOrder.map((variant) => variants[variant]).find(Boolean) ??
    null
  )
}

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState(() =>
    getStoredString('bass-record.device', ''),
  )
  const [activeSection, setActiveSection] = useState<AppSection>('overview')
  const [selectedTuningId, setSelectedTuningId] = useState(() =>
    getStoredString('bass-record.tuning', DEFAULT_TUNING),
  )
  const [concertA, setConcertA] = useState(() => getStoredNumber('bass-record.a4', DEFAULT_A4))
  const [referenceStringNote, setReferenceStringNote] = useState('E1')
  const [referenceEnabled, setReferenceEnabled] = useState(false)
  const [selectedSongId, setSelectedSongId] = useState<string | null>(librarySongs[0]?.id ?? null)
  const [preferredVariant, setPreferredVariant] = useState<TrackVariant>('backing')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLessonId, setSelectedLessonId] = useState('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [onlyBacking, setOnlyBacking] = useState(false)
  const [favoriteSongIds, setFavoriteSongIds] = useState<string[]>(() =>
    getStoredStringArray('bass-record.favorites'),
  )
  const [playbackRate, setPlaybackRate] = useState(() =>
    getStoredNumber('bass-record.playbackRate', 1),
  )
  const [loopEnabled, setLoopEnabled] = useState(false)
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
  const playbackPositionsRef = useRef<Record<string, number>>(getStoredPlaybackPositions())
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
  const noteParts = formatNoteName(snapshot.note ?? tuning.strings[0].note)
  const tuningCents = snapshot.stringMatch?.cents ?? snapshot.cents ?? 0
  const clampedCents = clamp(tuningCents, -50, 50)
  const needleOffset = `${clampedCents + 50}%`
  const signalPresent = snapshot.frequency !== null
  const signalLevel = Math.round(clamp(snapshot.level * 500, 0, 100))
  const clarityPercent = Math.round(snapshot.clarity * 100)
  const targetString = snapshot.stringMatch?.note ?? tuning.strings[0].note
  const targetFrequency =
    snapshot.stringMatch?.targetFrequency ?? midiToFrequency(tuning.strings[0].midi, concertA)
  const namedDevices = devices.filter((device) => !device.isAlias)
  const aliasOnly = devices.length > 0 && namedDevices.length === 0
  const perfectlyTuned = signalPresent && Math.abs(tuningCents) <= 2 && snapshot.clarity >= 0.95

  const filteredSongs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return librarySongs.filter((song) => {
      const matchesLesson = selectedLessonId === 'all' || song.lessonId === selectedLessonId
      const matchesFavorites = !favoritesOnly || favoriteSongIdSet.has(song.id)
      const matchesBacking = !onlyBacking || Boolean(song.variants.backing)
      const searchableText = `${song.title} ${song.lessonName} ${song.level ?? ''} ${song.tags.join(' ')}`
      const matchesSearch = !normalizedQuery || searchableText.toLowerCase().includes(normalizedQuery)

      return matchesLesson && matchesFavorites && matchesBacking && matchesSearch
    })
  }, [favoriteSongIdSet, favoritesOnly, onlyBacking, searchQuery, selectedLessonId])

  const activeSong = useMemo(() => {
    if (filteredSongs.length === 0) {
      return null
    }

    return filteredSongs.find((song) => song.id === selectedSongId) ?? filteredSongs[0]
  }, [filteredSongs, selectedSongId])

  const activeTrack = useMemo(
    () => (activeSong ? pickTrackVariant(activeSong, preferredVariant) : null),
    [activeSong, preferredVariant],
  )

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

    if (snapshot.clarity < 0.94) {
      return 'The note is rich in overtones. Try plucking closer to the middle and a little softer.'
    }

    if (perfectlyTuned) {
      return `${targetString} is centered. Move on to the next string when ready.`
    }

    return tuningCents > 0 ? 'Pitch is sharp. Loosen the tuner slightly.' : 'Pitch is flat. Tighten the tuner slowly.'
  }, [perfectlyTuned, signalPresent, snapshot.clarity, snapshot.level, status, targetString, tuningCents])

  const sectionTitle = useMemo(() => {
    switch (activeSection) {
      case 'overview':
        return 'Command Center'
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

  const spotlightSongs = filteredSongs.slice(0, 5)
  const queueSongs = filteredSongs.slice(0, 8)
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

    audio.loop = loopEnabled
  }, [loopEnabled])

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

      if (!activeSong) {
        return
      }

      const wholeSecond = Math.floor(audio.currentTime)

      if (wholeSecond === lastSavedSecondRef.current) {
        return
      }

      lastSavedSecondRef.current = wholeSecond
      playbackPositionsRef.current[activeSong.id] = audio.currentTime
      window.localStorage.setItem(
        'bass-record.playbackPositions',
        JSON.stringify(playbackPositionsRef.current),
      )
    }

    const onLoadStart = () => {
      lastSavedSecondRef.current = -1
      setCurrentTime(0)
      setDuration(0)
    }

    const onLoadedMetadata = () => {
      if (activeSong) {
        const resumeAt = playbackPositionsRef.current[activeSong.id] ?? 0
        const safeResumeAt =
          resumeAt > 0 && audio.duration > 1 ? Math.min(resumeAt, audio.duration - 0.5) : 0

        if (safeResumeAt > 0) {
          audio.currentTime = safeResumeAt
        }
      }

      setDuration(audio.duration || 0)
      setCurrentTime(audio.currentTime || 0)
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      if (activeSong) {
        playbackPositionsRef.current[activeSong.id] = 0
        window.localStorage.setItem(
          'bass-record.playbackPositions',
          JSON.stringify(playbackPositionsRef.current),
        )
      }

      if (loopEnabled || filteredSongs.length === 0 || !activeSong) {
        setIsPlaying(false)
        return
      }

      const currentIndex = filteredSongs.findIndex((song) => song.id === activeSong.id)
      const nextSong = filteredSongs[(currentIndex + 1) % filteredSongs.length]
      autoPlayNextTrackRef.current = true
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
  }, [abLoopEnabled, activeSong, filteredSongs, loopEnabled, loopEnd, loopStart])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (!activeTrack) {
      audio.pause()
      audio.load()
      return
    }

    audio.load()

    if (autoPlayNextTrackRef.current || isPlaying) {
      void audio.play().catch(() => {
        setIsPlaying(false)
      })
    }

    autoPlayNextTrackRef.current = false
  }, [activeTrack, isPlaying])

  useEffect(() => {
    if (!referenceEnabled) {
      const nodes = referenceNodesRef.current
      const audioContext = referenceContextRef.current

      nodes?.output.gain.cancelScheduledValues(audioContext?.currentTime ?? 0)
      nodes?.output.gain.setTargetAtTime(0, audioContext?.currentTime ?? 0, 0.05)

      window.setTimeout(() => {
        stopOscillator(nodes?.primary)
        stopOscillator(nodes?.octave)
        if (referenceNodesRef.current === nodes) {
          referenceNodesRef.current = null
        }
      }, 160)

      return
    }

    const audioContext =
      referenceContextRef.current ?? new AudioContext({ latencyHint: 'interactive' })
    referenceContextRef.current = audioContext

    const output = audioContext.createGain()
    const tremolo = audioContext.createGain()
    const primary = audioContext.createOscillator()
    const octave = audioContext.createOscillator()

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

    output.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 0.08)
    referenceNodesRef.current = { primary, octave, output, tremolo }

    return () => {
      output.gain.cancelScheduledValues(audioContext.currentTime)
      output.gain.setTargetAtTime(0, audioContext.currentTime, 0.05)
      window.setTimeout(() => {
        stopOscillator(primary)
        stopOscillator(octave)
      }, 180)
    }
  }, [activeReferenceNote, concertA, referenceEnabled, tuning])

  useEffect(() => {
    if (!metronomeEnabled) {
      if (metronomeTimerRef.current !== null) {
        window.clearInterval(metronomeTimerRef.current)
        metronomeTimerRef.current = null
      }

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
      stopOscillator(referenceNodesRef.current?.primary)
      stopOscillator(referenceNodesRef.current?.octave)
      referenceContextRef.current?.close().catch(() => undefined)
      metronomeContextRef.current?.close().catch(() => undefined)
    }
  }, [])

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
    if (filteredSongs.length === 0 || !activeSong) {
      return
    }

    const currentIndex = filteredSongs.findIndex((song) => song.id === activeSong.id)
    const nextIndex = (currentIndex + direction + filteredSongs.length) % filteredSongs.length

    autoPlayNextTrackRef.current = isPlaying
    setSelectedSongId(filteredSongs[nextIndex].id)
  }

  const toggleFavorite = (songId: string) => {
    setFavoriteSongIds((current) =>
      current.includes(songId) ? current.filter((id) => id !== songId) : [...current, songId],
    )
  }

  const handleSongSelect = (songId: string, autoplay = false) => {
    autoPlayNextTrackRef.current = autoplay || isPlaying
    setSelectedSongId(songId)
  }

  const handleVariantSelect = (variant: TrackVariant) => {
    autoPlayNextTrackRef.current = isPlaying
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

  const showOverview = activeSection === 'overview'
  const showTuner = activeSection === 'overview' || activeSection === 'tuner' || activeSection === 'practice'
  const showQueue = activeSection === 'overview' || activeSection === 'library'
  const showRig = activeSection === 'overview' || activeSection === 'tuner' || activeSection === 'input'
  const showReference = activeSection === 'overview' || activeSection === 'tuner' || activeSection === 'input'
  const showLibraryPanel = activeSection === 'overview' || activeSection === 'library'
  const showPracticeLab = activeSection === 'practice'

  return (
    <div className="app-shell app-window">
      <div className="noise-overlay" />
      <audio ref={audioRef} preload="metadata" src={activeTrack?.filePath} />

      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">R</div>
          <div>
            <strong>Redline Bass</strong>
            <span>Scarlett practice desk</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {sectionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-link ${activeSection === item.id ? 'sidebar-link-active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <p className="panel-label">Quick Stats</p>
          {quickStats.map((stat) => (
            <article key={stat.label} className="sidebar-stat">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </div>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <span>Workspace</span>
            <strong>{sectionTitle}</strong>
          </div>

          <label className="topbar-search">
            <Search size={18} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search tracks, lessons, levels"
            />
          </label>

          <div className="topbar-actions">
            <div className={`status-chip status-${status}`}>
              <Radio size={16} />
              <span>{status === 'running' ? 'Input armed' : status === 'requesting' ? 'Waiting permission' : status === 'error' ? 'Input error' : 'Standby'}</span>
            </div>
            <div className={`status-chip ${perfectlyTuned ? 'status-tuned' : 'status-live'}`}>
              <Gauge size={16} />
              <span>{perfectlyTuned ? 'Perfectly tuned' : 'Tracking pitch'}</span>
            </div>
          </div>
        </header>

        <div className="content-scroll">
          {showOverview && (
          <section className="hero-grid">
            <article className="hero-card hero-card-primary">
              <p className="panel-label">Live tuning</p>
              <strong>{noteParts.pitchClass}{noteParts.octave}</strong>
              <span>{signalPresent ? formatFrequency(snapshot.frequency ?? 0) : 'Waiting for note'}</span>
              <small>{perfectlyTuned ? 'Locked at center' : currentTip}</small>
            </article>
            <article className="hero-card">
              <p className="panel-label">Current target</p>
              <strong>{targetString}</strong>
              <span>{formatFrequency(targetFrequency)}</span>
              <small>{Math.abs(tuningCents).toFixed(1)} cents {tuningCents > 0 ? 'sharp' : 'flat'}</small>
            </article>
            <article className="hero-card">
              <p className="panel-label">Practice library</p>
              <strong>{librarySongs.length}</strong>
              <span>Total tracks</span>
              <small>{backingReadyCount} with backing versions</small>
            </article>
            <article className="hero-card">
              <p className="panel-label">Input path</p>
              <strong>{activeInput?.label ?? 'No active input'}</strong>
              <span>{devices.length} devices detected</span>
              <small>{deviceHint}</small>
            </article>
          </section>
          )}

          {showQueue && (
          <section className="content-section">
            <div className="section-heading">
              <div>
                <p className="panel-label">Continue practice</p>
                <h2>Queue</h2>
              </div>
              <div className="toggle-row">
                <button
                  type="button"
                  className={`toggle-chip ${favoritesOnly ? 'toggle-chip-active' : ''}`}
                  onClick={() => setFavoritesOnly((current) => !current)}
                >
                  Favorites only
                </button>
                <button
                  type="button"
                  className={`toggle-chip ${onlyBacking ? 'toggle-chip-active' : ''}`}
                  onClick={() => setOnlyBacking((current) => !current)}
                >
                  Backing only
                </button>
              </div>
            </div>

            <div className="spotlight-row">
              {spotlightSongs.map((song) => (
                <button
                  key={song.id}
                  type="button"
                  className={`spotlight-card ${song.id === activeSong?.id ? 'spotlight-card-active' : ''}`}
                  onClick={() => handleSongSelect(song.id, true)}
                >
                  <span>{song.lessonName}</span>
                  <strong>{song.title}</strong>
                  <small>{song.level ?? 'Open practice'}</small>
                </button>
              ))}
            </div>
          </section>
          )}

          <div className={`workspace-grid workspace-grid-${activeSection}`}>
            {showPracticeLab && (
              <section className="panel practice-lab-panel">
                <div className="section-heading">
                  <div>
                    <p className="panel-label">Practice Lab</p>
                    <h2>A-B Loop, Click & Notes</h2>
                  </div>
                  <div className="panel-meta">
                    <span>{activeSong?.title ?? 'No track selected'}</span>
                    <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                  </div>
                </div>

                <div className="practice-grid">
                  <article className="practice-card analysis-card">
                    <div className="practice-card-head">
                      <BarChart3 size={18} />
                      <strong>Signal / Groove View</strong>
                    </div>
                    <div className="visualizer-bars" aria-hidden="true">
                      {analysisBars.map((height, index) => (
                        <i key={index} style={{ height: `${height}%` }} />
                      ))}
                    </div>
                    <p>Use tuner clarity and playback position as a lightweight practice visualizer.</p>
                  </article>

                  <article className="practice-card">
                    <div className="practice-card-head">
                      <Repeat size={18} />
                      <strong>A-B Loop</strong>
                    </div>
                    <div className="ab-loop-grid">
                      <button type="button" className="toggle-chip" onClick={() => setLoopPoint('start')}>
                        Set A {loopStart !== null ? formatTime(loopStart) : '--'}
                      </button>
                      <button type="button" className="toggle-chip" onClick={() => setLoopPoint('end')}>
                        Set B {loopEnd !== null ? formatTime(loopEnd) : '--'}
                      </button>
                      <button
                        type="button"
                        className={`toggle-chip ${abLoopEnabled ? 'toggle-chip-active' : ''}`}
                        onClick={() => setAbLoopEnabled((current) => !current)}
                        disabled={loopStart === null || loopEnd === null || loopEnd <= loopStart}
                      >
                        {abLoopEnabled ? 'A-B on' : 'A-B off'}
                      </button>
                    </div>
                    <small>Loop a hard phrase without changing single-track repeat.</small>
                  </article>

                  <article className="practice-card">
                    <div className="practice-card-head">
                      <Timer size={18} />
                      <strong>Metronome</strong>
                    </div>
                    <div className="tempo-row">
                      <input
                        type="range"
                        min="40"
                        max="220"
                        value={tempo}
                        onChange={(event) => setTempo(Number(event.target.value))}
                      />
                      <strong>{tempo} BPM</strong>
                    </div>
                    <button
                      type="button"
                      className={`toggle-chip ${metronomeEnabled ? 'toggle-chip-active' : ''}`}
                      onClick={() => setMetronomeEnabled((current) => !current)}
                    >
                      {metronomeEnabled ? 'Stop click' : 'Start click'}
                    </button>
                  </article>

                  <article className="practice-card marker-card">
                    <div className="practice-card-head">
                      <Bookmark size={18} />
                      <strong>Song Markers</strong>
                    </div>
                    <button type="button" className="icon-button" onClick={addMarker} disabled={!activeSong}>
                      <Plus size={16} />
                      <span>Add marker</span>
                    </button>
                    <div className="marker-list">
                      {activeSongMarkers.length > 0 ? (
                        activeSongMarkers.map((marker) => (
                          <div key={marker.id} className="marker-row">
                            <button type="button" onClick={() => jumpToTime(marker.time)}>
                              <strong>{marker.label}</strong>
                              <span>{formatTime(marker.time)}</span>
                            </button>
                            <button type="button" className="ghost-button" onClick={() => removeMarker(marker.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <small>No markers yet. Drop one before a difficult fill or shift.</small>
                      )}
                    </div>
                  </article>
                </div>

                <label className="notes-field">
                  <span>Practice notes for this track</span>
                  <textarea
                    value={activePracticeNote}
                    onChange={(event) => updatePracticeNote(event.target.value)}
                    placeholder="Write fingering ideas, tempo goals, tone notes, or bars to revisit."
                    disabled={!activeSong}
                  />
                </label>
              </section>
            )}

            {showTuner && (
            <section className="panel tuner-panel">
              <div className="section-heading">
                <div>
                  <p className="panel-label">Tuner deck</p>
                  <h2>Main Tuner</h2>
                </div>
                <div className="panel-meta">
                  <span>{signalPresent ? formatFrequency(snapshot.frequency ?? 0) : 'No pitch yet'}</span>
                  <span>{signalPresent ? `Target ${formatFrequency(targetFrequency)}` : 'Awaiting note'}</span>
                </div>
              </div>

              <div className={`tuner-stage ${perfectlyTuned ? 'tuner-stage-tuned' : ''}`}>
                {perfectlyTuned && (
                  <div className="tune-badge">
                    <Sparkles size={16} />
                    <span>In tune</span>
                  </div>
                )}

                <div className="note-lockup">
                  <span className="note-name">{noteParts.pitchClass}</span>
                  <span className="note-octave">{noteParts.octave}</span>
                  <p className="note-subtitle">
                    Target <strong>{targetString}</strong> · {formatFrequency(targetFrequency)}
                  </p>
                </div>

                <div className="meter-shell">
                  <div className="meter-scale">
                    {[-50, -30, -10, 0, 10, 30, 50].map((tick) => (
                      <span
                        key={tick}
                        className={`meter-tick ${tick === 0 ? 'meter-tick-center' : ''}`}
                        style={{ left: `${tick + 50}%` }}
                      >
                        <i />
                        <small>{tick}</small>
                      </span>
                    ))}
                    <div className={`tolerance-zone ${inTune ? 'tolerance-zone-hot' : ''}`} />
                    <div className="needle" style={{ left: needleOffset }} />
                  </div>

                  <div className="meter-readout">
                    <span className={tuningCents > 0 ? 'sharp' : 'flat'}>
                      {signalPresent
                        ? `${Math.abs(tuningCents).toFixed(1)} cents ${tuningCents > 0 ? 'sharp' : 'flat'}`
                        : 'Waiting for direct signal'}
                    </span>
                    <strong>{perfectlyTuned ? 'Perfect' : inTune && signalPresent ? 'Close enough' : 'Adjust slowly'}</strong>
                  </div>
                </div>
              </div>

              <div className="string-grid">
                {tuning.strings.map((item) => {
                  const active = snapshot.stringMatch?.note === item.note
                  const itemCents = active ? Math.abs(snapshot.stringMatch?.cents ?? 999) : null
                  const itemTuned = itemCents !== null && itemCents <= 5

                  return (
                    <button
                      key={item.note}
                      type="button"
                      className={`string-card ${active ? 'string-card-active' : ''} ${itemTuned ? 'string-card-tuned' : ''}`}
                      onClick={() => {
                        setReferenceStringNote(item.note)
                        setReferenceEnabled(true)
                      }}
                    >
                      <span>{item.label}</span>
                      <strong>{item.note}</strong>
                      <small>{formatFrequency(midiToFrequency(item.midi, concertA))}</small>
                    </button>
                  )
                })}
              </div>

              <div className="insight-strip">
                <article className="mini-stat">
                  <AudioLines size={18} />
                  <div>
                    <span>Signal</span>
                    <strong>{signalLevel}%</strong>
                  </div>
                </article>
                <article className="mini-stat">
                  <Activity size={18} />
                  <div>
                    <span>Clarity</span>
                    <strong>{clarityPercent}%</strong>
                  </div>
                </article>
                <article className="mini-stat">
                  <Guitar size={18} />
                  <div>
                    <span>Preset</span>
                    <strong>{tuning.subtitle}</strong>
                  </div>
                </article>
              </div>
            </section>
            )}

            <aside className="workspace-side">
              {showRig && (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="panel-label">Controls</p>
                    <h2>Rig</h2>
                  </div>
                  <button type="button" className="icon-button" onClick={() => void restart()}>
                    <RefreshCw size={16} />
                    <span>Reconnect</span>
                  </button>
                </div>

                <label className="field">
                  <span>Audio input</span>
                  <select
                    value={visibleDeviceId}
                    onChange={(event) => setSelectedDeviceId(event.target.value)}
                  >
                    <option value="">Default input</option>
                    {devices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Concert A</span>
                  <div className="slider-row">
                    <input
                      type="range"
                      min="430"
                      max="450"
                      step="1"
                      value={concertA}
                      onChange={(event) => setConcertA(Number(event.target.value))}
                    />
                    <strong>{concertA} Hz</strong>
                  </div>
                </label>

                <div className="preset-grid">
                  {tuningPresets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`preset-card ${item.id === tuning.id ? 'preset-card-active' : ''}`}
                      onClick={() => setSelectedTuningId(item.id)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.subtitle}</span>
                    </button>
                  ))}
                </div>

                <div className={`callout ${error ? 'error-callout' : ''}`}>
                  {error ? <CircleAlert size={18} /> : <SlidersHorizontal size={18} />}
                  <p>{deviceHint}</p>
                </div>
              </section>
              )}

              {showReference && (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <p className="panel-label">Reference</p>
                    <h2>Reference Tone</h2>
                  </div>
                  <button
                    type="button"
                    className={`icon-button ${referenceEnabled ? 'icon-button-live' : ''}`}
                    onClick={() => setReferenceEnabled((current) => !current)}
                  >
                    <Volume2 size={16} />
                    <span>{referenceEnabled ? 'Stop' : 'Play'}</span>
                  </button>
                </div>

                <div className="reference-grid">
                  {tuning.strings.map((item) => (
                    <button
                      key={item.note}
                      type="button"
                      className={`reference-pill ${item.note === activeReferenceNote ? 'reference-pill-active' : ''}`}
                      onClick={() => {
                        setReferenceStringNote(item.note)
                        setReferenceEnabled(true)
                      }}
                    >
                      {item.note}
                    </button>
                  ))}
                </div>

                <div className="tip-box">
                  <p>{currentTip}</p>
                </div>

                <div className="history-row">
                  <span>Recent locks</span>
                  <div>
                    {history.length > 0 ? (
                      history.map((item, index) => <b key={`${item}-${index}`}>{item}</b>)
                    ) : (
                      <b>--</b>
                    )}
                  </div>
                </div>
              </section>
              )}

              {showLibraryPanel && (
              <section className="panel library-panel app-library-panel">
                <div className="section-heading">
                  <div>
                    <p className="panel-label">Library</p>
                    <h2>Tracks</h2>
                  </div>
                  <div className="filter-group">
                    <button
                      type="button"
                      className={`filter-chip ${selectedLessonId === 'all' ? 'filter-chip-active' : ''}`}
                      onClick={() => setSelectedLessonId('all')}
                    >
                      All
                    </button>
                    {lessonOptions.map((lesson) => (
                      <button
                        key={lesson.id}
                        type="button"
                        className={`filter-chip ${selectedLessonId === lesson.id ? 'filter-chip-active' : ''}`}
                        onClick={() => setSelectedLessonId(lesson.id)}
                      >
                        {lesson.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="song-list compact-song-list">
                  {queueSongs.length > 0 ? (
                    queueSongs.map((song) => {
                      const favorite = favoriteSongIdSet.has(song.id)

                      return (
                        <article
                          key={song.id}
                          className={`song-card ${song.id === activeSong?.id ? 'song-card-active' : ''}`}
                        >
                          <button
                            type="button"
                            className="song-card-main"
                            onClick={() => handleSongSelect(song.id, true)}
                          >
                            <div className="song-card-top">
                              <div>
                                <strong>{song.title}</strong>
                                <span>{song.lessonName}</span>
                              </div>
                              <span className="song-level">{song.level ?? 'Practice'}</span>
                            </div>
                            <div className="song-variants">
                              {variantOptions
                                .filter((variant) => song.availableVariants.includes(variant.id))
                                .map((variant) => (
                                  <span key={`${song.id}-${variant.id}`} className="variant-pill variant-pill-live">
                                    {variant.label}
                                  </span>
                                ))}
                            </div>
                          </button>
                          <button
                            type="button"
                            className={`favorite-button ${favorite ? 'favorite-button-active' : ''}`}
                            onClick={() => toggleFavorite(song.id)}
                            aria-label={favorite ? 'Unfavorite track' : 'Favorite track'}
                          >
                            <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
                          </button>
                        </article>
                      )
                    })
                  ) : (
                    <div className="empty-state">
                      <p>No tracks match the current filter.</p>
                      <small>Try clearing search or turning off favorites-only mode.</small>
                    </div>
                  )}
                </div>
              </section>
              )}
            </aside>
          </div>
        </div>

        <footer className="bottom-player">
          <div className="player-now">
            <div className="player-avatar">{activeSong?.lessonName ?? 'Bass'}</div>
            <div>
              <strong>{activeSong?.title ?? 'No track selected'}</strong>
              <span>
                {activeTrack ? `${activeTrack.label} - ${activeSong?.lessonName ?? ''}` : 'Select a practice track'}
              </span>
            </div>
          </div>

          <div className="player-center">
            <div className="transport-row">
              <button type="button" className="transport-button" onClick={() => jumpSong(-1)}>
                <SkipBack size={18} />
              </button>
              <button
                type="button"
                className="transport-button transport-button-primary"
                onClick={() => void togglePlayback()}
              >
                {isPlaying ? <Pause size={22} /> : <Play size={22} />}
              </button>
              <button type="button" className="transport-button" onClick={() => jumpSong(1)}>
                <SkipForward size={18} />
              </button>
            </div>

            <div className="progress-block">
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(currentTime, duration || 0)}
                onChange={(event) => {
                  const audio = audioRef.current
                  const nextTime = Number(event.target.value)

                  if (!audio) {
                    return
                  }

                  audio.currentTime = nextTime
                  setCurrentTime(nextTime)
                }}
              />
              <div className="time-row">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className="player-right">
            <div className="variant-row">
              {activeSong
                ? variantOptions
                    .filter((variant) => activeSong.variants[variant.id])
                    .map((variant) => (
                      <button
                        key={`${activeSong.id}-${variant.id}`}
                        type="button"
                        className={`variant-switch ${preferredVariant === variant.id ? 'variant-switch-active' : ''}`}
                        onClick={() => handleVariantSelect(variant.id)}
                      >
                        {variant.label}
                      </button>
                    ))
                : null}
            </div>

            <div className="rate-row">
              {[0.75, 1, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={`rate-chip ${playbackRate === rate ? 'rate-chip-active' : ''}`}
                  onClick={() => setPlaybackRate(rate)}
                >
                  {rate}x
                </button>
              ))}
              <button
                type="button"
                className={`rate-chip ${loopEnabled ? 'rate-chip-active' : ''}`}
                onClick={() => setLoopEnabled((current) => !current)}
              >
                <Repeat size={14} />
                <span>Loop</span>
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  )
}

export default App
