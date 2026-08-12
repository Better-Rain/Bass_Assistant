import { Activity, AudioLines, Guitar, Sparkles } from 'lucide-react'

import type { PitchSnapshot } from '../hooks/useBassTuner'
import { formatFrequency, formatNoteName, midiToFrequency, type TuningPreset } from '../lib/music'

const METER_RANGE_CENTS = 100
const METER_TICKS = [-100, -50, -20, 0, 20, 50, 100]

type TunerPanelProps = {
  snapshot: PitchSnapshot
  tuning: TuningPreset
  concertA: number
  signalPresent: boolean
  targetLocked: boolean
  targetString: string | null
  targetFrequency: number | null
  tuningCents: number
  needleOffset: string
  perfectlyTuned: boolean
  inTune: boolean
  signalLevel: number
  clarityPercent: number
}

export function TunerPanel({
  snapshot,
  tuning,
  concertA,
  signalPresent,
  targetString,
  targetLocked,
  targetFrequency,
  tuningCents,
  needleOffset,
  perfectlyTuned,
  inTune,
  signalLevel,
  clarityPercent,
}: TunerPanelProps) {
  const noteParts = formatNoteName(snapshot.note ?? targetString ?? tuning.strings[0].note)
  const displayNote = signalPresent ? noteParts.pitchClass : '--'
  const displayOctave = signalPresent ? noteParts.octave : ''
  const targetAvailable = targetString !== null && targetFrequency !== null
  const centered = targetAvailable && Math.abs(tuningCents) <= 0.5
  const centsClass = centered ? 'centered' : tuningCents > 0 ? 'sharp' : 'flat'
  const centsMessage = centered
    ? 'Centered'
    : `${Math.abs(tuningCents).toFixed(1)} cents ${tuningCents > 0 ? 'sharp' : 'flat'}`

  return (
    <section className="panel tuner-panel">
      <div className="section-heading">
        <div>
          <p className="panel-label">Tuner deck</p>
          <h2>Main Tuner</h2>
        </div>
        <div className="panel-meta">
          <span>
            {signalPresent ? formatFrequency(snapshot.detectedFrequency ?? 0) : 'No pitch yet'}
          </span>
          <span>
            {targetAvailable
              ? `${targetLocked ? 'Target' : 'Nearest'} ${formatFrequency(targetFrequency)}`
              : 'Awaiting note'}
          </span>
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
            {targetAvailable ? (
              <>
                {targetLocked ? 'Target' : 'Nearest'} <strong>{targetString}</strong> -{' '}
                {formatFrequency(targetFrequency)}
                {!targetLocked ? ' (locking...)' : ''}
              </>
            ) : (
              'Play one open string'
            )}
          </p>
        </div>

        <div className="meter-shell">
          <div className="meter-scale">
            {METER_TICKS.map((tick) => (
              <span
                key={tick}
                className={`meter-tick ${tick === 0 ? 'meter-tick-center' : ''}`}
                style={{ left: `${((tick + METER_RANGE_CENTS) / (METER_RANGE_CENTS * 2)) * 100}%` }}
              >
                <i />
                <small>{tick}</small>
              </span>
            ))}
            <div className={`tolerance-zone ${inTune ? 'tolerance-zone-hot' : ''}`} />
            <div
              className={`needle ${signalPresent && targetAvailable ? '' : 'needle-hidden'}`}
              style={{ left: needleOffset }}
            />
          </div>

          <div className="meter-readout">
            <span className={centsClass}>
              {signalPresent && targetAvailable
                ? centsMessage
                : 'Waiting for direct signal'}
            </span>
            <strong>
              {perfectlyTuned
                ? 'Perfect'
                : !targetLocked && signalPresent
                  ? `Finding ${targetString ?? 'string'}`
                  : inTune && signalPresent
                    ? 'Close enough'
                    : 'Adjust slowly'}
            </strong>
          </div>
        </div>
      </div>

      <div className="string-grid">
        {tuning.strings.map((item) => {
          const active = snapshot.stringMatch?.note === item.note
          const candidate = !targetLocked && targetString === item.note
          const itemCents = active ? Math.abs(snapshot.stringMatch?.cents ?? 999) : null
          const itemTuned = itemCents !== null && itemCents <= 7

          return (
            <div
              key={item.note}
              className={`string-card ${active ? 'string-card-active' : ''} ${candidate ? 'string-card-candidate' : ''} ${itemTuned ? 'string-card-tuned' : ''}`}
              aria-current={active ? 'true' : undefined}
            >
              <span>{item.label}</span>
              <strong>{item.note}</strong>
              <small>{formatFrequency(midiToFrequency(item.midi, concertA))}</small>
            </div>
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
