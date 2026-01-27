
import { useEffect, useMemo, useState } from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useMatch,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api/v1'
const API_ORIGIN = API_BASE.replace(/\/api\/v1$/, '')

type Project = {
  id: string
  name: string
  created_at: string
}

type License = {
  license_id: string
  project_id: string
  plan: string
  max_activations: number
  revoked: boolean
  duration_days?: number
  notes?: string
  bulk_created?: boolean
  expires_at?: string
  created_at: string
}

type Release = {
  id: string
  version: string
  channel?: string
  status: string
  notes?: string
  published_at?: string
  asset?: {
    id: string
    filename: string
    size_bytes: number
    sha256: string
    download_url: string
  }
}

type Activation = {
  activation_id: string
  device_id_hash: string
  hostname_masked?: string
  revoked: boolean
  created_at: string
  last_seen_at?: string
}

type Plan = {
  id: string
  name: string
  allowed_channels: string[]
  max_activations_default: number
  grace_period_days: number
  duration_days_default?: number
}

type UserProfile = {
  id: string
  email: string
  name: string
  role: string
}

type ProjectNavContext = {
  licenseCount: number
  activationCount: number
  releaseCount: number
}

type SmtpSettings = {
  host: string
  port: number
  username: string
  from_email: string
  from_name?: string
  secure: boolean
  has_password: boolean
  verified: boolean
  verified_at?: string
}

type BulkCreateLicenseItem = {
  email: string
  license_id: string
  license_key: string
}

type BulkCreateLicenseError = {
  email: string
  error: string
  license_id?: string
  license_key?: string
}

type BulkCreateLicensesResponse = {
  created: BulkCreateLicenseItem[]
  failed: BulkCreateLicenseError[]
}

type ProjectModule = {
  id: string
  key: string
  name: string
  description?: string
  params?: Record<string, string>
  created_at: string
}

type ActivationModuleItem = {
  module_id: string
  key: string
  name: string
  enabled: boolean
  force_activation?: boolean
  force_deactivation?: boolean
  params?: Record<string, string>
}

type LicenseModuleItem = {
  module_id: string
  key: string
  name: string
  enabled: boolean
  force_activation?: boolean
  force_deactivation?: boolean
  params?: Record<string, string>
}

type ProjectOverviewStats = {
  licenses: {
    total: number
    active: number
    revoked: number
    expired: number
    avg_usage_percent: number
  }
  releases: {
    total: number
    published: number
    draft: number
    deprecated: number
    latest_version?: string
    latest_channel?: string
    latest_published_at?: string
  }
  modules: {
    total: number
    active_in_licenses: number
    forced_on: number
    forced_off: number
    used_in_activations: number
  }
  activations: {
    total: number
  }
}

const STORAGE_KEY = 'alure_auth'
const TOKEN_KEY = 'alure_token'
const SESSION_EXPIRED_KEY = 'alure_session_expired'
const DASHBOARD_VERSION = '0.0.0'
const FAVORITES_KEY = 'alure_favorite_projects'

const readFavorites = (): string[] => {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

const writeFavorites = (ids: string[]) => {
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids))
  window.dispatchEvent(new CustomEvent('alure:favorites-updated'))
}

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const token = window.localStorage.getItem(TOKEN_KEY)
  const headers = {
    ...(options?.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await fetch(url, { ...options, headers })
  if (!res.ok) {
    if (res.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY)
      window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.setItem(SESSION_EXPIRED_KEY, 'true')
      window.dispatchEvent(new CustomEvent('alure:unauthorized'))
    }
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

const downloadWithAuth = async (downloadUrl: string): Promise<void> => {
  const token = window.localStorage.getItem(TOKEN_KEY)
  const url = downloadUrl.startsWith('http') ? downloadUrl : `${API_ORIGIN}${downloadUrl}`
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename="?([^"]+)"?$/i)
  const filename = match?.[1] ?? 'download'
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(blobUrl)
}

function LoginGate({ children }: { children: React.ReactNode }) {
  const [isAuthed, setIsAuthed] = useState<boolean>(() => {
    return window.localStorage.getItem(TOKEN_KEY) != null
  })
  const [bootstrapChecked, setBootstrapChecked] = useState(false)
  const [hasAdmin, setHasAdmin] = useState(true)
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline'>('offline')
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState<boolean>(() => {
    return window.localStorage.getItem(SESSION_EXPIRED_KEY) === 'true'
  })
  const [bootstrapName, setBootstrapName] = useState('')
  const [bootstrapEmail, setBootstrapEmail] = useState('')
  const [bootstrapPass, setBootstrapPass] = useState('')
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  useEffect(() => {
    const checkBootstrap = async () => {
      try {
        const data = await fetchJson<{ has_admin: boolean }>(`${API_BASE}/auth/bootstrap`)
        setHasAdmin(data.has_admin)
        setBackendStatus('online')
      } catch {
        setHasAdmin(true)
        setBackendStatus('offline')
      } finally {
        setBootstrapChecked(true)
      }
    }
    void checkBootstrap()
  }, [])

  useEffect(() => {
    if (!isAuthed) return
    let mounted = true
    const checkHealth = async () => {
      try {
        await fetchJson<{ has_admin: boolean }>(`${API_BASE}/auth/bootstrap`)
        if (mounted) setBackendStatus('online')
      } catch {
        if (mounted) setBackendStatus('offline')
      }
    }
    void checkHealth()
    const timer = window.setInterval(checkHealth, 20000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [isAuthed])

  useEffect(() => {
    if (!isAuthed) return
    const handleUnauthorized = () => {
      if (isAuthed) {
        window.localStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem(STORAGE_KEY)
        setIsAuthed(false)
      }
    }
    window.addEventListener('alure:unauthorized', handleUnauthorized)
    return () => {
      window.removeEventListener('alure:unauthorized', handleUnauthorized)
    }
  }, [isAuthed])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!loginUser || !loginPass) {
      setLoginError('Enter username and password.')
      return
    }
    setLoginError(null)
    try {
      const response = await fetchJson<{ token: string }>(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginUser, password: loginPass }),
      })
      window.localStorage.setItem(TOKEN_KEY, response.token)
      window.localStorage.setItem(STORAGE_KEY, 'true')
      window.localStorage.removeItem(SESSION_EXPIRED_KEY)
      setSessionExpired(false)
      setIsAuthed(true)
    } catch {
      setLoginError('Invalid credentials.')
    }
  }

  const handleBootstrap = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!bootstrapEmail || !bootstrapPass) {
      setBootstrapError('Enter email and password.')
      return
    }
    setBootstrapError(null)
    try {
      const response = await fetchJson<{ token: string }>(`${API_BASE}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bootstrapName.trim() || undefined,
          email: bootstrapEmail,
          password: bootstrapPass,
        }),
      })
      window.localStorage.setItem(TOKEN_KEY, response.token)
      window.localStorage.setItem(STORAGE_KEY, 'true')
      window.localStorage.removeItem(SESSION_EXPIRED_KEY)
      setSessionExpired(false)
      setIsAuthed(true)
    } catch {
      setBootstrapError('Unable to create admin user.')
    }
  }

  const handleLogout = () => {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(STORAGE_KEY)
    setIsAuthed(false)
  }

  if (!isAuthed) {
    if (!bootstrapChecked) {
      return (
        <div className="login">
          <div className="login-panel">
            <div className="login-header">
              <div className="brand-line">
                <img src="/ICON.png" alt="Alure" className="brand-logo" />
                <span className="brand-mark">Alure</span>
              </div>
              <p>Checking server status...</p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="login">
        <div className="login-panel first-account">
          {!hasAdmin && (
            <div className="confetti" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, index) => (
                <span key={`confetti-${index}`} />
              ))}
            </div>
          )}
          <div className="login-header">
            <div className="brand-line">
              <img src="/ICON.png" alt="Alure" className="brand-logo" />
              <span className="brand-mark">Alure</span>
            </div>
            <p>{hasAdmin ? 'Self-hosted licensing console' : 'Welcome! Set up your first admin account.'}</p>
          </div>
          <div className="login-status">
            <span className="status-line">
              <span className={`status-dot ${backendStatus === 'online' ? 'ok' : 'offline'}`} />
              <span className={`status ${backendStatus}`}>{backendStatus === 'online' ? 'API Online' : 'API Offline'}</span>
            </span>
          </div>
          {hasAdmin ? (
            <form className="login-form" onSubmit={handleLogin}>
              {sessionExpired && (
                <div className="notice">Session expired. Please sign in again.</div>
              )}
              <label className="field">
                <span>Email</span>
                <input
                  type="text"
                  value={loginUser}
                  onChange={(event) => setLoginUser(event.target.value)}
                  placeholder="admin@example.com"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(event) => setLoginPass(event.target.value)}
                  placeholder="password"
                />
              </label>
              {loginError && <div className="error">{loginError}</div>}
              <button className="primary" type="submit">
                Sign in
              </button>
            </form>
          ) : (
            <form className="login-form first-account-form" onSubmit={handleBootstrap}>
              {sessionExpired && (
                <div className="notice">Session expired. Please sign in again.</div>
              )}
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  value={bootstrapName}
                  onChange={(event) => setBootstrapName(event.target.value)}
                  placeholder="Admin"
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="text"
                  value={bootstrapEmail}
                  onChange={(event) => setBootstrapEmail(event.target.value)}
                  placeholder="admin@example.com"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={bootstrapPass}
                  onChange={(event) => setBootstrapPass(event.target.value)}
                  placeholder="password"
                />
              </label>
              {bootstrapError && <div className="error">{bootstrapError}</div>}
              <button className="primary" type="submit">
                Create admin
              </button>
            </form>
          )}
          <div className="login-note">
            {hasAdmin
              ? 'Sign in with your admin credentials.'
              : 'First run: create the initial administrator.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <AppShell backendStatus={backendStatus} onLogout={handleLogout}>
      {children}
    </AppShell>
  )
}

function InviteAccept() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleAccept = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) {
      setError('Invite token is missing.')
      return
    }
    if (!password.trim() || password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    try {
      await fetchJson<{ accepted: boolean }>(`${API_BASE}/auth/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      setMessage('Invite accepted. You can sign in now.')
      setTimeout(() => navigate('/'), 1200)
    } catch (err) {
      if (err instanceof Error) {
        setError(`Unable to accept invite (${err.message}).`)
        return
      }
      setError('Unable to accept invite.')
    }
  }

  return (
    <div className="login">
      <div className="login-panel">
        <div className="login-header">
          <div className="brand-line">
            <img src="/ICON.png" alt="Alure" className="brand-logo" />
            <span className="brand-mark">Alure</span>
          </div>
          <p>Accept your invite and set a password.</p>
        </div>
        <form className="login-form" onSubmit={handleAccept}>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Choose a password"
            />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
            />
          </label>
          {error && <div className="error">{error}</div>}
          {message && <div className="notice">{message}</div>}
          <button className="primary" type="submit" disabled={!token}>
            Accept invite
          </button>
        </form>
      </div>
    </div>
  )
}

