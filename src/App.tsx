import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AudioLines,
  CircleAlert,
  Gauge,
  Guitar,
  Mic,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from 'lucide-react'

import './App.css'
import { useBassTuner } from './hooks/useBassTuner'
import {
  clamp,
  formatFrequency,
  formatNoteName,
  midiToFrequency,
  tuningPresets,
  type TuningPreset,
} from './lib/music'

const DEFAULT_TUNING = tuningPresets[0].id
const DEFAULT_A4 = 440

const stopOscillator = (oscillator: OscillatorNode | null | undefined) => {
  if (!oscillator) {
    return
  }

  try {
    oscillator.stop()
  } catch {
    // Ignore repeated stop calls during rapid toggles.
  }
}

const getStoredNumber = (key: string, fallback: number) => {
  const value = Number(window.localStorage.getItem(key))
  return Number.isFinite(value) ? value : fallback
}

const getStoredString = (key: string, fallback: string) => window.localStorage.getItem(key) ?? fallback

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState(() =>
    getStoredString('bass-record.device', ''),
  )
  const [selectedTuningId, setSelectedTuningId] = useState(() =>
    getStoredString('bass-record.tuning', DEFAULT_TUNING),
  )
  const [concertA, setConcertA] = useState(() => getStoredNumber('bass-record.a4', DEFAULT_A4))
  const [referenceStringNote, setReferenceStringNote] = useState('E1')
  const [referenceEnabled, setReferenceEnabled] = useState(false)

  const referenceContextRef = useRef<AudioContext | null>(null)
  const referenceNodesRef = useRef<{
    primary: OscillatorNode
    octave: OscillatorNode
    output: GainNode
    tremolo: GainNode
  } | null>(null)

  const tuning = useMemo<TuningPreset>(
    () => tuningPresets.find((item) => item.id === selectedTuningId) ?? tuningPresets[0],
    [selectedTuningId],
  )
  const activeReferenceNote = tuning.strings.some((item) => item.note === referenceStringNote)
    ? referenceStringNote
    : tuning.strings[0].note

  const { activeInput, devices, error, history, inTune, restart, snapshot, status } = useBassTuner({
    selectedDeviceId,
    tuning,
    concertA,
  })

  const visibleDeviceId =
    devices.some((device) => device.deviceId === selectedDeviceId) ? selectedDeviceId : ''
  const noteParts = formatNoteName(snapshot.note ?? tuning.strings[0].note)
  const tuningCents = snapshot.stringMatch?.cents ?? snapshot.cents ?? 0
  const clampedCents = clamp(tuningCents, -50, 50)
  const needleOffset = `${clampedCents + 50}%`
  const signalPresent = snapshot.frequency !== null
  const signalLevel = Math.round(clamp(snapshot.level * 500, 0, 100))
  const clarityPercent = Math.round(snapshot.clarity * 100)
  const targetString = snapshot.stringMatch?.note ?? tuning.strings[0].note
  const targetFrequency = snapshot.stringMatch?.targetFrequency ?? midiToFrequency(tuning.strings[0].midi, concertA)
  const namedDevices = devices.filter((device) => !device.isAlias)
  const aliasOnly = devices.length > 0 && namedDevices.length === 0
  const perfectlyTuned = signalPresent && Math.abs(tuningCents) <= 2 && snapshot.clarity >= 0.95

  const currentTip = useMemo(() => {
    if (status === 'error') {
      return '浏览器没有拿到音频输入权限，请允许麦克风访问并重试。'
    }

    if (!signalPresent) {
      return '拨动单根空弦并保持 1 到 2 秒，让检测器稳定锁定基频。'
    }

    if (snapshot.level < 0.01) {
      return '输入偏弱。把 Scarlett Solo 的增益调到指示环轻微发绿，避免一直发红。'
    }

    if (snapshot.clarity < 0.94) {
      return '当前泛音偏多。试着在拾音器中间位置拨弦，或者放轻右手。'
    }

    if (perfectlyTuned) {
      return `${targetString} 已非常接近目标音高，可以切到下一根弦。`
    }

    return tuningCents > 0 ? '当前偏高，稍微放松弦钮。' : '当前偏低，慢慢收紧弦钮。'
  }, [perfectlyTuned, signalPresent, snapshot.clarity, snapshot.level, status, targetString, tuningCents])

  const deviceHint = useMemo(() => {
    if (error) {
      return error
    }

    if (activeInput && namedDevices.length <= 1) {
      return `当前浏览器实际使用的输入是：${activeInput.label}`
    }

    if (aliasOnly) {
      return '浏览器目前只暴露了默认输入别名。通常重新授权麦克风、关闭占用声卡的软件，或重开页面后会恢复完整列表。'
    }

    return '建议把贝斯接到 Scarlett Solo 的 INST 档，并关闭系统级自动增益、降噪与回声消除。'
  }, [activeInput, aliasOnly, error, namedDevices.length])

  useEffect(() => {
    window.localStorage.setItem('bass-record.device', selectedDeviceId)
  }, [selectedDeviceId])

  useEffect(() => {
    window.localStorage.setItem('bass-record.tuning', selectedTuningId)
  }, [selectedTuningId])

  useEffect(() => {
    window.localStorage.setItem('bass-record.a4', String(concertA))
  }, [concertA])

  useEffect(() => {
    if (!referenceEnabled) {
      const nodes = referenceNodesRef.current
      const audioContext = referenceContextRef.current

      nodes?.output.gain.cancelScheduledValues(audioContext?.currentTime ?? 0)
      nodes?.output.gain.setTargetAtTime(0, audioContext?.currentTime ?? 0, 0.05)

      window.setTimeout(() => {
        stopOscillator(nodes?.primary)
        stopOscillator(nodes?.octave)
        if (referenceNodesRef.current === nodes) {
          referenceNodesRef.current = null
        }
      }, 160)

      return
    }

    const audioContext =
      referenceContextRef.current ?? new AudioContext({ latencyHint: 'interactive' })
    referenceContextRef.current = audioContext

    const output = audioContext.createGain()
    const tremolo = audioContext.createGain()
    const primary = audioContext.createOscillator()
    const octave = audioContext.createOscillator()

    const frequency = midiToFrequency(
      tuning.strings.find((item) => item.note === activeReferenceNote)?.midi ?? tuning.strings[0].midi,
      concertA,
    )

    primary.type = 'triangle'
    primary.frequency.value = frequency
    octave.type = 'sine'
    octave.frequency.value = frequency * 2

    tremolo.gain.value = 0.72
    output.gain.value = 0

    primary.connect(tremolo)
    octave.connect(tremolo)
    tremolo.connect(output)
    output.connect(audioContext.destination)

    primary.start()
    octave.start()

    output.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 0.08)
    referenceNodesRef.current = { primary, octave, output, tremolo }

    return () => {
      output.gain.cancelScheduledValues(audioContext.currentTime)
      output.gain.setTargetAtTime(0, audioContext.currentTime, 0.05)
      window.setTimeout(() => {
        stopOscillator(primary)
        stopOscillator(octave)
      }, 180)
    }
  }, [activeReferenceNote, concertA, referenceEnabled, tuning])

  useEffect(() => {
    return () => {
      stopOscillator(referenceNodesRef.current?.primary)
      stopOscillator(referenceNodesRef.current?.octave)
      referenceContextRef.current?.close().catch(() => undefined)
    }
  }, [])

  return (
    <div className="app-shell">
      <div className="noise-overlay" />

      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Scarlett-inspired bass workstation</p>
          <h1>Redline Bass Tuner</h1>
          <p className="hero-text">
            面向电贝斯直插接口的实时调音器，专门针对低频响应和 Scarlett Solo 这类声卡的使用场景做了优化。
          </p>
        </div>

        <div className="hero-status">
          <div className={`status-chip status-${status}`}>
            <Radio size={16} />
            <span>
              {status === 'running' && 'Input armed'}
              {status === 'requesting' && 'Waiting permission'}
              {status === 'idle' && 'Standby'}
              {status === 'error' && 'Input error'}
            </span>
          </div>

          <div className={`status-chip ${perfectlyTuned ? 'status-tuned' : 'status-live'}`}>
            <Gauge size={16} />
            <span>{perfectlyTuned ? 'Perfectly tuned' : 'Tracking pitch'}</span>
          </div>
        </div>
      </header>

      <main className="main-grid">
        <section className="panel tuner-panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Main tuner</p>
              <h2>实时音高</h2>
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
                <span>已校准</span>
              </div>
            )}

            <div className="note-lockup">
              <span className="note-name">{noteParts.pitchClass}</span>
              <span className="note-octave">{noteParts.octave}</span>
              <p className="note-subtitle">
                当前匹配弦 <strong>{targetString}</strong> · 目标频率 {formatFrequency(targetFrequency)}
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
                  onClick={() => {
                    setReferenceStringNote(item.note)
                    setReferenceEnabled(true)
                  }}
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

        <aside className="control-stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Input path</p>
                <h2>设备与校准</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => void restart()}>
                <RefreshCw size={16} />
                <span>重新连接</span>
              </button>
            </div>

            <label className="field">
              <span>Audio input</span>
              <select
                value={visibleDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
              >
                <option value="">默认输入设备</option>
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="device-summary">
              <div className="device-badge">
                <Mic size={16} />
                <span>已发现 {devices.length} 个输入条目</span>
              </div>
              {activeInput ? (
                <p className="device-active">当前活跃输入：{activeInput.label}</p>
              ) : (
                <p className="device-active">当前活跃输入：等待浏览器建立音频流</p>
              )}
            </div>

            <label className="field">
              <span>Concert A</span>
              <div className="slider-row">
                <input
                  type="range"
                  min="430"
                  max="450"
                  step="1"
                  value={concertA}
                  onChange={(event) => setConcertA(Number(event.target.value))}
                />
                <strong>{concertA} Hz</strong>
              </div>
              <small className="field-help">
                这是音高体系的参考基准。标准值是 A4 = 440 Hz；如果你要跟随钢琴、旧乐队录音或其他非标准参考音，可以在这里微调。
              </small>
            </label>

            <div className={`callout ${error ? 'error-callout' : ''}`}>
              {error ? <CircleAlert size={18} /> : <SlidersHorizontal size={18} />}
              <p>{deviceHint}</p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Tuning library</p>
                <h2>调弦预设</h2>
              </div>
            </div>

            <div className="preset-grid">
              {tuningPresets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`preset-card ${item.id === tuning.id ? 'preset-card-active' : ''}`}
                  onClick={() => setSelectedTuningId(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.subtitle}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Reference tone</p>
                <h2>参考音</h2>
              </div>
              <button
                type="button"
                className={`icon-button ${referenceEnabled ? 'icon-button-live' : ''}`}
                onClick={() => setReferenceEnabled((current) => !current)}
              >
                <Volume2 size={16} />
                <span>{referenceEnabled ? '停止' : '播放'}</span>
              </button>
            </div>

            <div className="reference-grid">
              {tuning.strings.map((item) => (
                <button
                  key={item.note}
                  type="button"
                  className={`reference-pill ${item.note === activeReferenceNote ? 'reference-pill-active' : ''}`}
                  onClick={() => {
                    setReferenceStringNote(item.note)
                    setReferenceEnabled(true)
                  }}
                >
                  {item.note}
                </button>
              ))}
            </div>

            <p className="secondary-copy">
              参考音会同时输出基频与高八度，让耳机和小音箱上更容易辨认。
            </p>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Assistant</p>
                <h2>演奏辅助</h2>
              </div>
            </div>

            <div className="tip-box">
              <p>{currentTip}</p>
            </div>

            <div className="history-row">
              <span>Recent locks</span>
              <div>
                {history.length > 0 ? (
                  history.map((item, index) => <b key={`${item}-${index}`}>{item}</b>)
                ) : (
                  <b>--</b>
                )}
              </div>
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
