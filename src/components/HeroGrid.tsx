import type { ActiveInput } from '../hooks/useBassTuner'

type HeroGridProps = {
  noteLabel: string
  frequencyLabel: string
  tuningTip: string
  perfectlyTuned: boolean
  targetString: string
  targetFrequencyLabel: string
  centsLabel: string
  trackCount: number
  backingReadyCount: number
  activeInput: ActiveInput | null
  deviceCount: number
  deviceHint: string
}

export function HeroGrid({
  noteLabel,
  frequencyLabel,
  tuningTip,
  perfectlyTuned,
  targetString,
  targetFrequencyLabel,
  centsLabel,
  trackCount,
  backingReadyCount,
  activeInput,
  deviceCount,
  deviceHint,
}: HeroGridProps) {
  return (
    <section className="hero-grid">
      <article className="hero-card hero-card-primary">
        <p className="panel-label">Live tuning</p>
        <strong>{noteLabel}</strong>
        <span>{frequencyLabel}</span>
        <small>{perfectlyTuned ? 'Locked at center' : tuningTip}</small>
      </article>
      <article className="hero-card">
        <p className="panel-label">Current target</p>
        <strong>{targetString}</strong>
        <span>{targetFrequencyLabel}</span>
        <small>{centsLabel}</small>
      </article>
      <article className="hero-card">
        <p className="panel-label">Practice library</p>
        <strong>{trackCount}</strong>
        <span>Total tracks</span>
        <small>{backingReadyCount} with backing versions</small>
      </article>
      <article className="hero-card">
        <p className="panel-label">Input path</p>
        <strong>{activeInput?.label ?? 'No active input'}</strong>
        <span>{deviceCount} devices detected</span>
        <small>{deviceHint}</small>
      </article>
    </section>
  )
}