function AppShell({
  children,
  backendStatus,
  onLogout,
}: {
  children: React.ReactNode
  backendStatus: 'online' | 'offline'
  onLogout: () => void
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [favoriteProjectIds, setFavoriteProjectIds] = useState<string[]>(() => readFavorites())
  const navigate = useNavigate()
  const match = useMatch('/projects/:projectId/*')
  const settingsMatch = useMatch('/settings')
  const location = useLocation()
  const activeProjectId = match?.params.projectId ?? null
  const isSettings = Boolean(settingsMatch)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const settingsHash = location.hash || '#plans'

  const loadProjects = async () => {
    const data = await fetchJson<Project[]>(`${API_BASE}/projects`)
    setProjects(data)
    const existingIds = new Set(data.map((project) => project.id))
    const nextFavorites = favoriteProjectIds.filter((id) => existingIds.has(id))
    if (nextFavorites.length !== favoriteProjectIds.length) {
      setFavoriteProjectIds(nextFavorites)
      writeFavorites(nextFavorites)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  useEffect(() => {
    const handleProjectsUpdated = () => {
      void loadProjects()
    }
    const handleFavoritesUpdated = () => {
      setFavoriteProjectIds(readFavorites())
    }
    window.addEventListener('alure:projects-updated', handleProjectsUpdated)
    window.addEventListener('alure:favorites-updated', handleFavoritesUpdated)
    return () => {
      window.removeEventListener('alure:projects-updated', handleProjectsUpdated)
      window.removeEventListener('alure:favorites-updated', handleFavoritesUpdated)
    }
  }, [])

  const favoriteProjects = useMemo(
    () =>
      projects
        .filter((project) => favoriteProjectIds.includes(project.id))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [projects, favoriteProjectIds],
  )

  const handleSelectProject = (projectId: string) => {
    navigate(`/projects/${projectId}`)
    setSidebarOpen(false)
  }

  const handleToggleFavorite = (projectId: string) => {
    const next = favoriteProjectIds.includes(projectId)
      ? favoriteProjectIds.filter((id) => id !== projectId)
      : [...favoriteProjectIds, projectId]
    setFavoriteProjectIds(next)
    writeFavorites(next)
  }

  const handleProjectKey = (event: React.KeyboardEvent, projectId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelectProject(projectId)
    }
  }

  return (
    <div className={`app-shell ${isSettings ? 'settings-shell' : ''}`}>
      {sidebarOpen && (
        <button
          className="app-backdrop"
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-row">
            <div className="brand-line">
              <img src="/ICON.png" alt="Alure" className="brand-logo" />
              <span className="brand-mark">Alure</span>
            </div>
            <div className="sidebar-actions">
              <span className="status-indicator">
                <span className={`status-dot ${backendStatus === 'online' ? 'ok' : 'offline'}`} />
                <span>{backendStatus === 'online' ? 'API Online' : 'API Offline'}</span>
              </span>
              <button className="icon-button" onClick={onLogout} aria-label="Sign out">
                <i className="fa-solid fa-right-from-bracket" />
              </button>
            </div>
          </div>
          <span className="brand-subtitle">Licensing and Releases</span>
        </div>
        <nav className="app-nav">
          <NavLink to="/" end onClick={() => setSidebarOpen(false)}>
            <i className="fa-solid fa-briefcase" aria-hidden="true" />
            Projects
          </NavLink>
          <NavLink to="/settings#plans" onClick={() => setSidebarOpen(false)}>
            <i className="fa-solid fa-gear" aria-hidden="true" />
            Settings
          </NavLink>
        </nav>
        {isSettings ? (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Settings</div>
            <nav className="sidebar-subnav">
              <Link
                to="/settings#user-profile"
                className={`project-row ${settingsHash === '#user-profile' ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <div className="project-row-main">
                  <span className="project-row-name">User info</span>
                  <span className="muted">Profile and credentials</span>
                </div>
                <span className="project-row-icon" aria-hidden="true">
                  <i className="fa-solid fa-user" />
                </span>
              </Link>
              <Link
                to="/settings#plans"
                className={`project-row ${settingsHash === '#plans' ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <div className="project-row-main">
                  <span className="project-row-name">Plans</span>
                  <span className="muted">Licensing tiers</span>
                </div>
                <span className="project-row-icon" aria-hidden="true">
                  <i className="fa-solid fa-layer-group" />
                </span>
              </Link>
              <Link
                to="/settings#smtp"
                className={`project-row ${settingsHash === '#smtp' ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <div className="project-row-main">
                  <span className="project-row-name">SMTP</span>
                  <span className="muted">Email delivery</span>
                </div>
                <span className="project-row-icon" aria-hidden="true">
                  <i className="fa-solid fa-envelope" />
                </span>
              </Link>
            </nav>
          </div>
        ) : (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Projects</div>
            <div className="project-list">
              {favoriteProjects.map((project) => (
                <div
                  key={project.id}
                  className={`project-row project-row-clickable ${activeProjectId === project.id ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectProject(project.id)}
                  onKeyDown={(event) => handleProjectKey(event, project.id)}
                >
                  <div className="project-row-main">
                    <span className="project-row-icon" aria-hidden="true">
                      <i className="fa-solid fa-cube" />
                    </span>
                    <div>
                      <span className="project-row-name">{project.name}</span>
                      <span className="muted">Created {new Date(project.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="project-row-actions">
                    <button
                      type="button"
                      className={`icon-button ${favoriteProjectIds.includes(project.id) ? 'active' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleToggleFavorite(project.id)
                      }}
                      aria-label="Toggle favorite"
                    >
                      <i className={favoriteProjectIds.includes(project.id) ? 'fa-solid fa-star' : 'fa-regular fa-star'} />
                    </button>
                    <span className="project-row-id">{project.id.slice(0, 8)}...</span>
                  </div>
                </div>
              ))}
              {favoriteProjects.length === 0 && (
                <div className="empty">Star a project in the Projects page to pin it here.</div>
              )}
            </div>
          </div>
        )}
        <div className="sidebar-footer">
          <span>Dashboard v{DASHBOARD_VERSION} - Creato internamente con AI</span>
        </div>
      </aside>
      <main className="app-main">
        <div className="app-mobile-header">
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
          <div>
            <span className="sidebar-title">Navigation</span>
            <h2>{activeProject?.name ?? 'Dashboard'}</h2>
            {activeProjectId && <span className="muted">ID: {activeProjectId}</span>}
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}

function ProjectsHome() {
  const [projects, setProjects] = useState<Project[]>([])
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites())
  const [error, setError] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectQuery, setProjectQuery] = useState('')
  const [projectSort, setProjectSort] = useState<'name_asc' | 'name_desc' | 'created_desc' | 'created_asc'>('created_desc')
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const navigate = useNavigate()

  const loadProjects = async () => {
    try {
      const data = await fetchJson<Project[]>(`${API_BASE}/projects`)
      setProjects(data)
      const existingIds = new Set(data.map((project) => project.id))
      const nextFavorites = favorites.filter((id) => existingIds.has(id))
      if (nextFavorites.length !== favorites.length) {
        setFavorites(nextFavorites)
        writeFavorites(nextFavorites)
      }
    } catch {
      setError('Unable to load projects.')
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const toggleFavorite = (projectId: string) => {
    const next = favorites.includes(projectId)
      ? favorites.filter((id) => id !== projectId)
      : [...favorites, projectId]
    setFavorites(next)
    writeFavorites(next)
  }

  const handleDeleteProject = (project: Project) => {
    setDeleteTarget(project)
    setDeleteConfirm('')
    setDeleteError(null)
  }

  const closeDeleteModal = () => {
    setDeleteTarget(null)
    setDeleteConfirm('')
    setDeleteError(null)
  }

  const confirmDeleteProject = async () => {
    if (!deleteTarget) return
    if (deleteConfirm !== deleteTarget.name) {
      setDeleteError('Project name did not match.')
      return
    }
    setDeleteError(null)
    await fetchJson<{ deleted: boolean }>(`${API_BASE}/projects/${deleteTarget.id}`, {
      method: 'DELETE',
    })
    const nextFavorites = favorites.filter((id) => id !== deleteTarget.id)
    if (nextFavorites.length !== favorites.length) {
      setFavorites(nextFavorites)
      writeFavorites(nextFavorites)
    }
    await loadProjects()
    window.dispatchEvent(new CustomEvent('alure:projects-updated'))
    closeDeleteModal()
  }

  const handleCreateProject = async () => {
    if (!projectName.trim()) return
    setProjectError(null)
    try {
      await fetchJson<Project>(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim() }),
      })
      setProjectName('')
      await loadProjects()
      window.dispatchEvent(new CustomEvent('alure:projects-updated'))
      setCreateModalOpen(false)
    } catch (err) {
      if (err instanceof Error && err.message.includes('409')) {
        setProjectError('Project name already exists.')
        return
      }
      setProjectError('Unable to create project.')
    }
  }

  const normalizedQuery = projectQuery.trim().toLowerCase()
  const filteredProjects = useMemo(() => {
    const filtered = projects.filter((project) => {
      if (!normalizedQuery) return true
      const haystack = `${project.name} ${project.id}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    const sorted = [...filtered].sort((a, b) => {
      if (projectSort === 'name_asc') {
        return a.name.localeCompare(b.name)
      }
      if (projectSort === 'name_desc') {
        return b.name.localeCompare(a.name)
      }
      if (projectSort === 'created_asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return sorted
  }, [projects, normalizedQuery, projectSort])

  return (
    <div className="page">
      <section className="card">
        <div className="card-header">
          <h2>Start here</h2>
        </div>
        <p className="muted">Pick a project from the sidebar or create a new one to get started.</p>
        <div className="form compact-form">
          <div className="form two-column project-filters">
            <label className="field compact">
              <span>Search</span>
              <input
                type="text"
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.target.value)}
                placeholder="Project name or ID"
              />
            </label>
            <label className="field">
              <span>Sort</span>
              <select
                value={projectSort}
                onChange={(event) => setProjectSort(event.target.value as typeof projectSort)}
              >
                <option value="created_desc">Newest</option>
                <option value="created_asc">Oldest</option>
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
              </select>
            </label>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <h2>All projects</h2>
            <span className="muted">Manage favorites and remove projects.</span>
          </div>
          <div className="card-actions">
            <button
              className="icon-button success"
              onClick={() => {
                setProjectName('')
                setProjectError(null)
                setCreateModalOpen(true)
              }}
              aria-label="Create project"
              title="Create project"
            >
              <i className="fa-solid fa-plus" />
            </button>
            <button className="ghost" onClick={loadProjects}>
              <i className="fa-solid fa-rotate-right" />
              Reload
            </button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="project-list">
          {filteredProjects.map((project) => (
            <div key={project.id} className="project-row project-row-card">
              <div className="project-row-main">
                <span className="project-row-icon" aria-hidden="true">
                  <i className="fa-solid fa-cube" />
                </span>
                <div>
                  <span className="project-row-name">{project.name}</span>
                  <span className="muted">Created {new Date(project.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="project-row-actions">
                <button
                  type="button"
                  className={`icon-button ${favorites.includes(project.id) ? 'active' : ''}`}
                  onClick={() => toggleFavorite(project.id)}
                  aria-label="Toggle favorite"
                >
                  <i className={favorites.includes(project.id) ? 'fa-solid fa-star' : 'fa-regular fa-star'} />
                </button>
                <button className="ghost" onClick={() => navigate(`/projects/${project.id}`)}>
                  Open
                </button>
                <button className="ghost danger" onClick={() => handleDeleteProject(project)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {filteredProjects.length === 0 && <div className="empty">No projects yet.</div>}
        </div>
      </section>
      {createModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreateModalOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="create-project-title">Create project</h2>
              <button className="icon-button" onClick={() => setCreateModalOpen(false)} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <label className="field">
              <span>Project name</span>
              <input
                type="text"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Desktop Suite"
              />
            </label>
            {projectError && <div className="error">{projectError}</div>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setCreateModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={handleCreateProject} disabled={!projectName.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onClick={closeDeleteModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="delete-project-title">Delete project</h2>
              <button className="icon-button" onClick={closeDeleteModal} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <p className="muted">
              This will delete <strong>{deleteTarget.name}</strong> and all related data.
            </p>
            <label className="field">
              <span>Type the project name to confirm</span>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                placeholder={deleteTarget.name}
              />
            </label>
            {deleteError && <div className="error">{deleteError}</div>}
            <div className="modal-actions">
              <button className="ghost" onClick={closeDeleteModal}>Cancel</button>
              <button
                className="ghost danger"
                onClick={confirmDeleteProject}
                disabled={deleteConfirm !== deleteTarget.name}
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectLayout() {
  const { projectId } = useParams()
  const [licenseCount, setLicenseCount] = useState(0)
  const [releaseCount, setReleaseCount] = useState(0)
  const [activationCount, setActivationCount] = useState(0)

  useEffect(() => {
    if (!projectId) return
    const loadCounts = async () => {
      const data = await fetchJson<ProjectOverviewStats>(`${API_BASE}/projects/${projectId}/overview`)
      setLicenseCount(data.licenses.total)
      setReleaseCount(data.releases.total)
      setActivationCount(data.activations.total)
    }
    void loadCounts()
  }, [projectId])

  if (!projectId) {
    return null
  }

  return (
    <div className="project-shell">
      <div className="content">
        <Outlet context={{ licenseCount, activationCount, releaseCount }} />
      </div>
    </div>
  )
}

function ProjectTabsBar({
  projectId,
  licenseCount,
  activationCount,
  releaseCount,
}: {
  projectId: string
  licenseCount: number
  activationCount: number
  releaseCount: number
}) {
  return (
    <nav className="project-tabs">
      <NavLink to={`/projects/${projectId}/overview`}>Overview</NavLink>
      <NavLink to={`/projects/${projectId}/modules`}>Modules</NavLink>
      <NavLink to={`/projects/${projectId}/licenses`}>
        Licenses <span className="nav-badge">{licenseCount}</span>
      </NavLink>
      <NavLink to={`/projects/${projectId}/activations`}>
        Activations <span className="nav-badge">{activationCount}</span>
      </NavLink>
      <NavLink to={`/projects/${projectId}/releases`}>
        Releases <span className="nav-badge">{releaseCount}</span>
      </NavLink>
    </nav>
  )
}
function OverviewSection() {
  const { projectId } = useParams()
  const { licenseCount: projectLicenseCount, activationCount, releaseCount: projectReleaseCount } =
    useOutletContext<ProjectNavContext>()
  const [licenseCount, setLicenseCount] = useState(0)
  const [releaseCount, setReleaseCount] = useState(0)
  const [licenseStats, setLicenseStats] = useState({
    active: 0,
    revoked: 0,
    expired: 0,
    avgUsage: 0,
  })
  const [releaseStats, setReleaseStats] = useState({
    latestVersion: 'n/a',
    channel: 'n/a',
    publishedAt: 'n/a',
    publishedCount: 0,
    draftCount: 0,
    deprecatedCount: 0,
  })
  const [moduleStats, setModuleStats] = useState({
    total: 0,
    activeInLicenses: 0,
    forcedOn: 0,
    forcedOff: 0,
    usedInActivations: 0,
  })

  useEffect(() => {
    if (!projectId) return
    const loadOverview = async () => {
      const data = await fetchJson<ProjectOverviewStats>(`${API_BASE}/projects/${projectId}/overview`)
      setLicenseCount(data.licenses.total)
      setReleaseCount(data.releases.total)
      setLicenseStats({
        active: data.licenses.active,
        revoked: data.licenses.revoked,
        expired: data.licenses.expired,
        avgUsage: data.licenses.avg_usage_percent,
      })
      setReleaseStats({
        latestVersion: data.releases.latest_version ?? 'n/a',
        channel: data.releases.latest_channel ?? 'n/a',
        publishedAt: data.releases.latest_published_at ?? 'n/a',
        publishedCount: data.releases.published,
        draftCount: data.releases.draft,
        deprecatedCount: data.releases.deprecated,
      })
      setModuleStats({
        total: data.modules.total,
        activeInLicenses: data.modules.active_in_licenses,
        forcedOn: data.modules.forced_on,
        forcedOff: data.modules.forced_off,
        usedInActivations: data.modules.used_in_activations,
      })
    }
    void loadOverview()
  }, [projectId])

  if (!projectId) return null

  const formatDate = (value?: string) => {
    if (!value) return 'n/a'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 'n/a'
    return parsed.toLocaleDateString()
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
            {projectId && (
              <ProjectTabsBar
                projectId={projectId}
                licenseCount={projectLicenseCount}
                activationCount={activationCount}
                releaseCount={projectReleaseCount}
              />
            )}
            <div className="breadcrumb">
              <Link to="/">Projects</Link>
              <span>/</span>
              <span>Overview</span>
            </div>
            <div className="section-title">
              <h1>Project overview</h1>
              <span className="section-pill">Overview</span>
            </div>
          </div>
          <p>Summary of licensing and release health for this project.</p>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Licenses</h2>
          <p className="muted">Active, revoked, expired, and usage.</p>
          <div className="stat-line">
            <span>Total licenses</span>
            <strong>{licenseCount}</strong>
          </div>
          <div className="stat-line">
            <span>Active</span>
            <strong>{licenseStats.active}</strong>
          </div>
          <div className="stat-line">
            <span>Revoked</span>
            <strong>{licenseStats.revoked}</strong>
          </div>
          <div className="stat-line">
            <span>Expired</span>
            <strong>{licenseStats.expired}</strong>
          </div>
          <div className="stat-line">
            <span>Avg. usage</span>
            <strong>{licenseStats.avgUsage}%</strong>
          </div>
        </div>
        <div className="card">
          <h2>Releases</h2>
          <p className="muted">Latest build and publishing details.</p>
          <div className="stat-line">
            <span>Total releases</span>
            <strong>{releaseCount}</strong>
          </div>
          <div className="stat-line">
            <span>Published</span>
            <strong>{releaseStats.publishedCount}</strong>
          </div>
          <div className="stat-line">
            <span>Drafts</span>
            <strong>{releaseStats.draftCount}</strong>
          </div>
          <div className="stat-line">
            <span>Deprecated</span>
            <strong>{releaseStats.deprecatedCount}</strong>
          </div>
          <div className="stat-line">
            <span>Latest version</span>
            <strong>{releaseStats.latestVersion}</strong>
          </div>
          <div className="stat-line">
            <span>Channel</span>
            <strong>{releaseStats.channel}</strong>
          </div>
          <div className="stat-line">
            <span>Last release</span>
            <strong>{formatDate(releaseStats.publishedAt)}</strong>
          </div>
        </div>
        <div className="card">
          <h2>Modules</h2>
          <p className="muted">Adoption and force flags.</p>
          <div className="stat-line">
            <span>Total modules</span>
            <strong>{moduleStats.total}</strong>
          </div>
          <div className="stat-line">
            <span>Active in licenses</span>
            <strong>{moduleStats.activeInLicenses}</strong>
          </div>
          <div className="stat-line">
            <span>Forced on</span>
            <strong>{moduleStats.forcedOn}</strong>
          </div>
          <div className="stat-line">
            <span>Forced off</span>
            <strong>{moduleStats.forcedOff}</strong>
          </div>
          <div className="stat-line">
            <span>Used in activations</span>
            <strong>{moduleStats.usedInActivations}</strong>
          </div>
        </div>
      </section>
    </div>
  )
}
function ModulesSection() {
  const { projectId } = useParams()
  const { licenseCount, activationCount, releaseCount } = useOutletContext<ProjectNavContext>()
  const [modules, setModules] = useState<ProjectModule[]>([])
  const [moduleKey, setModuleKey] = useState('')
  const [moduleName, setModuleName] = useState('')
  const [moduleDescription, setModuleDescription] = useState('')
  const [moduleParams, setModuleParams] = useState<{ key: string; value: string }[]>([])
  const [moduleError, setModuleError] = useState<string | null>(null)
  const [moduleMessage, setModuleMessage] = useState<string | null>(null)

  const loadModules = async (id: string) => {
    try {
      const data = await fetchJson<ProjectModule[]>(`${API_BASE}/projects/${id}/modules`)
      setModules(data)
      setModuleError(null)
    } catch (error) {
      if (error instanceof Error) {
        setModuleError(`Unable to load modules (${error.message}).`)
        return
      }
      setModuleError('Unable to load modules.')
    }
  }

  useEffect(() => {
    if (!projectId) return
    void loadModules(projectId)
  }, [projectId])

  const handleAddParam = () => {
    setModuleParams((prev) => [...prev, { key: '', value: '' }])
  }

  const handleParamChange = (index: number, field: 'key' | 'value', value: string) => {
    setModuleParams((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleRemoveParam = (index: number) => {
    setModuleParams((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleCreateModule = async () => {
    if (!projectId) return
    setModuleError(null)
    setModuleMessage(null)
    const paramsEntries = moduleParams
      .map((pair) => ({ key: pair.key.trim(), value: pair.value.trim() }))
      .filter((pair) => pair.key && pair.value)
    const params = paramsEntries.length
      ? Object.fromEntries(paramsEntries.map((pair) => [pair.key, pair.value]))
      : undefined
    try {
      await fetchJson<ProjectModule>(`${API_BASE}/projects/${projectId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: moduleKey.trim(),
          name: moduleName.trim(),
          description: moduleDescription.trim() || undefined,
          params,
        }),
      })
      setModuleKey('')
      setModuleName('')
      setModuleDescription('')
      setModuleParams([])
      setModuleMessage('Module created.')
      await loadModules(projectId)
    } catch (error) {
      if (error instanceof Error) {
        setModuleError(`Unable to create module (${error.message}).`)
        return
      }
      setModuleError('Unable to create module.')
    }
  }

  const handleDeleteModule = async (moduleId: string) => {
    if (!projectId) return
    const ok = window.confirm('Delete this module?')
    if (!ok) return
    setModuleError(null)
    setModuleMessage(null)
    try {
      await fetchJson<{ deleted: boolean }>(`${API_BASE}/projects/${projectId}/modules/${moduleId}`, {
        method: 'DELETE',
      })
      setModuleMessage('Module deleted.')
      await loadModules(projectId)
    } catch (error) {
      if (error instanceof Error) {
        setModuleError(`Unable to delete module (${error.message}).`)
        return
      }
      setModuleError('Unable to delete module.')
    }
  }

  if (!projectId) return null

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
            <ProjectTabsBar
              projectId={projectId}
              licenseCount={licenseCount}
              activationCount={activationCount}
              releaseCount={releaseCount}
            />
            <div className="breadcrumb">
              <Link to="/">Projects</Link>
              <span>/</span>
              <span>Modules</span>
            </div>
            <div className="section-title">
              <h1>Project modules</h1>
              <span className="section-pill">Modules</span>
            </div>
          </div>
          <p>Create configurable modules for this project and reuse them across licenses.</p>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>New module</h2>
              <span className="muted">Define a key, name, and optional parameters.</span>
            </div>
          </div>
          <div className="form">
            <label className="field">
              <span>Key</span>
              <input value={moduleKey} onChange={(event) => setModuleKey(event.target.value)} />
            </label>
            <label className="field">
              <span>Name</span>
              <input value={moduleName} onChange={(event) => setModuleName(event.target.value)} />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                value={moduleDescription}
                onChange={(event) => setModuleDescription(event.target.value)}
                rows={3}
              />
            </label>
            <div className="module-params">
              <div className="module-params-header">
                <span>Params</span>
                <button className="ghost" onClick={handleAddParam}>
                  Add param
                </button>
              </div>
              {moduleParams.map((pair, index) => (
                <div key={index} className="module-param-row">
                  <input
                    placeholder="Key"
                    value={pair.key}
                    onChange={(event) => handleParamChange(index, 'key', event.target.value)}
                  />
                  <input
                    placeholder="Value"
                    value={pair.value}
                    onChange={(event) => handleParamChange(index, 'value', event.target.value)}
                  />
                  <button className="ghost" onClick={() => handleRemoveParam(index)}>
                    Remove
                  </button>
                </div>
              ))}
              {moduleParams.length === 0 && <div className="empty">No params yet.</div>}
            </div>
            <button
              className="primary"
              onClick={handleCreateModule}
              disabled={!moduleKey.trim() || !moduleName.trim()}
            >
              Create module
            </button>
            {moduleMessage && <div className="notice">{moduleMessage}</div>}
            {moduleError && <div className="error">{moduleError}</div>}
          </div>
        </div>

        <div className="card span-2">
          <div className="card-header">
            <div>
              <h2>Modules list</h2>
              <span className="muted">Manage existing modules and parameters.</span>
            </div>
            <button className="ghost" onClick={() => loadModules(projectId)}>
              Reload
            </button>
          </div>
          <div className="table">
            <div className="table-row table-header module-row">
              <span>Key</span>
              <span>Name</span>
              <span>Params</span>
              <span>Actions</span>
            </div>
            {modules.map((module) => (
              <div key={module.id} className="table-row module-row">
                <span>{module.key}</span>
                <span>{module.name}</span>
                <span>{module.params ? Object.keys(module.params).length : 0}</span>
                <div className="row-actions">
                  <button className="ghost danger" onClick={() => handleDeleteModule(module.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {modules.length === 0 && <div className="empty">No modules created.</div>}
          </div>
        </div>
      </section>
    </div>
  )
}
function LicensesSection() {
  const { projectId } = useParams()
  const { licenseCount: projectLicenseCount, activationCount, releaseCount } =
    useOutletContext<ProjectNavContext>()
  const [licenses, setLicenses] = useState<License[]>([])
  const [activationCounts, setActivationCounts] = useState<Record<string, number>>({})
  const [plans, setPlans] = useState<Plan[]>([])
  const [plansError, setPlansError] = useState<string | null>(null)
  const [licensePlan, setLicensePlan] = useState('basic')
  const [licenseMaxActivations, setLicenseMaxActivations] = useState(1)
  const [licenseDurationDays, setLicenseDurationDays] = useState('')
  const [licenseNotes, setLicenseNotes] = useState('')
  const [lastCreatedKey, setLastCreatedKey] = useState<string | null>(null)
  const [bulkRecipients, setBulkRecipients] = useState('')
  const [bulkPlan, setBulkPlan] = useState('basic')
  const [bulkMaxActivations, setBulkMaxActivations] = useState(1)
  const [bulkDurationDays, setBulkDurationDays] = useState('')
  const [bulkNotes, setBulkNotes] = useState('')
  const [bulkResult, setBulkResult] = useState<BulkCreateLicensesResponse | null>(null)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [smtpVerified, setSmtpVerified] = useState(false)
  const [smtpLoaded, setSmtpLoaded] = useState(false)
  const [licenseQuery, setLicenseQuery] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<'all' | 'active' | 'revoked'>('all')
  const [licenseSort, setLicenseSort] = useState<'created_desc' | 'created_asc' | 'expires_asc' | 'expires_desc'>('created_desc')
  const [licensePage, setLicensePage] = useState(1)
  const [licensePageSize, setLicensePageSize] = useState(10)
  const [expandedBulkGroups, setExpandedBulkGroups] = useState<Record<string, boolean>>({})
  const [showCreateForm, setShowCreateForm] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 960))
  const [showBulkForm, setShowBulkForm] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 960))
  const [showLicenseFilters, setShowLicenseFilters] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 960))
  const [licenseModules, setLicenseModules] = useState<LicenseModuleItem[]>([])
  const [licenseModuleLicenseId, setLicenseModuleLicenseId] = useState<string | null>(null)
  const [licenseModuleModalOpen, setLicenseModuleModalOpen] = useState(false)
  const [licenseModuleMessage, setLicenseModuleMessage] = useState<string | null>(null)
  const [licenseModuleError, setLicenseModuleError] = useState<string | null>(null)
  const [licenseModuleSaving, setLicenseModuleSaving] = useState(false)
  const navigate = useNavigate()

  const loadLicenses = async (id: string) => {
    const data = await fetchJson<License[]>(`${API_BASE}/licenses?project_id=${id}`)
    setLicenses(data)
    if (data.length === 0) {
      setActivationCounts({})
      return
    }
    const counts = await Promise.all(
      data.map(async (license) => {
        const activations = await fetchJson<Activation[]>(
          `${API_BASE}/licenses/${license.license_id}/activations`,
        )
        return {
          id: license.license_id,
          count: activations.filter((activation) => !activation.revoked).length,
        }
      }),
    )
    const next: Record<string, number> = {}
    counts.forEach((item) => {
      next[item.id] = item.count
    })
    setActivationCounts(next)
  }

  const forceValue = (module: LicenseModuleItem) => {
    if (module.force_activation) return 'on'
    if (module.force_deactivation) return 'off'
    return 'none'
  }

  const openLicenseModules = async (licenseId: string) => {
    setLicenseModuleError(null)
    setLicenseModuleMessage(null)
    setLicenseModuleLicenseId(licenseId)
    setLicenseModuleModalOpen(true)
    try {
      const data = await fetchJson<{ modules: LicenseModuleItem[] }>(`${API_BASE}/licenses/${licenseId}/modules`)
      setLicenseModules(data.modules)
    } catch (error) {
      if (error instanceof Error) {
        setLicenseModuleError(`Unable to load modules (${error.message}).`)
        return
      }
      setLicenseModuleError('Unable to load modules.')
    }
  }

  const toggleLicenseModule = (moduleId: string) => {
    setLicenseModules((prev) =>
      prev.map((module) =>
        module.module_id === moduleId
          ? { ...module, enabled: !module.enabled }
          : module,
      ),
    )
  }

  const updateLicenseModuleForce = (moduleId: string, value: 'none' | 'on' | 'off') => {
    setLicenseModules((prev) =>
      prev.map((module) => {
        if (module.module_id !== moduleId) return module
        if (value === 'on') {
          return { ...module, force_activation: true, force_deactivation: false, enabled: true }
        }
        if (value === 'off') {
          return { ...module, force_activation: false, force_deactivation: true, enabled: false }
        }
        return { ...module, force_activation: false, force_deactivation: false }
      }),
    )
  }

  const saveLicenseModules = async () => {
    if (!licenseModuleLicenseId) return
    setLicenseModuleSaving(true)
    setLicenseModuleError(null)
    setLicenseModuleMessage(null)
    try {
      const payload = {
        modules: licenseModules
          .filter((module) => module.enabled || module.force_activation || module.force_deactivation)
          .map((module) => ({
            key: module.key,
            force_activation: module.force_activation || undefined,
            force_deactivation: module.force_deactivation || undefined,
          })),
      }
      const data = await fetchJson<{ modules: LicenseModuleItem[] }>(
        `${API_BASE}/licenses/${licenseModuleLicenseId}/modules`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      setLicenseModules(data.modules)
      setLicenseModuleMessage('Modules updated.')
      if (projectId) {
        await loadLicenses(projectId)
      }
    } catch (error) {
      if (error instanceof Error) {
        setLicenseModuleError(`Unable to save modules (${error.message}).`)
        return
      }
      setLicenseModuleError('Unable to save modules.')
    } finally {
      setLicenseModuleSaving(false)
    }
  }

  const revokeFromModules = async () => {
    if (!licenseModuleLicenseId) return
    await handleRevokeLicense(licenseModuleLicenseId)
    setLicenseModuleModalOpen(false)
  }

  const handleCreateLicense = async () => {
    if (!projectId) return
    const parsedMax = Number(licenseMaxActivations)
    const payload = {
      project_id: projectId,
      plan: licensePlan,
      max_activations: Number.isNaN(parsedMax) ? 1 : parsedMax,
      duration_days: licenseDurationDays ? Number(licenseDurationDays) : undefined,
      notes: licenseNotes.trim() || undefined,
    }
    const response = await fetchJson<{ license_id: string; license_key: string }>(
      `${API_BASE}/licenses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    setLastCreatedKey(response.license_key)
    const selected = plans.find((plan) => plan.name === licensePlan)
    setLicenseDurationDays(
      selected?.duration_days_default && selected.duration_days_default > 0
        ? String(selected.duration_days_default)
        : '',
    )
    setLicenseNotes('')
    await loadLicenses(projectId)
  }

  const handleRevokeLicense = async (licenseId: string) => {
    await fetchJson<{ revoked: boolean }>(`${API_BASE}/licenses/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_id: licenseId, reason: 'dashboard' }),
    })
    if (projectId) {
      await loadLicenses(projectId)
    }
  }

  const handleCopyKey = async () => {
    if (!lastCreatedKey) return
    try {
      await navigator.clipboard.writeText(lastCreatedKey)
    } catch {
      return
    }
  }

  const isExpired = (license: License) => {
    if (!license.expires_at) return false
    return new Date(license.expires_at).getTime() < Date.now()
  }

  const toggleBulkGroup = (label: string) => {
    setExpandedBulkGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }))
  }

  const loadPlans = async () => {
    try {
      const data = await fetchJson<Plan[]>(`${API_BASE}/plans`)
      setPlans(data)
      setPlansError(null)
      if (data.length > 0) {
        const matched = data.find((plan) => plan.name === licensePlan)
        const selected = matched ?? data[0]
        if (!matched) {
          setLicensePlan(selected.name)
        }
        setLicenseMaxActivations(selected.max_activations_default)
        setLicenseDurationDays(
          selected.duration_days_default && selected.duration_days_default > 0
            ? String(selected.duration_days_default)
            : '',
        )
        const bulkMatched = data.find((plan) => plan.name === bulkPlan)
        const bulkSelected = bulkMatched ?? selected
        if (!bulkMatched) {
          setBulkPlan(bulkSelected.name)
        }
        setBulkMaxActivations(bulkSelected.max_activations_default)
        setBulkDurationDays(
          bulkSelected.duration_days_default && bulkSelected.duration_days_default > 0
            ? String(bulkSelected.duration_days_default)
            : '',
        )
      }
    } catch (error) {
      if (error instanceof Error) {
        setPlansError(`Unable to load plans (${error.message}).`)
        return
      }
      setPlansError('Unable to load plans.')
    }
  }

  const loadSmtpStatus = async () => {
    try {
      const data = await fetchJson<SmtpSettings | null>(`${API_BASE}/smtp/settings`)
      setSmtpVerified(Boolean(data?.verified))
      setSmtpLoaded(true)
    } catch {
      setSmtpVerified(false)
      setSmtpLoaded(true)
    }
  }

  const handleBulkCreate = async () => {
    if (!projectId) return
    const recipients = parseRecipients(bulkRecipients)
    if (recipients.length === 0) {
      setBulkError('Add at least one recipient email.')
      return
    }
    if (!smtpVerified) {
      setBulkError('SMTP must be verified before sending licenses.')
      return
    }
    const parsedMax = Number(bulkMaxActivations)
    const payload = {
      project_id: projectId,
      plan: bulkPlan,
      max_activations: Number.isNaN(parsedMax) ? 1 : parsedMax,
      duration_days: bulkDurationDays ? Number(bulkDurationDays) : undefined,
      notes: bulkNotes.trim() || undefined,
      recipients,
    }
    setBulkError(null)
    setBulkMessage(null)
    try {
      const response = await fetchJson<BulkCreateLicensesResponse>(`${API_BASE}/licenses/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setBulkResult(response)
      setBulkMessage(`Created ${response.created.length}, failed ${response.failed.length}.`)
      setBulkRecipients('')
      setBulkNotes('')
      await loadLicenses(projectId)
    } catch (error) {
      if (error instanceof Error) {
        setBulkError(`Unable to create licenses (${error.message}).`)
        return
      }
      setBulkError('Unable to create licenses.')
    }
  }

  useEffect(() => {
    if (!projectId) return
    void loadLicenses(projectId)
    void loadPlans()
    if (!smtpLoaded) {
      void loadSmtpStatus()
    }
  }, [projectId])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 960) {
        setShowCreateForm(true)
        setShowBulkForm(true)
        setShowLicenseFilters(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (!projectId) return null

  const normalizedQuery = licenseQuery.trim().toLowerCase()
  const filteredLicenses = useMemo(() => {
    const filtered = licenses.filter((license) => {
      if (licenseStatus === 'active' && (license.revoked || isExpired(license))) return false
      if (licenseStatus === 'revoked' && !license.revoked) return false
      if (!normalizedQuery) return true
      const haystack = [
        license.license_id,
        license.plan,
        license.notes ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    const sorted = [...filtered].sort((a, b) => {
      if (licenseSort === 'created_asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      if (licenseSort === 'created_desc') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (licenseSort === 'expires_asc') {
        const aTime = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY
        const bTime = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY
        return aTime - bTime
      }
      const aTime = a.expires_at ? new Date(a.expires_at).getTime() : Number.NEGATIVE_INFINITY
      const bTime = b.expires_at ? new Date(b.expires_at).getTime() : Number.NEGATIVE_INFINITY
      return bTime - aTime
    })
    return sorted
  }, [licenses, licenseStatus, normalizedQuery, licenseSort])

  const singleLicenses = useMemo(
    () => filteredLicenses.filter((license) => !license.bulk_created),
    [filteredLicenses],
  )
  const bulkLicenses = useMemo(
    () => filteredLicenses.filter((license) => license.bulk_created),
    [filteredLicenses],
  )
  const bulkGroups = useMemo(() => {
    const groups = new Map<string, License[]>()
    bulkLicenses.forEach((license) => {
      const label = license.notes?.trim() || 'Bulk batch'
      const list = groups.get(label) ?? []
      list.push(license)
      groups.set(label, list)
    })
    return Array.from(groups.entries())
      .map(([label, items]) => ({
        label,
        items: items.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
        latest: items.reduce((latest, item) => {
          if (!latest) return item
          return new Date(item.created_at).getTime() > new Date(latest.created_at).getTime()
            ? item
            : latest
        }, null as License | null),
      }))
      .sort((a, b) => {
        const aTime = a.latest ? new Date(a.latest.created_at).getTime() : 0
        const bTime = b.latest ? new Date(b.latest.created_at).getTime() : 0
        return bTime - aTime
      })
  }, [bulkLicenses])

  const totalLicenses = singleLicenses.length
  const totalPages = Math.max(1, Math.ceil(totalLicenses / licensePageSize))
  const currentPage = Math.min(licensePage, totalPages)
  const pageStart = (currentPage - 1) * licensePageSize
  const pagedLicenses = singleLicenses.slice(pageStart, pageStart + licensePageSize)

  useEffect(() => {
    if (licensePage > totalPages) {
      setLicensePage(totalPages)
    }
  }, [licensePage, totalPages])

  const handlePlanChange = (value: string) => {
    setLicensePlan(value)
    const plan = plans.find((item) => item.name === value)
    if (plan) {
      setLicenseMaxActivations(plan.max_activations_default)
      setLicenseDurationDays(
        plan.duration_days_default && plan.duration_days_default > 0
          ? String(plan.duration_days_default)
          : '',
      )
    }
  }

  const handleBulkPlanChange = (value: string) => {
    setBulkPlan(value)
    const plan = plans.find((item) => item.name === value)
    if (plan) {
      setBulkMaxActivations(plan.max_activations_default)
      setBulkDurationDays(
        plan.duration_days_default && plan.duration_days_default > 0
          ? String(plan.duration_days_default)
          : '',
      )
    }
  }

  const parseRecipients = (value: string) =>
    Array.from(
      new Set(
        value
          .split(/[\s,;]+/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    )

  const bulkRecipientList = useMemo(
    () => parseRecipients(bulkRecipients),
    [bulkRecipients],
  )
  const moduleLicense = licenses.find((license) => license.license_id === licenseModuleLicenseId) ?? null
  const moduleLicenseRevoked = moduleLicense ? moduleLicense.revoked || isExpired(moduleLicense) : false

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
            {projectId && (
              <ProjectTabsBar
                projectId={projectId}
                licenseCount={projectLicenseCount}
                activationCount={activationCount}
                releaseCount={releaseCount}
              />
            )}
            <div className="breadcrumb">
              <Link to="/">Projects</Link>
              <span>/</span>
              <span>Licenses</span>
            </div>
            <div className="section-title">
              <h1>Licenses</h1>
              <span className="section-pill">Licensing</span>
            </div>
          </div>
          <p>Generate license keys and review activation limits.</p>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Create license</h2>
              <span className="muted">Generate keys for this project.</span>
            </div>
            <button
              className="icon-button"
              onClick={() => setShowCreateForm((prev) => !prev)}
              aria-label="Toggle create license"
              title="Toggle create license"
            >
              <i className={showCreateForm ? 'fa-solid fa-minus' : 'fa-solid fa-plus'} />
            </button>
          </div>
          <div className={`form license-form collapse-body ${showCreateForm ? '' : 'is-collapsed'}`}>
            <label className="field">
              <span>Plan</span>
              <select value={licensePlan} onChange={(event) => handlePlanChange(event.target.value)}>
                {plans.length === 0 && <option value="basic">basic</option>}
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.name}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            {plansError && <div className="error">{plansError}</div>}
            <label className="field">
              <span>Max activations</span>
              <input
                type="number"
                min={0}
                value={licenseMaxActivations}
                onChange={(event) => setLicenseMaxActivations(Number(event.target.value))}
                placeholder="0 = unlimited"
              />
            </label>
            <label className="field">
              <span>Duration (days)</span>
              <input
                type="number"
                min={1}
                value={licenseDurationDays}
                onChange={(event) => setLicenseDurationDays(event.target.value)}
                placeholder="Leave empty for unlimited"
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <input
                type="text"
                value={licenseNotes}
                onChange={(event) => setLicenseNotes(event.target.value)}
                placeholder="Customer or internal notes"
              />
            </label>
            <button className="primary" onClick={handleCreateLicense}>
              Create license key
            </button>
            {lastCreatedKey && (
              <div className="notice">
                <span>New key</span>
                <div className="notice-row">
                  <code>{lastCreatedKey}</code>
                  <button className="ghost" onClick={handleCopyKey}>Copy</button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Bulk licenses</h2>
              <span className="muted">Create and email multiple licenses.</span>
            </div>
            <span className="status-line">
              <span className={`status-dot ${smtpVerified ? 'ok' : 'offline'}`} />
              <span>{smtpVerified ? 'SMTP verified' : 'SMTP required'}</span>
            </span>
            <button
              className="icon-button"
              onClick={() => setShowBulkForm((prev) => !prev)}
              aria-label="Toggle bulk licenses"
              title="Toggle bulk licenses"
            >
              <i className={showBulkForm ? 'fa-solid fa-minus' : 'fa-solid fa-plus'} />
            </button>
          </div>
          <div className={`form bulk-license-form collapse-body ${showBulkForm ? '' : 'is-collapsed'}`}>
            <label className="field full">
              <span>Recipients</span>
              <textarea
                rows={4}
                value={bulkRecipients}
                onChange={(event) => setBulkRecipients(event.target.value)}
                placeholder="one email per line, or comma-separated"
              />
              <span className="muted">{bulkRecipientList.length} recipients detected</span>
            </label>
            <label className="field">
              <span>Plan</span>
              <select value={bulkPlan} onChange={(event) => handleBulkPlanChange(event.target.value)}>
                {plans.length === 0 && <option value="basic">basic</option>}
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.name}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Max activations</span>
              <input
                type="number"
                min={0}
                value={bulkMaxActivations}
                onChange={(event) => setBulkMaxActivations(Number(event.target.value))}
                placeholder="0 = unlimited"
              />
            </label>
            <label className="field">
              <span>Duration (days)</span>
              <input
                type="number"
                min={1}
                value={bulkDurationDays}
                onChange={(event) => setBulkDurationDays(event.target.value)}
                placeholder="Leave empty for unlimited"
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <input
                type="text"
                value={bulkNotes}
                onChange={(event) => setBulkNotes(event.target.value)}
                placeholder="Optional batch note"
              />
            </label>
            {!smtpVerified && smtpLoaded && (
              <div className="notice warn">Verify SMTP settings before sending licenses.</div>
            )}
            <button
              className="primary"
              onClick={handleBulkCreate}
              disabled={!smtpVerified || bulkRecipientList.length === 0}
            >
              Create & send licenses
            </button>
            {bulkError && <div className="error">{bulkError}</div>}
            {bulkMessage && <div className="notice">{bulkMessage}</div>}
            {bulkResult?.failed.length ? (
              <div className="bulk-result">
                <span className="muted">Failed recipients</span>
                <div className="bulk-list">
                  {bulkResult.failed.map((item) => (
                    <div key={item.email} className="bulk-row">
                      <span>{item.email}</span>
                      <span className="muted">{item.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="card span-2">
          <div className="card-header">
            <div>
              <h2>Issued licenses</h2>
              <span className="muted">Single licenses and bulk batches.</span>
            </div>
            <div className="card-actions">
              <button
                className="ghost collapse-toggle"
                onClick={() => setShowLicenseFilters((prev) => !prev)}
              >
                {showLicenseFilters ? 'Hide filters' : 'Show filters'}
              </button>
              <button className="ghost" onClick={() => loadLicenses(projectId)}>
                Reload
              </button>
            </div>
          </div>
          <div className={`toolbar license-toolbar compact-toolbar collapse-body ${showLicenseFilters ? '' : 'is-collapsed'}`}>
            <div className="toolbar-row">
              <label className="field">
                <span>Search</span>
                <input
                  type="text"
                  value={licenseQuery}
                  onChange={(event) => {
                    setLicenseQuery(event.target.value)
                    setLicensePage(1)
                  }}
                  placeholder="ID, plan, or note"
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={licenseStatus}
                  onChange={(event) => {
                    setLicenseStatus(event.target.value as typeof licenseStatus)
                    setLicensePage(1)
                  }}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="revoked">Revoked</option>
                </select>
              </label>
              <label className="field">
                <span>Sort</span>
                <select
                  value={licenseSort}
                  onChange={(event) => setLicenseSort(event.target.value as typeof licenseSort)}
                >
                  <option value="created_desc">Newest</option>
                  <option value="created_asc">Oldest</option>
                  <option value="expires_asc">Expiry soon</option>
                  <option value="expires_desc">Expiry far</option>
                </select>
              </label>
              <label className="field">
                <span>Rows</span>
                <select
                  value={licensePageSize}
                  onChange={(event) => {
                    setLicensePageSize(Number(event.target.value))
                    setLicensePage(1)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
            <div className="toolbar-row">
              <span className="muted">
                Showing {Math.min(pageStart + 1, totalLicenses)}-
                {Math.min(pageStart + pagedLicenses.length, totalLicenses)} of {totalLicenses} single licenses
              </span>
              <div className="pagination">
                <button
                  className="ghost"
                  onClick={() => setLicensePage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </button>
                <span className="muted">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  className="ghost"
                  onClick={() => setLicensePage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          <div className="bulk-license-groups">
            <div className="bulk-license-header">
              <h3>Bulk batches</h3>
              <span className="muted">{bulkLicenses.length} licenses</span>
            </div>
            {bulkGroups.length === 0 ? (
              <div className="empty">No bulk licenses yet.</div>
            ) : (
              bulkGroups.map((group) => {
                const expanded = Boolean(expandedBulkGroups[group.label])
                return (
                  <div key={group.label} className="bulk-group">
                    <button className="ghost bulk-group-toggle" onClick={() => toggleBulkGroup(group.label)}>
                      <span className="bulk-group-title">{group.label}</span>
                      <span className="muted">{group.items.length} licenses</span>
                      <span className="bulk-group-chevron">{expanded ? '-' : '+'}</span>
                    </button>
                    {expanded && (
                      <div className="bulk-group-body">
                        <div className="table-row table-header bulk-row">
                          <span>ID</span>
                          <span>Plan</span>
                          <span>Usage</span>
                          <span>Status</span>
                          <span>Created</span>
                          <span>Expires</span>
                          <span>Actions</span>
                        </div>
                        {group.items.map((license) => (
                          <div key={license.license_id} className="table-row bulk-row">
                            <span data-label="ID">{license.license_id.slice(0, 8)}...</span>
                            <span data-label="Plan">{license.plan}</span>
                            <span data-label="Usage">
                              {(activationCounts[license.license_id] ?? 0)}/
                              {license.max_activations === 0 ? 'Unlimited' : license.max_activations}
                            </span>
                            <span data-label="Status" className={isExpired(license) ? 'status-expired' : undefined}>
                              {license.revoked ? 'Revoked' : isExpired(license) ? 'Expired' : 'Active'}
                            </span>
                            <span data-label="Created">{new Date(license.created_at).toLocaleDateString()}</span>
                            <span data-label="Expires">
                              {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Unlimited'}
                            </span>
                            <div className="row-actions" data-label="Actions">
                              <button
                                className="ghost"
                                onClick={() => openLicenseModules(license.license_id)}
                              >
                                <i className="fa-solid fa-pen-to-square mobile-only" aria-hidden="true" />
                                <span className="desktop-only">Edit</span>
                              </button>
                              <button
                                className="ghost"
                                onClick={() => navigate(`/projects/${projectId}/activations?license=${license.license_id}`)}
                              >
                                <i className="fa-solid fa-wave-square mobile-only" aria-hidden="true" />
                                <span className="desktop-only">Activations</span>
                              </button>
                              <button
                                className="ghost danger"
                                onClick={() => handleRevokeLicense(license.license_id)}
                                disabled={isExpired(license)}
                              >
                                <i className="fa-solid fa-ban mobile-only" aria-hidden="true" />
                                <span className="desktop-only">Revoke</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
          <div className="table">
            <div className="table-row table-header license-row">
              <span>ID</span>
              <span>Plan</span>
              <span>Usage</span>
              <span>Notes</span>
              <span>Status</span>
              <span>Created</span>
              <span>Expires</span>
              <span>Actions</span>
            </div>
            {pagedLicenses.map((license) => (
              <div key={license.license_id} className="table-row license-row">
                <span>{license.license_id.slice(0, 8)}...</span>
                <span>{license.plan}</span>
                <span data-label="Usage">
                              {(activationCounts[license.license_id] ?? 0)}/
                  {license.max_activations === 0 ? 'Unlimited' : license.max_activations}
                </span>
                <span data-label="Notes">{license.notes || '-'}</span>
                <span className={isExpired(license) ? 'status-expired' : undefined}>
                  {license.revoked ? 'Revoked' : isExpired(license) ? 'Expired' : 'Active'}
                </span>
                <span>{new Date(license.created_at).toLocaleDateString()}</span>
                <span data-label="Expires">
                              {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Unlimited'}
                </span>
                <div className="row-actions" data-label="Actions">
                  <button
                    className="ghost"
                    onClick={() => openLicenseModules(license.license_id)}
                  >
                    <i className="fa-solid fa-pen-to-square mobile-only" aria-hidden="true" />
                    <span className="desktop-only">Edit</span>
                  </button>
                  <button
                    className="ghost"
                    onClick={() => navigate(`/projects/${projectId}/activations?license=${license.license_id}`)}
                  >
                    <i className="fa-solid fa-wave-square mobile-only" aria-hidden="true" />
                    <span className="desktop-only">Activations</span>
                  </button>
                  <button
                    className="ghost danger"
                    onClick={() => handleRevokeLicense(license.license_id)}
                    disabled={isExpired(license)}
                  >
                    <i className="fa-solid fa-ban mobile-only" aria-hidden="true" />
                    <span className="desktop-only">Revoke</span>
                  </button>
                </div>
              </div>
            ))}
            {pagedLicenses.length === 0 && <div className="empty">No single licenses yet.</div>}
          </div>
        </div>
      </section>
      {licenseModuleModalOpen && licenseModuleLicenseId && (
        <div className="modal-backdrop" role="presentation" onClick={() => setLicenseModuleModalOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-modules-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="license-modules-title">License modules</h2>
              <button className="icon-button" onClick={() => setLicenseModuleModalOpen(false)} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <p className="muted">License ID: {licenseModuleLicenseId}</p>
            <div className="module-switches">
              <div className="module-switch-grid">
                {licenseModules.map((module) => (
                  <div key={module.module_id} className="module-switch-row">
                    <label className="module-switch">
                      <input
                        type="checkbox"
                        checked={module.enabled}
                        onChange={() => toggleLicenseModule(module.module_id)}
                        disabled={Boolean(module.force_activation || module.force_deactivation)}
                      />
                      <span className="switch-track" />
                      <span className="switch-label">
                        {module.name} <span className="muted">({module.key})</span>
                      </span>
                    </label>
                    <div className="module-force-select">
                      <span>Force</span>
                      <select
                        value={forceValue(module)}
                        onChange={(event) =>
                          updateLicenseModuleForce(module.module_id, event.target.value as 'none' | 'on' | 'off')
                        }
                      >
                        <option value="none">None</option>
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                    {module.force_activation && <span className="module-chip">Forced on</span>}
                    {module.force_deactivation && <span className="module-chip off">Forced off</span>}
                  </div>
                ))}
                {licenseModules.length === 0 && <div className="empty">No modules found.</div>}
              </div>
            </div>
            {licenseModuleError && <div className="error">{licenseModuleError}</div>}
            {licenseModuleMessage && <div className="notice">{licenseModuleMessage}</div>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setLicenseModuleModalOpen(false)}>Close</button>
              <button
                className="ghost danger"
                onClick={revokeFromModules}
                disabled={moduleLicenseRevoked}
              >
                Revoke license
              </button>
              <button className="primary" onClick={saveLicenseModules} disabled={licenseModuleSaving}>
                Save modules
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
function ActivationsSection() {
  const { projectId } = useParams()
  const { licenseCount, activationCount, releaseCount } =
    useOutletContext<ProjectNavContext>()
  const [licenses, setLicenses] = useState<License[]>([])
  const [activations, setActivations] = useState<Activation[]>([])
  const [selectedLicenseId, setSelectedLicenseId] = useState<string>('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [activationQuery, setActivationQuery] = useState('')
  const [activationStatus, setActivationStatus] = useState<'all' | 'active' | 'revoked'>('all')
  const [activationSort, setActivationSort] = useState<'created_desc' | 'created_asc'>('created_desc')
  const [activationPage, setActivationPage] = useState(1)
  const [activationPageSize, setActivationPageSize] = useState(10)
  const [activationModules, setActivationModules] = useState<ActivationModuleItem[]>([])
  const [moduleModalOpen, setModuleModalOpen] = useState(false)
  const [moduleActivationId, setModuleActivationId] = useState<string | null>(null)
  const [moduleMessage, setModuleMessage] = useState<string | null>(null)
  const [moduleError, setModuleError] = useState<string | null>(null)
  const [moduleSaving, setModuleSaving] = useState(false)
  const [hostnamePassword, setHostnamePassword] = useState('')
  const [hostnameReveal, setHostnameReveal] = useState<string | null>(null)

  const loadLicenses = async (id: string) => {
    const data = await fetchJson<License[]>(`${API_BASE}/licenses?project_id=${id}`)
    setLicenses(data)
    const preset = searchParams.get('license')
    if (preset && data.some((license) => license.license_id === preset)) {
      setSelectedLicenseId(preset)
    } else if (data[0]) {
      setSelectedLicenseId(data[0].license_id)
    }
  }

  const loadActivations = async (licenseId: string) => {
    const data = await fetchJson<Activation[]>(`${API_BASE}/licenses/${licenseId}/activations`)
    setActivations(data)
  }

  const openActivationModules = async (activationId: string) => {
    if (!selectedLicenseId) return
    setModuleActivationId(activationId)
    setModuleModalOpen(true)
    setModuleMessage(null)
    setModuleError(null)
    setHostnameReveal(null)
    setHostnamePassword('')
    try {
      const data = await fetchJson<{ modules: ActivationModuleItem[] }>(
        `${API_BASE}/licenses/${selectedLicenseId}/activations/${activationId}/modules`,
      )
      setActivationModules(data.modules)
    } catch (error) {
      if (error instanceof Error) {
        setModuleError(`Unable to load modules (${error.message}).`)
        return
      }
      setModuleError('Unable to load modules.')
    }
  }

  const toggleActivationModule = (moduleId: string) => {
    setActivationModules((prev) =>
      prev.map((module) =>
        module.module_id === moduleId
          ? { ...module, enabled: !module.enabled }
          : module,
      ),
    )
  }

  const saveActivationModules = async () => {
    if (!selectedLicenseId || !moduleActivationId) return
    setModuleSaving(true)
    setModuleError(null)
    setModuleMessage(null)
    try {
      const moduleKeys = activationModules
        .filter((module) => module.enabled)
        .map((module) => module.key)
      const data = await fetchJson<{ modules: ActivationModuleItem[] }>(
        `${API_BASE}/licenses/${selectedLicenseId}/activations/${moduleActivationId}/modules`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module_keys: moduleKeys }),
        },
      )
      setActivationModules(data.modules)
      setModuleMessage('Modules updated.')
      await loadActivations(selectedLicenseId)
    } catch (error) {
      if (error instanceof Error) {
        setModuleError(`Unable to save modules (${error.message}).`)
        return
      }
      setModuleError('Unable to save modules.')
    } finally {
      setModuleSaving(false)
    }
  }

  const revealHostname = async () => {
    if (!selectedLicenseId || !moduleActivationId) return
    setModuleError(null)
    setHostnameReveal(null)
    try {
      const data = await fetchJson<{ hostname?: string }>(
        `${API_BASE}/licenses/${selectedLicenseId}/activations/${moduleActivationId}/hostname`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: hostnamePassword }),
        },
      )
      if (data.hostname) {
        setHostnameReveal(data.hostname)
      } else {
        setHostnameReveal('Not available')
      }
    } catch (error) {
      if (error instanceof Error) {
        setModuleError(`Unable to reveal hostname (${error.message}).`)
        return
      }
      setModuleError('Unable to reveal hostname.')
    }
  }

  const formatLastSeen = (value?: string) => {
    if (!value) return 'Never'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'n/a'
    return date.toLocaleString()
  }

  const handleRevokeActivation = async (activationId: string) => {
    await fetchJson<{ revoked: boolean }>(`${API_BASE}/licenses/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activation_id: activationId, reason: 'dashboard' }),
    })
    if (selectedLicenseId) {
      await loadActivations(selectedLicenseId)
    }
  }

  useEffect(() => {
    if (!projectId) return
    void loadLicenses(projectId)
  }, [projectId])

  useEffect(() => {
    if (!selectedLicenseId) return
    void loadActivations(selectedLicenseId)
    setSearchParams((params) => {
      params.set('license', selectedLicenseId)
      return params
    })
  }, [selectedLicenseId, setSearchParams])

  if (!projectId) return null

  const normalizedQuery = activationQuery.trim().toLowerCase()
  const filteredActivations = useMemo(() => {
    const filtered = activations.filter((activation) => {
      if (activationStatus === 'active' && activation.revoked) return false
      if (activationStatus === 'revoked' && !activation.revoked) return false
      if (!normalizedQuery) return true
      const haystack = `${activation.activation_id} ${activation.device_id_hash} ${activation.hostname_masked ?? ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    const sorted = [...filtered].sort((a, b) => {
      if (activationSort === 'created_asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return sorted
  }, [activations, activationStatus, activationSort, normalizedQuery])

  const totalActivations = filteredActivations.length
  const totalActivationPages = Math.max(1, Math.ceil(totalActivations / activationPageSize))
  const currentActivationPage = Math.min(activationPage, totalActivationPages)
  const activationStart = (currentActivationPage - 1) * activationPageSize
  const pagedActivations = filteredActivations.slice(
    activationStart,
    activationStart + activationPageSize,
  )

  useEffect(() => {
    if (activationPage > totalActivationPages) {
      setActivationPage(totalActivationPages)
    }
  }, [activationPage, totalActivationPages])

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
            {projectId && (
              <ProjectTabsBar
                projectId={projectId}
                licenseCount={licenseCount}
                activationCount={activationCount}
                releaseCount={releaseCount}
              />
            )}
            <div className="breadcrumb">
              <Link to="/">Projects</Link>
              <span>/</span>
              <span>Activations</span>
            </div>
            <div className="section-title">
              <h1>Activations</h1>
              <span className="section-pill">Devices</span>
            </div>
          </div>
          <p>Inspect and revoke device activations per license.</p>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>License selector</h2>
              <span className="muted">Choose a license to see activations.</span>
            </div>
          </div>
          <label className="field">
            <span>License</span>
            <select
              value={selectedLicenseId}
              onChange={(event) => setSelectedLicenseId(event.target.value)}
            >
              <option value="">Select license</option>
              {licenses.map((license) => (
                <option key={license.license_id} value={license.license_id}>
                  {license.license_id.slice(0, 8)}... ({license.plan}
                  {license.notes ? ` - ${license.notes}` : ''})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="card span-2">
          <div className="card-header">
            <div>
              <h2>Activation list</h2>
              <span className="muted">Device hashes tied to this license.</span>
            </div>
          </div>
          <div className="toolbar">
            <div className="toolbar-row">
              <label className="field">
                <span>Search</span>
                <input
                  type="text"
                  name="activation-search"
                  autoComplete="off"
                  value={activationQuery}
                  onChange={(event) => {
                    setActivationQuery(event.target.value)
                    setActivationPage(1)
                  }}
                  placeholder="Activation ID or device hash"
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={activationStatus}
                  onChange={(event) => {
                    setActivationStatus(event.target.value as typeof activationStatus)
                    setActivationPage(1)
                  }}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="revoked">Revoked</option>
                </select>
              </label>
              <label className="field">
                <span>Sort</span>
                <select
                  value={activationSort}
                  onChange={(event) => setActivationSort(event.target.value as typeof activationSort)}
                >
                  <option value="created_desc">Newest</option>
                  <option value="created_asc">Oldest</option>
                </select>
              </label>
              <label className="field">
                <span>Rows</span>
                <select
                  value={activationPageSize}
                  onChange={(event) => {
                    setActivationPageSize(Number(event.target.value))
                    setActivationPage(1)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
            <div className="toolbar-row">
              <span className="muted">
                Showing {Math.min(activationStart + 1, totalActivations)}-
                {Math.min(activationStart + pagedActivations.length, totalActivations)} of {totalActivations}
              </span>
              <div className="pagination">
                <button
                  className="ghost"
                  onClick={() => setActivationPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentActivationPage === 1}
                >
                  Prev
                </button>
                <span className="muted">
                  Page {currentActivationPage} / {totalActivationPages}
                </span>
                <button
                  className="ghost"
                  onClick={() => setActivationPage((prev) => Math.min(totalActivationPages, prev + 1))}
                  disabled={currentActivationPage === totalActivationPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          <div className="table">
            <div className="table-row table-header activation-row">
              <span>ID</span>
              <span>Device</span>
              <span>Host</span>
              <span>Status</span>
              <span>Last seen</span>
              <span>Actions</span>
            </div>
            {pagedActivations.map((activation) => (
              <div key={activation.activation_id} className="table-row activation-row">
                <span data-label="ID">{activation.activation_id.slice(0, 8)}...</span>
                <span data-label="Device">{activation.device_id_hash.slice(0, 10)}...</span>
                <span data-label="Host">{activation.hostname_masked ?? 'Hidden'}</span>
                <span data-label="Status">{activation.revoked ? 'Revoked' : 'Active'}</span>
                <span data-label="Last seen">{formatLastSeen(activation.last_seen_at)}</span>
                <div className="row-actions" data-label="Actions">
                  <button
                    className="ghost"
                    onClick={() => openActivationModules(activation.activation_id)}
                  >
                    <i className="fa-solid fa-pen-to-square mobile-only" aria-hidden="true" />
                    <span className="desktop-only">Edit</span>
                  </button>
                  <button
                    className="ghost danger"
                    onClick={() => handleRevokeActivation(activation.activation_id)}
                    disabled={activation.revoked}
                  >
                    <i className="fa-solid fa-ban mobile-only" aria-hidden="true" />
                    <span className="desktop-only">Revoke</span>
                  </button>
                </div>
              </div>
            ))}
            {pagedActivations.length === 0 && <div className="empty">No activations.</div>}
          </div>
        </div>
      </section>
      {moduleModalOpen && moduleActivationId && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModuleModalOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activation-modules-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="activation-modules-title">Activation modules</h2>
              <button className="icon-button" onClick={() => setModuleModalOpen(false)} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <p className="muted">Activation ID: {moduleActivationId}</p>
            <div className="module-switches">
              <div className="module-switch-grid">
                {activationModules.map((module) => (
                  <div key={module.module_id} className="module-switch-row">
                    <label className="module-switch">
                      <input
                        type="checkbox"
                        checked={module.enabled}
                        onChange={() => toggleActivationModule(module.module_id)}
                        disabled={Boolean(module.force_activation || module.force_deactivation)}
                      />
                      <span className="switch-track" />
                      <span className="switch-label">
                        {module.name} <span className="muted">({module.key})</span>
                      </span>
                    </label>
                    {module.force_activation && <span className="module-chip">Forced on</span>}
                    {module.force_deactivation && <span className="module-chip off">Forced off</span>}
                  </div>
                ))}
                {activationModules.length === 0 && <div className="empty">No modules found.</div>}
              </div>
            </div>
            <div className="module-switches">
              <span className="field-label">Reveal hostname</span>
              <div className="form two-column">
                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    name="activation-hostname-password"
                    autoComplete="new-password"
                    value={hostnamePassword}
                    onChange={(event) => setHostnamePassword(event.target.value)}
                    placeholder="Confirm password"
                  />
                </label>
                <button className="ghost" onClick={revealHostname} disabled={!hostnamePassword.trim()}>
                  Reveal
                </button>
              </div>
              {hostnameReveal && <div className="notice">{hostnameReveal}</div>}
            </div>
            {moduleError && <div className="error">{moduleError}</div>}
            {moduleMessage && <div className="notice">{moduleMessage}</div>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setModuleModalOpen(false)}>Close</button>
              <button className="primary" onClick={saveActivationModules} disabled={moduleSaving}>
                Save modules
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReleasesSection() {
  const { projectId } = useParams()
  const { licenseCount, activationCount, releaseCount } =
    useOutletContext<ProjectNavContext>()
  const [releases, setReleases] = useState<Release[]>([])
  const [releaseVersion, setReleaseVersion] = useState('')
  const [releaseChannel, setReleaseChannel] = useState('stable')
  const [releaseStatus, setReleaseStatus] = useState<'draft' | 'published' | 'deprecated'>('published')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [releaseFile, setReleaseFile] = useState<File | null>(null)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [releaseQuery, setReleaseQuery] = useState('')
  const [releaseChannelFilter, setReleaseChannelFilter] = useState<'all' | 'stable' | 'beta' | 'hotfix'>('all')
  const [releaseStatusFilter, setReleaseStatusFilter] = useState<'all' | 'draft' | 'published' | 'deprecated'>('all')
  const [releaseSort, setReleaseSort] = useState<'published_desc' | 'published_asc'>('published_desc')
  const [releasePage, setReleasePage] = useState(1)
  const [releasePageSize, setReleasePageSize] = useState(12)
  const navigate = useNavigate()

  const loadReleases = async (id: string) => {
    const data = await fetchJson<Release[]>(`${API_BASE}/projects/${id}/releases`)
    setReleases(data)
  }

  const handlePublishRelease = async (releaseId: string) => {
    if (!projectId) return
    const channel = window.prompt('Publish to channel (stable/beta/hotfix):', 'stable')
    if (!channel || !['stable', 'beta', 'hotfix'].includes(channel)) return
    await fetchJson<Release>(`${API_BASE}/projects/${projectId}/releases/${releaseId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, status: 'published' }),
    })
    await loadReleases(projectId)
  }

  const handleDeprecateRelease = async (releaseId: string) => {
    if (!projectId) return
    await fetchJson<Release>(`${API_BASE}/projects/${projectId}/releases/${releaseId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'deprecated' }),
    })
    await loadReleases(projectId)
  }

  const handleDownload = async (url: string) => {
    setReleaseError(null)
    try {
      await downloadWithAuth(url)
    } catch {
      setReleaseError('Download failed. Sign in required.')
    }
  }

  const handleCreateRelease = async () => {
    if (!projectId || !releaseVersion.trim()) return
    setReleaseError(null)
    const normalizedVersion = releaseVersion.trim()
    const versionExists = releases.some((release) => release.version === normalizedVersion)
    if (versionExists) {
      setReleaseError('Version already exists for this project.')
      return
    }
    try {
      if (releaseFile) {
        const formData = new FormData()
        formData.append('file', releaseFile)
        formData.append('version', normalizedVersion)
        formData.append('status', releaseStatus)
        if (releaseStatus !== 'draft') {
          formData.append('channel', releaseChannel)
        }
        if (releaseNotes.trim()) {
          formData.append('notes', releaseNotes.trim())
        }
        const token = window.localStorage.getItem(TOKEN_KEY)
        const res = await fetch(`${API_BASE}/projects/${projectId}/releases/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
      } else {
        await fetchJson<Release>(`${API_BASE}/projects/${projectId}/releases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: normalizedVersion,
            channel: releaseStatus === 'draft' ? undefined : releaseChannel,
            status: releaseStatus,
            notes: releaseNotes.trim() || undefined,
          }),
        })
      }

      setReleaseVersion('')
      setReleaseNotes('')
      setReleaseFile(null)

      await loadReleases(projectId)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('HTTP 409')) {
          setReleaseError('Version already exists for this project.')
          return
        }
        setReleaseError(`Unable to create release (${error.message}).`)
        return
      }
      setReleaseError('Unable to create release.')
    }
  }

  useEffect(() => {
    if (!projectId) return
    void loadReleases(projectId)
  }, [projectId])

  if (!projectId) return null

  const normalizedQuery = releaseQuery.trim().toLowerCase()
  const filteredReleases = useMemo(() => {
    const filtered = releases.filter((release) => {
      if (releaseChannelFilter !== 'all' && release.channel !== releaseChannelFilter) {
        return false
      }
      if (releaseStatusFilter !== 'all' && release.status !== releaseStatusFilter) {
        return false
      }
      if (!normalizedQuery) return true
      const haystack = `${release.version} ${release.notes ?? ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    const sorted = [...filtered].sort((a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0
      if (releaseSort === 'published_asc') {
        return aTime - bTime
      }
      return bTime - aTime
    })
    return sorted
  }, [releases, releaseChannelFilter, releaseStatusFilter, releaseSort, normalizedQuery])

  const totalReleases = filteredReleases.length
  const totalReleasePages = Math.max(1, Math.ceil(totalReleases / releasePageSize))
  const currentReleasePage = Math.min(releasePage, totalReleasePages)
  const releaseStart = (currentReleasePage - 1) * releasePageSize
  const pagedReleases = filteredReleases.slice(releaseStart, releaseStart + releasePageSize)

  useEffect(() => {
    if (releasePage > totalReleasePages) {
      setReleasePage(totalReleasePages)
    }
  }, [releasePage, totalReleasePages])

  const formatReleaseDate = (value?: string) => {
    if (!value) return 'Not published'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'n/a'
    return date.toLocaleDateString()
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
            {projectId && (
              <ProjectTabsBar
                projectId={projectId}
                licenseCount={licenseCount}
                activationCount={activationCount}
                releaseCount={releaseCount}
              />
            )}
            <div className="breadcrumb">
              <Link to="/">Projects</Link>
              <span>/</span>
              <span>Releases</span>
            </div>
            <div className="section-title">
              <h1>Releases</h1>
              <span className="section-pill">Updates</span>
            </div>
          </div>
          <p>Publish stable, beta, or hotfix versions and assets.</p>
        </div>
      </section>

      <section className="grid">
        <div className="card span-2">
          <div className="card-header">
            <div>
              <h2>New release</h2>
              <span className="muted">Upload a build or publish metadata only.</span>
            </div>
          </div>
          <div className="release-form">
            <label className="field">
              <span>Version</span>
              <input
                type="text"
                value={releaseVersion}
                onChange={(event) => setReleaseVersion(event.target.value)}
                placeholder="1.0.0"
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={releaseStatus}
                onChange={(event) => setReleaseStatus(event.target.value as typeof releaseStatus)}
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </label>
            <label className="field">
              <span>Channel</span>
              <select
                value={releaseChannel}
                onChange={(event) => setReleaseChannel(event.target.value)}
                disabled={releaseStatus === 'draft'}
              >
                <option value="stable">Stable</option>
                <option value="beta">Beta</option>
                <option value="hotfix">Hotfix</option>
              </select>
            </label>
            <label className="field wide">
              <span>Notes</span>
              <input
                type="text"
                value={releaseNotes}
                onChange={(event) => setReleaseNotes(event.target.value)}
                placeholder="Release notes"
              />
            </label>
            <label className="field wide">
              <span>Asset file</span>
              <input
                type="file"
                onChange={(event) => setReleaseFile(event.target.files?.[0] ?? null)}
              />
              <span className="muted">Leave empty to create a metadata-only release.</span>
            </label>
            <button className="primary" onClick={handleCreateRelease}>
              Create release
            </button>
          </div>
        </div>
        <div className="card span-2">
          <div className="card-header">
            <div>
              <h2>Release history</h2>
              <span className="muted">Most recent releases across channels.</span>
            </div>
            <button className="ghost" onClick={() => loadReleases(projectId)}>
              Reload
            </button>
          </div>
          <div className="toolbar">
            <div className="toolbar-row">
              <label className="field">
                <span>Search</span>
                <input
                  type="text"
                  value={releaseQuery}
                  onChange={(event) => {
                    setReleaseQuery(event.target.value)
                    setReleasePage(1)
                  }}
                  placeholder="Version or notes"
                />
              </label>
              <label className="field">
                <span>Channel</span>
                <select
                  value={releaseChannelFilter}
                  onChange={(event) => {
                    setReleaseChannelFilter(event.target.value as typeof releaseChannelFilter)
                    setReleasePage(1)
                  }}
                >
                  <option value="all">All</option>
                  <option value="stable">Stable</option>
                  <option value="beta">Beta</option>
                  <option value="hotfix">Hotfix</option>
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={releaseStatusFilter}
                  onChange={(event) => {
                    setReleaseStatusFilter(event.target.value as typeof releaseStatusFilter)
                    setReleasePage(1)
                  }}
                >
                  <option value="all">All</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              </label>
              <label className="field">
                <span>Sort</span>
                <select
                  value={releaseSort}
                  onChange={(event) => setReleaseSort(event.target.value as typeof releaseSort)}
                >
                  <option value="published_desc">Newest</option>
                  <option value="published_asc">Oldest</option>
                </select>
              </label>
              <label className="field">
                <span>Rows</span>
                <select
                  value={releasePageSize}
                  onChange={(event) => {
                    setReleasePageSize(Number(event.target.value))
                    setReleasePage(1)
                  }}
                >
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={48}>48</option>
                </select>
              </label>
            </div>
            <div className="toolbar-row">
              <span className="muted">
                Showing {Math.min(releaseStart + 1, totalReleases)}-
                {Math.min(releaseStart + pagedReleases.length, totalReleases)} of {totalReleases}
              </span>
              <div className="pagination">
                <button
                  className="ghost"
                  onClick={() => setReleasePage((prev) => Math.max(1, prev - 1))}
                  disabled={currentReleasePage === 1}
                >
                  Prev
                </button>
                <span className="muted">
                  Page {currentReleasePage} / {totalReleasePages}
                </span>
                <button
                  className="ghost"
                  onClick={() => setReleasePage((prev) => Math.min(totalReleasePages, prev + 1))}
                  disabled={currentReleasePage === totalReleasePages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          <div className="release-grid">
            {pagedReleases.map((release) => (
              <div key={release.id} className="release">
                <div className="release-badges">
                  <div className={`release-tag ${release.status}`}>{release.status}</div>
                  {release.channel && <div className={`release-tag ${release.channel}`}>{release.channel}</div>}
                </div>
                <strong>{release.version}</strong>
                <span className="muted">{release.notes ?? 'No notes'}</span>
                <span className="muted">{formatReleaseDate(release.published_at)}</span>
                {release.asset ? (
                  <span className="muted">Asset: {release.asset.filename}</span>
                ) : (
                  <span className="muted">No asset</span>
                )}
                <div className="release-actions">
                  {release.asset?.download_url && (
                    <button className="ghost" onClick={() => handleDownload(release.asset!.download_url)}>
                      Download
                    </button>
                  )}
                  <button className="ghost" onClick={() => navigate(`/projects/${projectId}/releases/${release.id}`)}>
                    Details
                  </button>
                  {release.status === 'draft' && (
                    <button className="ghost" onClick={() => handlePublishRelease(release.id)}>
                      Publish
                    </button>
                  )}
                  {release.status === 'published' && (
                    <button className="ghost" onClick={() => handleDeprecateRelease(release.id)}>
                      Deprecate
                    </button>
                  )}
                  {release.status === 'deprecated' && (
                    <button className="ghost" onClick={() => handlePublishRelease(release.id)}>
                      Re-publish
                    </button>
                  )}
                </div>
              </div>
            ))}
            {pagedReleases.length === 0 && <div className="empty">No releases yet.</div>}
          </div>
          {releaseError && <div className="error">{releaseError}</div>}
        </div>
      </section>
    </div>
  )
}

function ReleaseDetailSection() {
  const { projectId, releaseId } = useParams()
  const { licenseCount, activationCount, releaseCount } =
    useOutletContext<ProjectNavContext>()
  const [release, setRelease] = useState<Release | null>(null)
  const [promoteChannel, setPromoteChannel] = useState<'stable' | 'beta' | 'hotfix'>('stable')
  const [error, setError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const loadRelease = async () => {
    if (!projectId || !releaseId) return
    try {
      const data = await fetchJson<Release>(`${API_BASE}/projects/${projectId}/releases/${releaseId}`)
      setRelease(data)
    } catch {
      setError('Unable to load release.')
    }
  }

  const handlePublish = async () => {
    if (!projectId || !releaseId) return
    setError(null)
    try {
      await fetchJson<Release>(`${API_BASE}/projects/${projectId}/releases/${releaseId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: promoteChannel, status: 'published' }),
      })
      await loadRelease()
    } catch {
      setError('Unable to publish release.')
    }
  }

  const handleDeprecate = async () => {
    if (!projectId || !releaseId) return
    setError(null)
    try {
      await fetchJson<Release>(`${API_BASE}/projects/${projectId}/releases/${releaseId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deprecated' }),
      })
      await loadRelease()
    } catch {
      setError('Unable to deprecate release.')
    }
  }

  const formatReleaseDate = (value?: string) => {
    if (!value) return 'Not published'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'n/a'
    return date.toLocaleDateString()
  }

  const handleDownload = async () => {
    if (!release?.asset?.download_url) return
    setDownloadError(null)
    try {
      await downloadWithAuth(release.asset.download_url)
    } catch {
      setDownloadError('Download failed. Sign in required.')
    }
  }

  useEffect(() => {
    void loadRelease()
  }, [projectId, releaseId])

  if (!projectId || !releaseId) return null

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
            {projectId && (
              <ProjectTabsBar
                projectId={projectId}
                licenseCount={licenseCount}
                activationCount={activationCount}
                releaseCount={releaseCount}
              />
            )}
            <div className="breadcrumb">
              <Link to="/">Projects</Link>
              <span>/</span>
              <Link to={`/projects/${projectId}/releases`}>Releases</Link>
              <span>/</span>
              <span>Details</span>
            </div>
            <div className="section-title">
              <h1>Release details</h1>
              <span className="section-pill">Updates</span>
            </div>
          </div>
          <p>Inspect asset metadata, publish drafts, or deprecate releases.</p>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Release info</h2>
              <span className="muted">Version and publishing status.</span>
            </div>
          </div>
          {release ? (
            <div className="form">
              <div className="release-badges">
                <div className={`release-tag ${release.status}`}>{release.status}</div>
                {release.channel && <div className={`release-tag ${release.channel}`}>{release.channel}</div>}
              </div>
              <div className="stat-line">
                <span>Version</span>
                <strong>{release.version}</strong>
              </div>
              <div className="stat-line">
                <span>Channel</span>
                <strong>{release.channel ?? 'n/a'}</strong>
              </div>
              <div className="stat-line">
                <span>Published</span>
                <strong>{formatReleaseDate(release.published_at)}</strong>
              </div>
              <div className="stat-line">
                <span>Status</span>
                <strong>{release.status}</strong>
              </div>
              <div className="stat-line">
                <span>Notes</span>
                <strong>{release.notes ?? 'No notes'}</strong>
              </div>
            </div>
          ) : (
            <div className="empty">Loading release...</div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2>Asset</h2>
              <span className="muted">Download and checksum.</span>
            </div>
          </div>
          {release?.asset ? (
            <div className="form">
              <div className="stat-line">
                <span>Filename</span>
                <strong>{release.asset.filename}</strong>
              </div>
              <div className="stat-line">
                <span>Size</span>
                <strong>{release.asset.size_bytes.toLocaleString()} bytes</strong>
              </div>
              <div className="stat-line">
                <span>SHA256</span>
                <strong>{release.asset.sha256.slice(0, 12)}...</strong>
              </div>
              <button className="primary" onClick={handleDownload}>
                Download asset
              </button>
              {downloadError && <div className="error">{downloadError}</div>}
            </div>
          ) : (
            <div className="empty">No asset attached.</div>
          )}
        </div>

        <div className="card span-2">
          <div className="card-header">
            <div>
              <h2>Publish / deprecate</h2>
              <span className="muted">Publish to a channel or mark as deprecated.</span>
            </div>
          </div>
          <div className="form">
            <label className="field">
              <span>Publish channel</span>
              <select
                value={promoteChannel}
                onChange={(event) => setPromoteChannel(event.target.value as typeof promoteChannel)}
              >
                <option value="stable">Stable</option>
                <option value="beta">Beta</option>
                <option value="hotfix">Hotfix</option>
              </select>
            </label>
            <div className="row-actions">
              <button className="primary" onClick={handlePublish}>
                Publish
              </button>
              {release?.status === 'published' && (
                <button className="ghost" onClick={handleDeprecate}>
                  Deprecate
                </button>
              )}
              <Link className="ghost" to={`/projects/${projectId}/releases`}>
                Back to releases
              </Link>
            </div>
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      </section>
    </div>
  )
}

function SettingsSection() {
  const location = useLocation()
  const activeSettings =
    location.hash === '#user-profile'
      ? 'user'
      : location.hash === '#smtp'
        ? 'smtp'
        : 'plans'
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'user' | 'admin'>('user')
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [plans, setPlans] = useState<Plan[]>([])
  const [planName, setPlanName] = useState('')
  const [planMax, setPlanMax] = useState('1')
  const [planGrace, setPlanGrace] = useState('7')
  const [planDuration, setPlanDuration] = useState('365')
  const [planChannels, setPlanChannels] = useState<string[]>(['stable'])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [planMessage, setPlanMessage] = useState<string | null>(null)

  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpFromEmail, setSmtpFromEmail] = useState('')
  const [smtpFromName, setSmtpFromName] = useState('')
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpHasPassword, setSmtpHasPassword] = useState(false)
  const [smtpVerified, setSmtpVerified] = useState(false)
  const [smtpVerifiedAt, setSmtpVerifiedAt] = useState<string | null>(null)
  const [smtpCode, setSmtpCode] = useState('')
  const [smtpMessage, setSmtpMessage] = useState<string | null>(null)
  const [smtpError, setSmtpError] = useState<string | null>(null)
  const [smtpLoaded, setSmtpLoaded] = useState(false)

  const channels = ['stable', 'beta', 'hotfix']

  const loadProfile = async () => {
    const data = await fetchJson<UserProfile>(`${API_BASE}/auth/me`)
    setProfile(data)
    setProfileName(data.name)
    setProfileEmail(data.email)
  }

  const loadPlans = async () => {
    const data = await fetchJson<Plan[]>(`${API_BASE}/plans`)
    setPlans(data)
    if (!selectedPlanId && data[0]) {
      setSelectedPlanId(data[0].id)
    }
  }

  const handleSaveProfile = async () => {
    setProfileMessage(null)
    try {
      const payload: { name?: string; email?: string; password?: string } = {}
      if (profileName.trim()) payload.name = profileName.trim()
      if (profileEmail.trim()) payload.email = profileEmail.trim()
      if (profilePassword.trim()) payload.password = profilePassword.trim()
      const data = await fetchJson<UserProfile>(`${API_BASE}/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setProfile(data)
      setProfilePassword('')
      setProfileMessage('Profile updated.')
    } catch {
      setProfileMessage('Unable to update profile.')
    }
  }

  const handleCreatePlan = async () => {
    setPlanMessage(null)
    try {
      const payload = {
        name: planName.trim(),
        allowed_channels: planChannels,
        max_activations_default: Number(planMax),
        grace_period_days: Number(planGrace),
        duration_days_default: planDuration ? Number(planDuration) : undefined,
      }
      const data = await fetchJson<Plan>(`${API_BASE}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setPlans((prev) => [...prev, data])
      setPlanName('')
      setPlanMessage('Plan created.')
    } catch (error) {
      if (error instanceof Error && error.message.includes('409')) {
        setPlanMessage('Plan name already exists.')
        return
      }
      setPlanMessage('Unable to create plan.')
    }
  }

  const handleUpdatePlan = async () => {
    if (!selectedPlanId) return
    setPlanMessage(null)
    try {
      const payload = {
        name: planName.trim() || undefined,
        allowed_channels: planChannels,
        max_activations_default: Number(planMax),
        grace_period_days: Number(planGrace),
        duration_days_default: planDuration ? Number(planDuration) : undefined,
      }
      const data = await fetchJson<Plan>(`${API_BASE}/plans/${selectedPlanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setPlans((prev) => prev.map((plan) => (plan.id === data.id ? data : plan)))
      setPlanMessage('Plan updated.')
    } catch {
      setPlanMessage('Unable to update plan.')
    }
  }

  const handleDeletePlan = async (planId: string) => {
    setPlanMessage(null)
    try {
      await fetchJson<{ deleted: boolean }>(`${API_BASE}/plans/${planId}`, { method: 'DELETE' })
      setPlans((prev) => prev.filter((plan) => plan.id !== planId))
      if (selectedPlanId === planId) {
        setSelectedPlanId('')
      }
      setPlanMessage('Plan deleted.')
    } catch {
      setPlanMessage('Unable to delete plan.')
    }
  }

  const toggleChannel = (channel: string) => {
    setPlanChannels((prev) =>
      prev.includes(channel) ? prev.filter((item) => item !== channel) : [...prev, channel],
    )
  }

  const handleCreateUser = async () => {
    setInviteMessage(null)
    setInviteError(null)
    try {
      const payload = {
        name: inviteName.trim() || undefined,
        email: inviteEmail.trim(),
        role: inviteRole,
      }
      const data = await fetchJson<{ invite_expires_at: string }>(`${API_BASE}/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setInviteName('')
      setInviteEmail('')
      setInviteRole('user')
      setInviteMessage(`Invite sent. Expires ${new Date(data.invite_expires_at).toLocaleString()}.`)
    } catch (error) {
      if (error instanceof Error) {
        setInviteError(`Unable to add user (${error.message}).`)
        return
      }
      setInviteError('Unable to add user.')
    }
  }

  const loadSmtp = async () => {
    try {
      const data = await fetchJson<SmtpSettings | null>(`${API_BASE}/smtp/settings`)
      if (!data) {
        setSmtpHost('')
        setSmtpPort('587')
        setSmtpUsername('')
        setSmtpFromEmail('')
        setSmtpFromName('')
        setSmtpSecure(false)
        setSmtpHasPassword(false)
        setSmtpVerified(false)
        setSmtpVerifiedAt(null)
      } else {
        setSmtpHost(data.host)
        setSmtpPort(String(data.port))
        setSmtpUsername(data.username)
        setSmtpFromEmail(data.from_email)
        setSmtpFromName(data.from_name ?? '')
        setSmtpSecure(Boolean(data.secure))
        setSmtpHasPassword(Boolean(data.has_password))
        setSmtpVerified(Boolean(data.verified))
        setSmtpVerifiedAt(data.verified_at ?? null)
      }
      setSmtpError(null)
      setSmtpLoaded(true)
    } catch (error) {
      if (error instanceof Error) {
        setSmtpError(`Unable to load SMTP settings (${error.message}).`)
      } else {
        setSmtpError('Unable to load SMTP settings.')
      }
    }
  }

  const handleSaveSmtp = async (sendTest: boolean) => {
    setSmtpMessage(null)
    setSmtpError(null)
    const payload = {
      host: smtpHost.trim(),
      port: Number(smtpPort),
      username: smtpUsername.trim(),
      password: smtpPassword.trim() || undefined,
      from_email: smtpFromEmail.trim(),
      from_name: smtpFromName.trim() || undefined,
      secure: smtpSecure,
    }
    try {
      await fetchJson<SmtpSettings>(`${API_BASE}/smtp/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSmtpPassword('')
      setSmtpHasPassword(true)
      setSmtpVerified(false)
      setSmtpVerifiedAt(null)
      if (sendTest) {
        await fetchJson<{ sent: boolean }>(`${API_BASE}/smtp/test`, {
          method: 'POST',
        })
        setSmtpMessage('Settings saved. Verification code sent to admin.')
      } else {
        setSmtpMessage('SMTP settings saved.')
      }
    } catch (error) {
      if (error instanceof Error) {
        setSmtpError(`Unable to save SMTP settings (${error.message}).`)
        return
      }
      setSmtpError('Unable to save SMTP settings.')
    }
  }

  const handleVerifySmtp = async () => {
    setSmtpMessage(null)
    setSmtpError(null)
    try {
      const res = await fetchJson<{ verified: boolean }>(`${API_BASE}/smtp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: smtpCode.trim() }),
      })
      if (res.verified) {
        setSmtpVerified(true)
        setSmtpVerifiedAt(new Date().toISOString())
        setSmtpCode('')
        setSmtpMessage('SMTP verified.')
      }
    } catch (error) {
      if (error instanceof Error) {
        setSmtpError(`Unable to verify SMTP (${error.message}).`)
        return
      }
      setSmtpError('Unable to verify SMTP.')
    }
  }

  useEffect(() => {
    void loadProfile()
    void loadPlans()
  }, [])

  useEffect(() => {
    if (activeSettings !== 'smtp') return
    if (smtpLoaded) return
    void loadSmtp()
  }, [activeSettings, smtpLoaded])

  useEffect(() => {
    const selected = plans.find((plan) => plan.id === selectedPlanId)
    if (!selected) return
    setPlanName(selected.name)
    setPlanChannels(selected.allowed_channels)
    setPlanMax(String(selected.max_activations_default))
    setPlanGrace(String(selected.grace_period_days))
    setPlanDuration(
      selected.duration_days_default && selected.duration_days_default > 0
        ? String(selected.duration_days_default)
        : '',
    )
  }, [selectedPlanId, plans])

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="breadcrumb">
            <Link to="/">Projects</Link>
            <span>/</span>
            <span>Settings</span>
          </div>
          <h1>Settings</h1>
          <p>Manage your profile and customize licensing plans.</p>
        </div>
      </section>

      <section className={`grid settings-grid ${activeSettings !== 'user' ? 'single' : ''}`}>
        {activeSettings === 'user' && (
          <div className="card" id="user-profile">
            <div className="card-header">
              <div>
                <h2>User profile</h2>
                <span className="muted">Signed in as {profile?.role ?? 'user'}.</span>
              </div>
            </div>
            <div className="form">
              <label className="field">
                <span>Name</span>
                <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
              </label>
              <label className="field">
                <span>Email</span>
                <input value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
              </label>
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  value={profilePassword}
                  onChange={(event) => setProfilePassword(event.target.value)}
                  placeholder="Leave blank to keep"
                />
              </label>
              <button className="primary" onClick={handleSaveProfile}>
                Save profile
              </button>
              {profileMessage && <div className="notice">{profileMessage}</div>}
            </div>
            {profile?.role === 'admin' && (
              <div className="form invite-form">
              <div className="subsection-title">
                <h3>Add user</h3>
                <span className="muted">Send a one-hour invite with a temporary password.</span>
              </div>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    placeholder="New user"
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="user@example.com"
                  />
                </label>
                <label className="field">
                  <span>Role</span>
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as 'user' | 'admin')}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button className="primary" onClick={handleCreateUser} disabled={!inviteEmail.trim()}>
                  Send invite
                </button>
                {inviteError && <div className="error">{inviteError}</div>}
                {inviteMessage && <div className="notice">{inviteMessage}</div>}
              </div>
            )}
          </div>
        )}

        {activeSettings === 'plans' && (
          <div className="card span-2" id="plans">
            <div className="card-header">
              <div>
                <h2>Plans</h2>
                <span className="muted">Customize licensing tiers and rules.</span>
              </div>
            </div>
            <div className="plan-grid">
              <div className="plan-form">
                <label className="field">
                  <span>Select plan</span>
                  <select
                    value={selectedPlanId}
                    onChange={(event) => setSelectedPlanId(event.target.value)}
                  >
                    <option value="">New plan</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Plan name</span>
                  <input value={planName} onChange={(event) => setPlanName(event.target.value)} />
                </label>
                <label className="field">
                  <span>Max activations</span>
                  <input
                    type="number"
                    min={0}
                    value={planMax}
                    onChange={(event) => setPlanMax(event.target.value)}
                    placeholder="0 = unlimited"
                  />
                </label>
                <label className="field">
                  <span>Grace period (days)</span>
                  <input
                    type="number"
                    value={planGrace}
                    onChange={(event) => setPlanGrace(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>License duration (days)</span>
                  <input
                    type="number"
                    value={planDuration}
                    onChange={(event) => setPlanDuration(event.target.value)}
                    placeholder="0 = unlimited"
                  />
                </label>
                <div className="field">
                  <span>Allowed channels</span>
                  <div className="chip-row">
                    {channels.map((channel) => (
                      <button
                        key={channel}
                        className={`chip ${planChannels.includes(channel) ? 'active' : ''}`}
                        onClick={() => toggleChannel(channel)}
                        type="button"
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="primary" onClick={handleCreatePlan}>
                    Create
                  </button>
                  <button className="ghost" onClick={handleUpdatePlan}>
                    Update
                  </button>
                </div>
                {planMessage && <div className="notice">{planMessage}</div>}
              </div>
              <div className="plan-list">
                {plans.map((plan) => (
                  <div key={plan.id} className="plan-card">
                    <div>
                      <strong>{plan.name}</strong>
                      <span className="muted">
                        Channels: {plan.allowed_channels.join(', ')}
                      </span>
                    </div>
                    <div className="plan-meta">
                      <span>
                        {plan.max_activations_default === 0
                          ? 'Unlimited devices'
                          : `${plan.max_activations_default} devices`}
                      </span>
                      <span>{plan.grace_period_days} days grace</span>
                      <span>
                        {plan.duration_days_default && plan.duration_days_default > 0
                          ? `${plan.duration_days_default} days duration`
                          : 'No expiry'}
                      </span>
                    </div>
                    <button className="ghost danger" onClick={() => handleDeletePlan(plan.id)}>
                      Delete
                    </button>
                  </div>
                ))}
                {plans.length === 0 && <div className="empty">No plans yet.</div>}
              </div>
            </div>
          </div>
        )}

        {activeSettings === 'smtp' && (
          <div className="card span-2" id="smtp">
            <div className="card-header">
              <div>
                <h2>SMTP settings</h2>
                <span className="muted">Configure outbound email delivery.</span>
              </div>
            </div>
            <div className="form">
              <div className="status-indicator">
                <span className={`status-dot ${smtpVerified ? 'ok' : 'offline'}`} />
                <span>{smtpVerified ? 'Verified' : 'Not verified'}</span>
                {smtpVerifiedAt && (
                  <span className="muted">Verified {new Date(smtpVerifiedAt).toLocaleString()}</span>
                )}
              </div>
              <label className="field">
                <span>SMTP host</span>
                <input value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} />
              </label>
              <label className="field">
                <span>SMTP port</span>
                <input
                  type="number"
                  min={1}
                  value={smtpPort}
                  onChange={(event) => setSmtpPort(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Username</span>
                <input value={smtpUsername} onChange={(event) => setSmtpUsername(event.target.value)} />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={smtpPassword}
                  onChange={(event) => setSmtpPassword(event.target.value)}
                  placeholder={smtpHasPassword ? 'Saved (enter to replace)' : ''}
                />
              </label>
              <label className="field">
                <span>From email</span>
                <input value={smtpFromEmail} onChange={(event) => setSmtpFromEmail(event.target.value)} />
              </label>
              <label className="field">
                <span>From name</span>
                <input value={smtpFromName} onChange={(event) => setSmtpFromName(event.target.value)} />
              </label>
              <label className="field">
                <span>Secure (TLS)</span>
                <select
                  value={smtpSecure ? 'true' : 'false'}
                  onChange={(event) => setSmtpSecure(event.target.value === 'true')}
                >
                  <option value="false">STARTTLS</option>
                  <option value="true">SSL/TLS</option>
                </select>
              </label>
              <div className="row-actions">
                <button className="primary" onClick={() => handleSaveSmtp(true)}>
                  Save & send test
                </button>
                <button className="ghost" onClick={() => handleSaveSmtp(false)}>
                  Save only
                </button>
              </div>
              {!smtpVerified && (
                <div className="field-inline">
                  <input
                    type="text"
                    value={smtpCode}
                    onChange={(event) => setSmtpCode(event.target.value)}
                    placeholder="Verification code"
                  />
                  <button className="ghost" onClick={handleVerifySmtp} disabled={!smtpCode.trim()}>
                    Verify
                  </button>
                </div>
              )}
              {smtpError && <div className="error">{smtpError}</div>}
              {smtpMessage && <div className="notice">{smtpMessage}</div>}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/invite" element={<InviteAccept />} />
        <Route
          path="/*"
          element={
            <LoginGate>
              <Routes>
                <Route path="/" element={<ProjectsHome />} />
                <Route path="/settings" element={<SettingsSection />} />
                <Route path="/projects/:projectId" element={<ProjectLayout />}>
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<OverviewSection />} />
                  <Route path="modules" element={<ModulesSection />} />
                  <Route path="licenses" element={<LicensesSection />} />
                  <Route path="activations" element={<ActivationsSection />} />
                  <Route path="releases" element={<ReleasesSection />} />
                  <Route path="releases/:releaseId" element={<ReleaseDetailSection />} />
                </Route>
              </Routes>
            </LoginGate>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App






