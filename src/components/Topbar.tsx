import { Gauge, Radio, Search } from 'lucide-react'

type TopbarProps = {
  sectionTitle: string
  searchQuery: string
  status: 'idle' | 'requesting' | 'running' | 'error'
  perfectlyTuned: boolean
  onSearchChange: (value: string) => void
}

export function Topbar({
  sectionTitle,
  searchQuery,
  status,
  perfectlyTuned,
  onSearchChange,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span>Workspace</span>
        <strong>{sectionTitle}</strong>
      </div>

      <label className="topbar-search">
        <Search size={18} />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search tracks, lessons, levels"
        />
      </label>

      <div className="topbar-actions">
        <div className={`status-chip status-${status}`}>
          <Radio size={16} />
          <span>
            {status === 'running'
              ? 'Input armed'
              : status === 'requesting'
                ? 'Waiting permission'
                : status === 'error'
                  ? 'Input error'
                  : 'Standby'}
          </span>
        </div>
        <div className={`status-chip ${perfectlyTuned ? 'status-tuned' : 'status-live'}`}>
          <Gauge size={16} />
          <span>{perfectlyTuned ? 'Perfectly tuned' : 'Tracking pitch'}</span>
        </div>
      </div>
    </header>
  )
}
