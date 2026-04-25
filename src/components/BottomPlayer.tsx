import { Repeat, SkipBack, SkipForward, Pause, Play } from 'lucide-react'

import { formatTime } from '../app/types'
import { variantOptions, type LibrarySong, type SongTrack, type TrackVariant } from '../lib/tracks'

type BottomPlayerProps = {
  activeSong: LibrarySong | null
  activeTrack: SongTrack | null
  currentTime: number
  duration: number
  isPlaying: boolean
  preferredVariant: TrackVariant
  playbackRate: number
  loopEnabled: boolean
  onJumpSong: (direction: -1 | 1) => void
  onTogglePlayback: () => void
  onSeek: (time: number) => void
  onVariantSelect: (variant: TrackVariant) => void
  onPlaybackRateChange: (rate: number) => void
  onToggleLoop: () => void
}

export function BottomPlayer({
  activeSong,
  activeTrack,
  currentTime,
  duration,
  isPlaying,
  preferredVariant,
  playbackRate,
  loopEnabled,
  onJumpSong,
  onTogglePlayback,
  onSeek,
  onVariantSelect,
  onPlaybackRateChange,
  onToggleLoop,
}: BottomPlayerProps) {
  const playbackRates = [0.75, 1, 1.25, 1.5]
  const cyclePlaybackRate = () => {
    const currentIndex = playbackRates.indexOf(playbackRate)
    const nextRate = playbackRates[(currentIndex + 1) % playbackRates.length]
    onPlaybackRateChange(nextRate)
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
          <button type="button" className="rate-chip rate-chip-active" onClick={cyclePlaybackRate}>
            {playbackRate}x
          </button>
          <button type="button" className={`rate-chip ${loopEnabled ? 'rate-chip-active' : ''}`} onClick={onToggleLoop}>
            <Repeat size={14} />
            <span>Loop</span>
          </button>
        </div>
      </div>
    </footer>
  )
}
