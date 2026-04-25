import { sectionItems, type AppSection } from '../app/types'

type SidebarStat = {
  label: string
  value: string
  detail: string
}

type SidebarProps = {
  activeSection: AppSection
  onSectionChange: (section: AppSection) => void
  quickStats: SidebarStat[]
}

export function Sidebar({ activeSection, onSectionChange, quickStats }: SidebarProps) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">R</div>
        <div>
          <strong>Redline Bass</strong>
          <span>Scarlett practice desk</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {sectionItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-link ${activeSection === item.id ? 'sidebar-link-active' : ''}`}
            onClick={() => onSectionChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <p className="panel-label">Quick Stats</p>
        {quickStats.map((stat) => (
          <article key={stat.label} className="sidebar-stat">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </article>
        ))}
      </div>
    </aside>
  )
}
