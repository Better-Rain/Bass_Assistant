import { Volume2 } from 'lucide-react'

import type { TuningPreset } from '../lib/music'

type ReferencePanelProps = {
  tuning: TuningPreset
  activeReferenceNote: string
  referenceEnabled: boolean
  currentTip: string
  history: string[]
  onToggleReference: () => void
  onSelectReferenceNote: (note: string) => void
}

export function ReferencePanel({
  tuning,
  activeReferenceNote,
  referenceEnabled,
  currentTip,
  history,
  onToggleReference,
  onSelectReferenceNote,
}: ReferencePanelProps) {
  return (
    <section className="panel reference-panel">
      <div className="section-heading">
        <div>
          <p className="panel-label">Reference</p>
          <h2>Reference Tone</h2>
        </div>
        <button
          type="button"
          className={`icon-button ${referenceEnabled ? 'icon-button-live' : ''}`}
          onClick={onToggleReference}
        >
          <Volume2 size={16} />
          <span>{referenceEnabled ? 'Stop' : 'Play'}</span>
        </button>
      </div>

      <div className="reference-grid">
        {tuning.strings.map((item) => (
          <button
            key={item.note}
            type="button"
            className={`reference-pill ${item.note === activeReferenceNote ? 'reference-pill-active' : ''}`}
            onClick={() => onSelectReferenceNote(item.note)}
          >
            {item.note}
          </button>
        ))}
      </div>

      <div className="tip-box">
        <p>{currentTip}</p>
      </div>

      <div className="history-row">
        <span>Recent locks</span>
        <div>
          {history.length > 0 ? history.map((item, index) => <b key={`${item}-${index}`}>{item}</b>) : <b>--</b>}
        </div>
      </div>
    </section>
  )
}
