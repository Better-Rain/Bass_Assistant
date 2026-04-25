import { ListMusic, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Trash2 } from 'lucide-react'

import { formatTime, type PlaybackMode } from '../app/types'
import { variantOptions, type LibrarySong, type SongTrack, type TrackVariant } from '../lib/tracks'

type BottomPlayerProps = {
  activeSong: LibrarySong | null
  activeTrack: SongTrack | null
  currentTime: number
  duration: number
  isPlaying: boolean
  preferredVariant: TrackVariant
  playbackRate: number
  playbackMode: PlaybackMode
  queueSongs: LibrarySong[]
  queueOpen: boolean
  onJumpSong: (direction: -1 | 1) => void
  onTogglePlayback: () => void
  onSeek: (time: number) => void
  onVariantSelect: (variant: TrackVariant) => void
  onPlaybackRateChange: (rate: number) => void
  onPlaybackModeChange: (mode: PlaybackMode) => void
  onQueueSongSelect: (songId: string) => void
  onRemoveQueueSong: (songId: string) => void
  onClearQueue: () => void
  onToggleQueue: () => void
}

const playbackModes: { id: PlaybackMode; label: string; shortLabel: string }[] = [
  { id: 'sequential', label: 'Sequential', shortLabel: 'Order' },
  { id: 'shuffle', label: 'Shuffle order', shortLabel: 'Shuffle' },
  { id: 'repeat-one', label: 'Repeat current track', shortLabel: 'One' },
  { id: 'stop-after-current', label: 'Stop after current track', shortLabel: 'Stop' },
  { id: 'repeat-list', label: 'Repeat queue', shortLabel: 'List' },
]

export function BottomPlayer({
  activeSong,
  activeTrack,
  currentTime,
  duration,
  isPlaying,
  preferredVariant,
  playbackRate,
  playbackMode,
  queueSongs,
  queueOpen,
  onJumpSong,
  onTogglePlayback,
  onSeek,
  onVariantSelect,
  onPlaybackRateChange,
  onPlaybackModeChange,
  onQueueSongSelect,
  onRemoveQueueSong,
  onClearQueue,
  onToggleQueue,
}: BottomPlayerProps) {
  const playbackRates = [0.75, 1, 1.25, 1.5]
  const activePlaybackMode = playbackModes.find((mode) => mode.id === playbackMode) ?? playbackModes[0]

  const cyclePlaybackRate = () => {
    const currentIndex = playbackRates.indexOf(playbackRate)
    const nextRate = playbackRates[(currentIndex + 1) % playbackRates.length]
    onPlaybackRateChange(nextRate)
  }

  const cyclePlaybackMode = () => {
    const currentIndex = playbackModes.findIndex((mode) => mode.id === playbackMode)
    const nextMode = playbackModes[(currentIndex + 1) % playbackModes.length]
    onPlaybackModeChange(nextMode.id)
  }

  return (
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
          <button type="button" className="transport-button" onClick={() => onJumpSong(-1)}>
            <SkipBack size={18} />
          </button>
          <button type="button" className="transport-button transport-button-primary" onClick={onTogglePlayback}>
            {isPlaying ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button type="button" className="transport-button" onClick={() => onJumpSong(1)}>
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
            onChange={(event) => onSeek(Number(event.target.value))}
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
                    onClick={() => onVariantSelect(variant.id)}
                  >
                    {variant.label}
                  </button>
                ))
            : null}
        </div>

        <div className="rate-row">
          <div className="queue-control">
            <button type="button" className="rate-chip" onClick={onToggleQueue}>
              <ListMusic size={14} />
              <span>Queue {queueSongs.length}</span>
            </button>

            {queueOpen && (
              <div className="queue-popover" role="dialog" aria-label="Playback queue">
                <div className="queue-popover-header">
                  <div>
                    <p className="panel-label">Queue</p>
                    <strong>{queueSongs.length} tracks</strong>
                  </div>
                  <button type="button" className="queue-clear-button" onClick={onClearQueue}>
                    Clear
                  </button>
                </div>
                <div className="queue-track-list">
                  {queueSongs.length > 0 ? (
                    queueSongs.map((song, index) => (
                      <div key={`${song.id}-${index}`} className={`queue-track ${song.id === activeSong?.id ? 'queue-track-active' : ''}`}>
                        <button type="button" onClick={() => onQueueSongSelect(song.id)}>
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <strong>{song.title}</strong>
                          <small>{song.lessonName}</small>
                        </button>
                        <button type="button" className="queue-remove-button" onClick={() => onRemoveQueueSong(song.id)} aria-label={`Remove ${song.title}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="queue-empty">Right-click a category and choose Play category.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button type="button" className="rate-chip rate-chip-active" onClick={cyclePlaybackRate}>
            {playbackRate}x
          </button>
          <button type="button" className="rate-chip rate-chip-active" onClick={cyclePlaybackMode} title={activePlaybackMode.label}>
            {playbackMode === 'shuffle' ? <Shuffle size={14} /> : <Repeat size={14} />}
            <span>{activePlaybackMode.shortLabel}</span>
          </button>
        </div>
      </div>
    </footer>
  )
}
