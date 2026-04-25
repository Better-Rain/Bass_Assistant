import { Maximize2, Minimize, X } from 'lucide-react'

const windowControls = [
  { id: 'minimize', label: 'Minimize', icon: Minimize },
  { id: 'maximize', label: 'Maximize', icon: Maximize2 },
  { id: 'close', label: 'Close', icon: X },
] as const

export function TitleBar() {
  const handleWindowControl = (action: (typeof windowControls)[number]['id']) => {
    window.redlineWindow?.[action]()
  }

  return (
    <div className="custom-titlebar">
      <div className="titlebar-drag-region" />
      <div className="titlebar-brand">
        <span className="titlebar-dot" />
        <strong>Redline Bass Tuner</strong>
      </div>
      <div className="titlebar-controls">
        {windowControls.map((control) => {
          const Icon = control.icon

          return (
            <button
              key={control.id}
              type="button"
              className={`window-control window-control-${control.id}`}
              onClick={() => handleWindowControl(control.id)}
              aria-label={control.label}
            >
              <Icon size={15} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
