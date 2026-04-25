import { Star } from 'lucide-react'

import { lessonOptions, variantOptions, type LibrarySong } from '../lib/tracks'

type LibraryPanelProps = {
  selectedLessonId: string
  queueSongs: LibrarySong[]
  activeSong: LibrarySong | null
  favoriteSongIdSet: Set<string>
  onLessonSelect: (lessonId: string) => void
  onSongSelect: (songId: string, autoplay?: boolean) => void
  onToggleFavorite: (songId: string) => void
}

export function LibraryPanel({
  selectedLessonId,
  queueSongs,
  activeSong,
  favoriteSongIdSet,
  onLessonSelect,
  onSongSelect,
  onToggleFavorite,
}: LibraryPanelProps) {
  return (
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
            onClick={() => onLessonSelect('all')}
          >
            All
          </button>
          {lessonOptions.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              className={`filter-chip ${selectedLessonId === lesson.id ? 'filter-chip-active' : ''}`}
              onClick={() => onLessonSelect(lesson.id)}
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
                  onClick={() => onSongSelect(song.id, true)}
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
                  onClick={() => onToggleFavorite(song.id)}
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
  )
}
