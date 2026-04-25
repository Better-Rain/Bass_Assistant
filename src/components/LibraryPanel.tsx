import { Check, Plus, Settings2, Star, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState, type MouseEvent } from 'react'

import type { SongCategoryMap, UserCategory } from '../app/types'
import { lessonOptions, variantOptions, type LibrarySong } from '../lib/tracks'

type LibraryPanelProps = {
  selectedFilterId: string
  queueSongs: LibrarySong[]
  allSongs: LibrarySong[]
  activeSong: LibrarySong | null
  favoriteSongIdSet: Set<string>
  userCategories: UserCategory[]
  hiddenCategoryIds: string[]
  managedCategoryIds: string[]
  songCategories: SongCategoryMap
  editingCategoryId: string | null
  onFilterSelect: (filterId: string) => void
  onSongSelect: (songId: string, autoplay?: boolean) => void
  onToggleFavorite: (songId: string) => void
  onCreateCategory: (name: string) => void
  onDeleteCategory: (categoryId: string) => void
  onOpenCategoryEditor: (categoryId: string) => void
  onCloseCategoryEditor: () => void
  onSaveCategorySongs: (categoryId: string, songIds: string[]) => void
}

export function LibraryPanel({
  selectedFilterId,
  queueSongs,
  allSongs,
  activeSong,
  favoriteSongIdSet,
  userCategories,
  hiddenCategoryIds,
  managedCategoryIds,
  songCategories,
  editingCategoryId,
  onFilterSelect,
  onSongSelect,
  onToggleFavorite,
  onCreateCategory,
  onDeleteCategory,
  onOpenCategoryEditor,
  onCloseCategoryEditor,
  onSaveCategorySongs,
}: LibraryPanelProps) {
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [draftSongIds, setDraftSongIds] = useState<string[] | null>(null)
  const [menuCategoryId, setMenuCategoryId] = useState<string | null>(null)
  const createRef = useRef<HTMLLabelElement | null>(null)

  const categoryFilters = useMemo(
    () => [
      ...lessonOptions
        .filter((lesson) => !hiddenCategoryIds.includes(lesson.id))
        .map((lesson) => ({ ...lesson, source: 'lesson' as const })),
      ...userCategories.map((category) => ({ ...category, source: 'custom' as const })),
    ],
    [hiddenCategoryIds, userCategories],
  )

  const allEditableCategories = useMemo(
    () => [
      ...lessonOptions.map((lesson) => ({ ...lesson, source: 'lesson' as const })),
      ...userCategories.map((category) => ({ ...category, source: 'custom' as const })),
    ],
    [userCategories],
  )

  const editingCategory = allEditableCategories.find((category) => category.id === editingCategoryId) ?? null

  const initialSongIds = useMemo(() => {
    if (!editingCategoryId) {
      return []
    }

    return allSongs
      .filter((song) => {
        const assignedCategories = songCategories[song.id] ?? []
        const isManagedCategory = managedCategoryIds.includes(editingCategoryId)

        if (!isManagedCategory && lessonOptions.some((lesson) => lesson.id === editingCategoryId)) {
          return song.lessonId === editingCategoryId
        }

        return assignedCategories.includes(editingCategoryId)
      })
      .map((song) => song.id)
  }, [allSongs, editingCategoryId, managedCategoryIds, songCategories])

  const selectedModalSongIds = draftSongIds ?? initialSongIds

  const submitCategory = () => {
    const trimmedName = categoryName.trim()

    if (!trimmedName) {
      return
    }

    onCreateCategory(trimmedName)
    setCategoryName('')
    setCreatingCategory(false)
    setDraftSongIds(null)
  }

  const cancelCategoryCreate = () => {
    setCategoryName('')
    setCreatingCategory(false)
  }

  const openCategoryMenu = (event: MouseEvent, categoryId: string) => {
    event.preventDefault()
    setMenuCategoryId(categoryId)
  }

  const openEditorFromMenu = (categoryId: string) => {
    setMenuCategoryId(null)
    onOpenCategoryEditor(categoryId)
  }

  const deleteFromMenu = (categoryId: string) => {
    setMenuCategoryId(null)
    onDeleteCategory(categoryId)
  }

  const toggleDraftSong = (songId: string) => {
    setDraftSongIds((current) => {
      const nextSongIds = current ?? initialSongIds

      return nextSongIds.includes(songId)
        ? nextSongIds.filter((id) => id !== songId)
        : [...nextSongIds, songId]
    })
  }

  const closeEditor = () => {
    setDraftSongIds(null)
    onCloseCategoryEditor()
  }

  const saveEditor = () => {
    if (!editingCategoryId) {
      return
    }

    onSaveCategorySongs(editingCategoryId, selectedModalSongIds)
    setDraftSongIds(null)
  }

  return (
    <section className="panel library-panel app-library-panel">
      <div className="section-heading library-heading">
        <div>
          <p className="panel-label">Library</p>
          <h2>Tracks</h2>
        </div>
        <div className="filter-group library-filter-group">
          <button
            type="button"
            className={`filter-chip ${selectedFilterId === 'all' ? 'filter-chip-active' : ''}`}
            onClick={() => onFilterSelect('all')}
          >
            All
          </button>
          {categoryFilters.map((category) => (
            <span
              key={category.id}
              className="library-category-filter"
              onContextMenu={(event) => openCategoryMenu(event, category.id)}
            >
              <button
                type="button"
                className={`filter-chip ${selectedFilterId === category.id ? 'filter-chip-active' : ''}`}
                onClick={() => onFilterSelect(category.id)}
                onContextMenu={(event) => openCategoryMenu(event, category.id)}
              >
                {category.name}
              </button>
              {managedCategoryIds.includes(category.id) && <span className="category-managed-dot" aria-hidden="true" />}
              {menuCategoryId === category.id && (
                <div className="category-context-menu" role="menu">
                  <button type="button" onClick={() => openEditorFromMenu(category.id)} role="menuitem">
                    <Settings2 size={14} />
                    Manage songs
                  </button>
                  <button type="button" onClick={() => deleteFromMenu(category.id)} role="menuitem">
                    <Trash2 size={14} />
                    Delete category
                  </button>
                </div>
              )}
            </span>
          ))}
          {creatingCategory ? (
            <label
              ref={createRef}
              className="inline-category-create"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  cancelCategoryCreate()
                }
              }}
            >
              <input
                autoFocus
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitCategory()
                  }

                  if (event.key === 'Escape') {
                    cancelCategoryCreate()
                  }
                }}
                placeholder="New category"
              />
              <button type="button" onClick={submitCategory} aria-label="Create category">
                <Check size={14} />
              </button>
            </label>
          ) : (
            <button
              type="button"
              className="filter-chip add-category-chip"
              onClick={() => setCreatingCategory(true)}
              aria-label="Create category"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>

      {menuCategoryId && (
        <button
          type="button"
          className="context-menu-scrim"
          onClick={() => setMenuCategoryId(null)}
          aria-label="Close category menu"
        />
      )}

      <div className="library-table-header" aria-hidden="true">
        <span>Track</span>
        <span>Level</span>
        <span>Versions</span>
        <span>Category</span>
        <span>Save</span>
      </div>

      <div className="song-list compact-song-list">
        {queueSongs.length > 0 ? (
          queueSongs.map((song) => {
            const favorite = favoriteSongIdSet.has(song.id)
            const assignedCategoryIds = songCategories[song.id] ?? []
            const assignedCategories = allEditableCategories.filter((category) => {
              if (category.source === 'lesson' && !managedCategoryIds.includes(category.id)) {
                return song.lessonId === category.id
              }

              return assignedCategoryIds.includes(category.id)
            })

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
                <div className="song-category-tags">
                  {assignedCategories.length > 0 ? (
                    assignedCategories.map((category) => (
                      <span key={`${song.id}-${category.id}`} className="song-category-tag">
                        {category.name}
                      </span>
                    ))
                  ) : (
                    <small>No custom category</small>
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
            <small>Try clearing search or switching to another category.</small>
          </div>
        )}
      </div>

      {editingCategory && (
        <div className="modal-backdrop" role="presentation">
          <div className="category-modal" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
            <div className="category-modal-header">
              <div>
                <p className="panel-label">Category</p>
                <h3 id="category-modal-title">Add tracks to {editingCategory.name}</h3>
              </div>
              <button type="button" className="modal-close-button" onClick={closeEditor} aria-label="Close category editor">
                <X size={18} />
              </button>
            </div>
            <div className="category-song-picker">
              {allSongs.map((song) => {
                const checked = selectedModalSongIds.includes(song.id)

                return (
                  <button
                    key={song.id}
                    type="button"
                    className={`category-song-option ${checked ? 'category-song-option-active' : ''}`}
                    onClick={() => toggleDraftSong(song.id)}
                  >
                    <span className="category-song-check">{checked ? <Check size={15} /> : null}</span>
                    <span>
                      <strong>{song.title}</strong>
                      <small>{song.lessonName}</small>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="category-modal-actions">
              <span>{selectedModalSongIds.length} tracks selected</span>
              <div>
                <button type="button" className="ghost-button" onClick={closeEditor}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={saveEditor}>
                  Save category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
