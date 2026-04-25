import { CircleAlert, RefreshCw, SlidersHorizontal } from 'lucide-react'

import type { DeviceOption } from '../hooks/useBassTuner'
import { tuningPresets, type TuningPreset } from '../lib/music'

type RigPanelProps = {
  visibleDeviceId: string
  devices: DeviceOption[]
  concertA: number
  tuning: TuningPreset
  error: string | null
  deviceHint: string
  onDeviceChange: (deviceId: string) => void
  onConcertAChange: (value: number) => void
  onTuningChange: (tuningId: string) => void
  onRestart: () => void
}

export function RigPanel({
  visibleDeviceId,
  devices,
  concertA,
  tuning,
  error,
  deviceHint,
  onDeviceChange,
  onConcertAChange,
  onTuningChange,
  onRestart,
}: RigPanelProps) {
  return (
    <section className="panel rig-panel">
      <div className="section-heading">
        <div>
          <p className="panel-label">Controls</p>
          <h2>Rig</h2>
        </div>
        <button type="button" className="icon-button" onClick={onRestart}>
          <RefreshCw size={16} />
          <span>Reconnect</span>
        </button>
      </div>

      <label className="field">
        <span>Audio input</span>
        <select value={visibleDeviceId} onChange={(event) => onDeviceChange(event.target.value)}>
          <option value="">Default input</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Concert A</span>
        <div className="slider-row">
          <input
            type="range"
            min="430"
            max="450"
            step="1"
            value={concertA}
            onChange={(event) => onConcertAChange(Number(event.target.value))}
          />
          <strong>{concertA} Hz</strong>
        </div>
      </label>

      <div className="preset-grid">
        {tuningPresets.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`preset-card ${item.id === tuning.id ? 'preset-card-active' : ''}`}
            onClick={() => onTuningChange(item.id)}
          >
            <strong>{item.name}</strong>
            <span>{item.subtitle}</span>
          </button>
        ))}
      </div>

      <div className={`callout ${error ? 'error-callout' : ''}`}>
        {error ? <CircleAlert size={18} /> : <SlidersHorizontal size={18} />}
        <p>{deviceHint}</p>
      </div>
    </section>
  )
}
