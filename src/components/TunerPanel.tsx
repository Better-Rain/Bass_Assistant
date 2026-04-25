import { Activity, AudioLines, Guitar, Sparkles } from 'lucide-react'

import type { PitchSnapshot } from '../hooks/useBassTuner'
import { formatFrequency, formatNoteName, midiToFrequency, type TuningPreset } from '../lib/music'

type TunerPanelProps = {
  snapshot: PitchSnapshot
  tuning: TuningPreset
  concertA: number
  signalPresent: boolean
  targetString: string
  targetFrequency: number
  tuningCents: number
  needleOffset: string
  perfectlyTuned: boolean
  inTune: boolean
  signalLevel: number
  clarityPercent: number
  onReferenceString: (note: string) => void
}

export function TunerPanel({
  snapshot,
  tuning,
  concertA,
  signalPresent,
  targetString,
  targetFrequency,
  tuningCents,
  needleOffset,
  perfectlyTuned,
  inTune,
  signalLevel,
  clarityPercent,
  onReferenceString,
}: TunerPanelProps) {
  const noteParts = formatNoteName(snapshot.note ?? tuning.strings[0].note)
  const displayNote = signalPresent ? noteParts.pitchClass : '--'
  const displayOctave = signalPresent ? noteParts.octave : ''

  return (
    <section className="panel tuner-panel">
      <div className="section-heading">
        <div>
          <p className="panel-label">Tuner deck</p>
          <h2>Main Tuner</h2>
        </div>
        <div className="panel-meta">
          <span>{signalPresent ? formatFrequency(snapshot.frequency ?? 0) : 'No pitch yet'}</span>
          <span>{signalPresent ? `Target ${formatFrequency(targetFrequency)}` : 'Awaiting note'}</span>
        </div>
      </div>

      <div className={`tuner-stage ${perfectlyTuned ? 'tuner-stage-tuned' : ''}`}>
        {perfectlyTuned && (
          <div className="tune-badge">
            <Sparkles size={16} />
            <span>In tune</span>
          </div>
        )}

        <div className="note-lockup">
          <span className="note-name">{displayNote}</span>
          {displayOctave ? <span className="note-octave">{displayOctave}</span> : null}
          <p className="note-subtitle">
            Target <strong>{targetString}</strong> - {formatFrequency(targetFrequency)}
          </p>
        </div>

        <div className="meter-shell">
          <div className="meter-scale">
            {[-50, -30, -10, 0, 10, 30, 50].map((tick) => (
              <span
                key={tick}
                className={`meter-tick ${tick === 0 ? 'meter-tick-center' : ''}`}
                style={{ left: `${tick + 50}%` }}
              >
                <i />
                <small>{tick}</small>
              </span>
            ))}
            <div className={`tolerance-zone ${inTune ? 'tolerance-zone-hot' : ''}`} />
            <div className="needle" style={{ left: needleOffset }} />
          </div>

          <div className="meter-readout">
            <span className={tuningCents > 0 ? 'sharp' : 'flat'}>
              {signalPresent
                ? `${Math.abs(tuningCents).toFixed(1)} cents ${tuningCents > 0 ? 'sharp' : 'flat'}`
                : 'Waiting for direct signal'}
            </span>
            <strong>{perfectlyTuned ? 'Perfect' : inTune && signalPresent ? 'Close enough' : 'Adjust slowly'}</strong>
          </div>
        </div>
      </div>

      <div className="string-grid">
        {tuning.strings.map((item) => {
          const active = snapshot.stringMatch?.note === item.note
          const itemCents = active ? Math.abs(snapshot.stringMatch?.cents ?? 999) : null
          const itemTuned = itemCents !== null && itemCents <= 5

          return (
            <button
              key={item.note}
              type="button"
              className={`string-card ${active ? 'string-card-active' : ''} ${itemTuned ? 'string-card-tuned' : ''}`}
              onClick={() => onReferenceString(item.note)}
            >
              <span>{item.label}</span>
              <strong>{item.note}</strong>
              <small>{formatFrequency(midiToFrequency(item.midi, concertA))}</small>
            </button>
          )
        })}
      </div>

      <div className="insight-strip">
        <article className="mini-stat">
          <AudioLines size={18} />
          <div>
            <span>Signal</span>
            <strong>{signalLevel}%</strong>
          </div>
        </article>
        <article className="mini-stat">
          <Activity size={18} />
          <div>
            <span>Clarity</span>
            <strong>{clarityPercent}%</strong>
          </div>
        </article>
        <article className="mini-stat">
          <Guitar size={18} />
          <div>
            <span>Preset</span>
            <strong>{tuning.subtitle}</strong>
          </div>
        </article>
      </div>
    </section>
  )
}
