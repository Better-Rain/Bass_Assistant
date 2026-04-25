import type { LibrarySong } from '../lib/tracks'

type QueueSectionProps = {
  favoritesOnly: boolean
  onlyBacking: boolean
  spotlightSongs: LibrarySong[]
  activeSong: LibrarySong | null
  onToggleFavoritesOnly: () => void
  onToggleOnlyBacking: () => void
  onSongSelect: (songId: string, autoplay?: boolean) => void
}

export function QueueSection({
  favoritesOnly,
  onlyBacking,
  spotlightSongs,
  activeSong,
  onToggleFavoritesOnly,
  onToggleOnlyBacking,
  onSongSelect,
}: QueueSectionProps) {
  return (
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
            onClick={onToggleFavoritesOnly}
          >
            Favorites only
          </button>
          <button
            type="button"
            className={`toggle-chip ${onlyBacking ? 'toggle-chip-active' : ''}`}
            onClick={onToggleOnlyBacking}
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
            onClick={() => onSongSelect(song.id, true)}
          >
            <span>{song.lessonName}</span>
            <strong>{song.title}</strong>
            <small>{song.level ?? 'Open practice'}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
