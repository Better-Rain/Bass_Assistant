import { Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { SongCategoryMap, UserCategory } from '../app/types'
import { lessonOptions, variantOptions, type LibrarySong } from '../lib/tracks'

type LibraryPanelProps = {
  selectedLessonId: string
  selectedCategoryId: string
  queueSongs: LibrarySong[]
  activeSong: LibrarySong | null
  favoriteSongIdSet: Set<string>
  userCategories: UserCategory[]
  songCategories: SongCategoryMap
  onLessonSelect: (lessonId: string) => void
  onCategorySelect: (categoryId: string) => void
  onSongSelect: (songId: string, autoplay?: boolean) => void
  onToggleFavorite: (songId: string) => void
  onCreateCategory: (name: string) => void
  onDeleteCategory: (categoryId: string) => void
  onToggleSongCategory: (songId: string, categoryId: string) => void
}

export function LibraryPanel({
  selectedLessonId,
  selectedCategoryId,
  queueSongs,
  activeSong,
  favoriteSongIdSet,
  userCategories,
  songCategories,
  onLessonSelect,
  onCategorySelect,
  onSongSelect,
  onToggleFavorite,
  onCreateCategory,
  onDeleteCategory,
  onToggleSongCategory,
}: LibraryPanelProps) {
  const [categoryName, setCategoryName] = useState('')

  const submitCategory = () => {
    onCreateCategory(categoryName)
    setCategoryName('')
  }

  return (
    <section className="panel library-panel app-library-panel">
      <div className="section-heading library-heading">
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
            All Lessons
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

      <div className="category-manager">
        <div className="category-toolbar">
          <div>
            <span>Custom categories</span>
            <strong>{userCategories.length} saved</strong>
          </div>
          <label className="category-create">
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submitCategory()
                }
              }}
              placeholder="Create a category"
            />
            <button type="button" onClick={submitCategory} aria-label="Create category">
              <Plus size={15} />
            </button>
          </label>
        </div>

        <div className="category-filter-row">
          <button
            type="button"
            className={`category-filter-chip ${selectedCategoryId === 'all' ? 'category-filter-chip-active' : ''}`}
            onClick={() => onCategorySelect('all')}
          >
            All Categories
          </button>
          {userCategories.map((category) => (
            <span key={category.id} className="category-filter-item">
              <button
                type="button"
                className={`category-filter-chip ${selectedCategoryId === category.id ? 'category-filter-chip-active' : ''}`}
                onClick={() => onCategorySelect(category.id)}
              >
                {category.name}
              </button>
              <button
                type="button"
                className="category-delete-button"
                onClick={() => onDeleteCategory(category.id)}
                aria-label={`Delete ${category.name}`}
              >
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="library-table-header" aria-hidden="true">
        <span>Track</span>
        <span>Level</span>
        <span>Versions</span>
        <span>Categories</span>
        <span>Save</span>
      </div>

      <div className="song-list compact-song-list">
        {queueSongs.length > 0 ? (
          queueSongs.map((song) => {
            const favorite = favoriteSongIdSet.has(song.id)
            const assignedCategories = songCategories[song.id] ?? []

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
                  <div>
                    <strong>{song.title}</strong>
                    <span>{song.lessonName}</span>
                  </div>
                </button>
                <span className="song-level">{song.level ?? 'Practice'}</span>
                <div className="song-variants">
                  {variantOptions
                    .filter((variant) => song.availableVariants.includes(variant.id))
                    .map((variant) => (
                      <span key={`${song.id}-${variant.id}`} className="variant-pill variant-pill-live">
                        {variant.label}
                      </span>
                    ))}
                </div>
                <div className="song-category-picker">
                  {userCategories.length > 0 ? (
                    userCategories.map((category) => (
                      <button
                        key={`${song.id}-${category.id}`}
                        type="button"
                        className={`song-category-chip ${assignedCategories.includes(category.id) ? 'song-category-chip-active' : ''}`}
                        onClick={() => onToggleSongCategory(song.id, category.id)}
                      >
                        {category.name}
                      </button>
                    ))
                  ) : (
                    <small>Create categories above</small>
                  )}
                </div>
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
