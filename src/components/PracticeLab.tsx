import { Bookmark, BarChart3, Plus, Repeat, Timer, Trash2 } from 'lucide-react'

import { formatTime, type PracticeMarker } from '../app/types'
import type { LibrarySong } from '../lib/tracks'

type PracticeLabProps = {
  activeSong: LibrarySong | null
  currentTime: number
  duration: number
  analysisBars: number[]
  loopStart: number | null
  loopEnd: number | null
  abLoopEnabled: boolean
  tempo: number
  metronomeEnabled: boolean
  activeSongMarkers: PracticeMarker[]
  activePracticeNote: string
  onSetLoopPoint: (point: 'start' | 'end') => void
  onToggleAbLoop: () => void
  onTempoChange: (tempo: number) => void
  onToggleMetronome: () => void
  onAddMarker: () => void
  onRemoveMarker: (markerId: string) => void
  onJumpToTime: (time: number) => void
  onUpdatePracticeNote: (note: string) => void
}

export function PracticeLab({
  activeSong,
  currentTime,
  duration,
  analysisBars,
  loopStart,
  loopEnd,
  abLoopEnabled,
  tempo,
  metronomeEnabled,
  activeSongMarkers,
  activePracticeNote,
  onSetLoopPoint,
  onToggleAbLoop,
  onTempoChange,
  onToggleMetronome,
  onAddMarker,
  onRemoveMarker,
  onJumpToTime,
  onUpdatePracticeNote,
}: PracticeLabProps) {
  return (
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
            <button type="button" className="toggle-chip" onClick={() => onSetLoopPoint('start')}>
              Set A {loopStart !== null ? formatTime(loopStart) : '--'}
            </button>
            <button type="button" className="toggle-chip" onClick={() => onSetLoopPoint('end')}>
              Set B {loopEnd !== null ? formatTime(loopEnd) : '--'}
            </button>
            <button
              type="button"
              className={`toggle-chip ${abLoopEnabled ? 'toggle-chip-active' : ''}`}
              onClick={onToggleAbLoop}
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
              onChange={(event) => onTempoChange(Number(event.target.value))}
            />
            <strong>{tempo} BPM</strong>
          </div>
          <button
            type="button"
            className={`toggle-chip ${metronomeEnabled ? 'toggle-chip-active' : ''}`}
            onClick={onToggleMetronome}
          >
            {metronomeEnabled ? 'Stop click' : 'Start click'}
          </button>
        </article>

        <article className="practice-card marker-card">
          <div className="practice-card-head">
            <Bookmark size={18} />
            <strong>Song Markers</strong>
          </div>
          <button type="button" className="icon-button" onClick={onAddMarker} disabled={!activeSong}>
            <Plus size={16} />
            <span>Add marker</span>
          </button>
          <div className="marker-list">
            {activeSongMarkers.length > 0 ? (
              activeSongMarkers.map((marker) => (
                <div key={marker.id} className="marker-row">
                  <button type="button" onClick={() => onJumpToTime(marker.time)}>
                    <strong>{marker.label}</strong>
                    <span>{formatTime(marker.time)}</span>
                  </button>
                  <button type="button" className="ghost-button" onClick={() => onRemoveMarker(marker.id)}>
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
          onChange={(event) => onUpdatePracticeNote(event.target.value)}
          placeholder="Write fingering ideas, tempo goals, tone notes, or bars to revisit."
          disabled={!activeSong}
        />
      </label>
    </section>
  )
}
