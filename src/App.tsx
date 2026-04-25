import { useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { getStoredMarkers, getStoredNotes, getStoredNumber, getStoredNumberInRange, getStoredPlaybackPositions, getStoredSongCategories, getStoredString, getStoredStringArray, getStoredUserCategories } from './app/storage'
import { pickTrackVariant, stopOscillator, type AppSection, type PracticeMarker, type SongCategoryMap, type UserCategory } from './app/types'
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
  midiToFrequency,
  tuningPresets,
  type TuningPreset,
} from './lib/music'
import { lessonOptions, librarySongs, type TrackVariant } from './lib/tracks'

const DEFAULT_TUNING = tuningPresets[0].id
const DEFAULT_A4 = 440


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

  const queueSongs = filteredSongs
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

  const deleteCategory = (categoryId: string) => {
    const isBuiltInCategory = lessonOptions.some((lesson) => lesson.id === categoryId)

    if (isBuiltInCategory) {
      setHiddenCategoryIds((current) => current.includes(categoryId) ? current : [...current, categoryId])
    } else {
      setUserCategories((current) => current.filter((category) => category.id !== categoryId))
    }

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
        onSectionChange={setActiveSection}
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
                signalPresent={signalPresent}
                targetString={targetString}
                targetFrequency={targetFrequency}
                tuningCents={tuningCents}
                needleOffset={needleOffset}
                perfectlyTuned={perfectlyTuned}
                inTune={inTune}
                signalLevel={signalLevel}
                clarityPercent={clarityPercent}
                onReferenceString={(note) => {
                  setReferenceStringNote(note)
                  setReferenceEnabled(true)
                }}
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
                  queueSongs={queueSongs}
                  allSongs={librarySongs}
                  activeSong={activeSong}
                  favoriteSongIdSet={favoriteSongIdSet}
                  userCategories={userCategories}
                  hiddenCategoryIds={hiddenCategoryIds}
                  managedCategoryIds={managedCategoryIds}
                  songCategories={songCategories}
                  editingCategoryId={editingCategoryId}
                  onFilterSelect={setSelectedLibraryFilterId}
                  onSongSelect={handleSongSelect}
                  onToggleFavorite={toggleFavorite}
                  onCreateCategory={createCategory}
                  onDeleteCategory={deleteCategory}
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
        loopEnabled={loopEnabled}
        queueCount={filteredSongs.length}
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
        onToggleLoop={() => setLoopEnabled((current) => !current)}
        onOpenQueue={() => setActiveSection('library')}
      />
    </div>
  )
}

export default App
