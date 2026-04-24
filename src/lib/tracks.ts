export type TrackVariant = 'backing' | 'full' | 'workout'

type LessonSeed = {
  id: string
  name: string
  files: string[]
}

type RawTrack = {
  lessonId: string
  lessonName: string
  fileName: string
  filePath: string
}

export type SongTrack = {
  variant: TrackVariant
  label: string
  fileName: string
  filePath: string
}

export type LibrarySong = {
  id: string
  title: string
  lessonId: string
  lessonName: string
  level: string | null
  tags: string[]
  variants: Partial<Record<TrackVariant, SongTrack>>
  availableVariants: TrackVariant[]
}

const lessonSeeds: LessonSeed[] = [
  {
    id: 'lesson-01',
    name: '第一课',
    files: [
      'RGP G0 Coraline (bt).mp3',
      'RGP G0 Coraline (full).mp3',
      'RGP G0 Talking In My Sleep (bt).mp3',
      'RGP G0 Talking In My Sleep (full).mp3',
      'RGP G0 The Drifter (bt).mp3',
      'RGP G0 The Drifter (full).mp3',
      'RGP G1 Krauss Country (bt).mp3',
      'RGP G1 Krauss Country (full).mp3',
    ],
  },
  {
    id: 'lesson-02',
    name: '第二课',
    files: [
      '02-RGP_Bass2024_G1_ComeAsYouAre_(bass bt).mp3',
      '02-RGP_Bass2024_G1_ComeAsYouAre_(full).mp3',
      '04-RGP_Bass2024_G0_DieForYou_(bass bt).mp3',
      '04-RGP_Bass2024_G0_DieForYou_(full).mp3',
      '04-RGP_Bass2024_G1_BadHabits_(bass bt).mp3',
      '04-RGP_Bass2024_G1_BadHabits_(full).mp3',
    ],
  },
  {
    id: 'lesson-03',
    name: '第三课',
    files: [
      '03-RGP_Bass2024_G1_TheTracksOfMyTears_(bass bt).mp3',
      '03-RGP_Bass2024_G1_TheTracksOfMyTears_(full).mp3',
      'RGP G2 Danzon (bt).mp3',
      'RGP G2 Danzon (full).mp3',
    ],
  },
  {
    id: 'lesson-04',
    name: '第四课',
    files: [
      '01 - Workout #1.mp3',
      '03-RGP_Bass2024_G3_IsThisLove_(bass bt).mp3',
      '03-RGP_Bass2024_G3_IsThisLove_(full).mp3',
      'RGP G3 Maiden Voyage (bt).mp3',
      'RGP G3 Maiden Voyage (full).mp3',
    ],
  },
  {
    id: 'lesson-05',
    name: '第五课',
    files: [
      '01-RGP_Bass2024_G3_OnBroadway_(bass bt).mp3',
      '01-RGP_Bass2024_G3_OnBroadway_(full).mp3',
      '06-RGP_Bass2024_G3_FlyAway_(bass bt).mp3',
      '06-RGP_Bass2024_G3_FlyAway_(full).mp3',
      'RGP G3 Overrated (bt).mp3',
      'RGP G3 Overrated (full).mp3',
    ],
  },
]

const rawTracks: RawTrack[] = lessonSeeds.flatMap((lesson) =>
  lesson.files.map((fileName) => ({
    lessonId: lesson.id,
    lessonName: lesson.name,
    fileName,
    filePath: `/library/${lesson.id}/${fileName}`,
  })),
)

const titleCase = (input: string) =>
  input
    .split(' ')
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(' ')

const normalizeTitle = (fileName: string) => {
  let title = fileName.replace(/\.mp3$/i, '')

  title = title.replace(/^\d+\s*-\s*/i, '')
  title = title.replace(/^RGP_Bass2024_/i, '')
  title = title.replace(/^RGP\s+/i, '')
  title = title.replace(/^Bass2024_/i, '')
  title = title.replace(/\bG\d\b[_\s-]*/i, '')
  title = title.replace(/\((?:bass\s+bt|bt|full)\)/gi, '')
  title = title.replace(/_/g, ' ')
  title = title.replace(/([a-z])([A-Z])/g, '$1 $2')
  title = title.replace(/\s+/g, ' ').trim()

  if (/^Workout/i.test(title)) {
    return title
  }

  return titleCase(title)
}

const detectVariant = (fileName: string): TrackVariant => {
  if (/workout/i.test(fileName)) {
    return 'workout'
  }

  if (/(bass\s+bt|bt)/i.test(fileName)) {
    return 'backing'
  }

  return 'full'
}

const getTrackLabel = (variant: TrackVariant) => {
  switch (variant) {
    case 'backing':
      return '伴奏'
    case 'full':
      return '完整版'
    case 'workout':
      return '练习'
  }
}

const extractLevel = (fileName: string) => {
  const match = fileName.match(/(?:^|[_\s])G(\d)(?:[_\s]|$)/i)
  return match ? `G${match[1]}` : null
}

const toSongId = (lessonId: string, title: string) =>
  `${lessonId}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

const preferredVariantOrder: TrackVariant[] = ['backing', 'full', 'workout']

export const librarySongs: LibrarySong[] = rawTracks.reduce<LibrarySong[]>((songs, rawTrack) => {
  const title = normalizeTitle(rawTrack.fileName)
  const variant = detectVariant(rawTrack.fileName)
  const level = extractLevel(rawTrack.fileName)
  const songId = toSongId(rawTrack.lessonId, title)

  const existingSong = songs.find((song) => song.id === songId)
  const track: SongTrack = {
    variant,
    label: getTrackLabel(variant),
    fileName: rawTrack.fileName,
    filePath: rawTrack.filePath,
  }

  if (!existingSong) {
    const tags = [rawTrack.lessonName]

    if (level) {
      tags.push(level)
    }

    songs.push({
      id: songId,
      title,
      lessonId: rawTrack.lessonId,
      lessonName: rawTrack.lessonName,
      level,
      tags,
      variants: { [variant]: track },
      availableVariants: [variant],
    })

    return songs
  }

  existingSong.variants[variant] = track
  existingSong.availableVariants = preferredVariantOrder.filter(
    (candidate) => existingSong.variants[candidate],
  )

  if (!existingSong.level && level) {
    existingSong.level = level
    existingSong.tags = [...existingSong.tags, level]
  }

  return songs
}, [])

export const lessonOptions = lessonSeeds.map((lesson) => ({
  id: lesson.id,
  name: lesson.name,
}))

export const variantOptions: { id: TrackVariant; label: string }[] = [
  { id: 'backing', label: '伴奏' },
  { id: 'full', label: '完整版' },
  { id: 'workout', label: '练习' },
]

export const defaultVariantOrder = preferredVariantOrder
