
import { useEffect, useMemo, useState } from 'react'
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api/v1'
const API_ORIGIN = API_BASE.replace(/\/api\/v1$/, '')

type ApiStatus = 'idle' | 'loading' | 'ok' | 'error'

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
  expires_at?: string
  created_at: string
}

type Release = {
  id: string
  version: string
  channel: string
  notes?: string
  published_at: string
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
  revoked: boolean
  created_at: string
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

const STORAGE_KEY = 'alure_auth'
const TOKEN_KEY = 'alure_token'

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const token = window.localStorage.getItem(TOKEN_KEY)
  const headers = {
    ...(options?.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await fetch(url, { ...options, headers })
  if (!res.ok) {
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
              <span className="brand-mark">Alure</span>
              <p>Checking server status...</p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="login">
        <div className="login-panel">
          <div className="login-header">
            <span className="brand-mark">Alure</span>
            <p>{hasAdmin ? 'Self-hosted licensing console' : 'Create administrator account'}</p>
          </div>
          <div className="login-status">
            <span className={`status ${backendStatus}`}>{backendStatus === 'online' ? 'API Online' : 'API Offline'}</span>
          </div>
          {hasAdmin ? (
            <form className="login-form" onSubmit={handleLogin}>
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
            <form className="login-form" onSubmit={handleBootstrap}>
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
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Alure</span>
          <span className="brand-subtitle">Licensing and Releases</span>
        </div>
        <div className="topbar-actions">
          <div className="pill">Local SQLite</div>
          <Link className="ghost" to="/settings">
            Settings
          </Link>
          <button className="ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>
      {children}
    </div>
  )
}
function ProjectsHome() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectName, setProjectName] = useState('')
  const [projectError, setProjectError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [projectQuery, setProjectQuery] = useState('')
  const [projectSort, setProjectSort] = useState<'name_asc' | 'name_desc' | 'created_desc' | 'created_asc'>('created_desc')
  const [projectPage, setProjectPage] = useState(1)
  const [projectPageSize, setProjectPageSize] = useState(12)
  const navigate = useNavigate()

  const loadProjects = async () => {
    const data = await fetchJson<Project[]>(`${API_BASE}/projects`)
    setProjects(data)
  }

  useEffect(() => {
    void loadProjects()
  }, [])

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

  const totalProjects = filteredProjects.length
  const totalProjectPages = Math.max(1, Math.ceil(totalProjects / projectPageSize))
  const currentProjectPage = Math.min(projectPage, totalProjectPages)
  const projectStart = (currentProjectPage - 1) * projectPageSize
  const pagedProjects = filteredProjects.slice(projectStart, projectStart + projectPageSize)

  useEffect(() => {
    if (projectPage > totalProjectPages) {
      setProjectPage(totalProjectPages)
    }
  }, [projectPage, totalProjectPages])

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
    } catch (error) {
      if (error instanceof Error && error.message.includes('409')) {
        setProjectError('Project name already exists.')
        return
      }
      setProjectError('Unable to create project.')
    }
  }

  const handleDeleteProjectFromCard = async (project: Project) => {
    const confirmation = window.prompt(
      `Type the project name to delete: ${project.name}`,
    )
    if (confirmation !== project.name) {
      return
    }
    try {
      await fetchJson<{ deleted: boolean }>(`${API_BASE}/projects/${project.id}`, {
        method: 'DELETE',
      })
      await loadProjects()
    } catch {
      setDeleteError('Unable to delete project.')
    }
  }

  return (
    <div className="page">
      <section className="hero wide">
        <div className="hero-copy">
          <h1>Your projects</h1>
          <p>Create and manage desktop apps from one place. Select a project to view licensing and release details.</p>
        </div>
        <div className="hero-panel">
          <div className="panel-header">
            <span>New project</span>
            <span className="pill subtle">Workspace</span>
          </div>
          <div className="panel-body">
            <label className="field">
              <span>Project name</span>
              <input
                type="text"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Desktop Suite"
              />
            </label>
            <button className="primary" onClick={handleCreateProject}>
              Create project
            </button>
            {projectError && <div className="error">{projectError}</div>}
            {deleteError && <div className="error">{deleteError}</div>}
          </div>
        </div>
      </section>

      <section className="project-grid">
        <div className="toolbar span-2">
          <div className="toolbar-row">
            <label className="field">
              <span>Search</span>
              <input
                type="text"
                value={projectQuery}
                onChange={(event) => {
                  setProjectQuery(event.target.value)
                  setProjectPage(1)
                }}
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
            <label className="field">
              <span>Rows</span>
              <select
                value={projectPageSize}
                onChange={(event) => {
                  setProjectPageSize(Number(event.target.value))
                  setProjectPage(1)
                }}
              >
                <option value={6}>6</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
              </select>
            </label>
          </div>
          <div className="toolbar-row">
            <span className="muted">
              Showing {Math.min(projectStart + 1, totalProjects)}-
              {Math.min(projectStart + pagedProjects.length, totalProjects)} of {totalProjects}
            </span>
            <div className="pagination">
              <button
                className="ghost"
                onClick={() => setProjectPage((prev) => Math.max(1, prev - 1))}
                disabled={currentProjectPage === 1}
              >
                Prev
              </button>
              <span className="muted">
                Page {currentProjectPage} / {totalProjectPages}
              </span>
              <button
                className="ghost"
                onClick={() => setProjectPage((prev) => Math.min(totalProjectPages, prev + 1))}
                disabled={currentProjectPage === totalProjectPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
        {pagedProjects.map((project) => (
          <div key={project.id} className="project-card">
            <div>
              <h3>{project.name}</h3>
              <span className="muted">Created {new Date(project.created_at).toLocaleDateString()}</span>
            </div>
            <div className="project-actions">
              <button className="primary" onClick={() => navigate(`/projects/${project.id}`)}>
                Manage
              </button>
              <button
                className="ghost danger"
                onClick={() => handleDeleteProjectFromCard(project)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {pagedProjects.length === 0 && <div className="empty">No projects yet.</div>}
      </section>
    </div>
  )
}

function ProjectLayout() {
  const { projectId } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [licenseCount, setLicenseCount] = useState(0)
  const [releaseCount, setReleaseCount] = useState(0)
  const [activationCount, setActivationCount] = useState(0)

  useEffect(() => {
    if (!projectId) return
    const loadProject = async () => {
      const data = await fetchJson<Project[]>(`${API_BASE}/projects`)
      const found = data.find((item) => item.id === projectId) ?? null
      setProject(found)
    }
    const loadCounts = async () => {
      const [licenses, releases] = await Promise.all([
        fetchJson<License[]>(`${API_BASE}/licenses?project_id=${projectId}`),
        fetchJson<Release[]>(`${API_BASE}/projects/${projectId}/releases`),
      ])
      setLicenseCount(licenses.length)
      setReleaseCount(releases.length)
      if (licenses.length === 0) {
        setActivationCount(0)
        return
      }
      const activationLists = await Promise.all(
        licenses.map((license) =>
          fetchJson<Activation[]>(`${API_BASE}/licenses/${license.license_id}/activations`),
        ),
      )
      setActivationCount(activationLists.reduce((sum, list) => sum + list.length, 0))
    }
    void loadProject()
    void loadCounts()
  }, [projectId])

  if (!projectId) {
    return null
  }

  return (
    <div className="project-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">Project</span>
          <h2>{project?.name ?? projectId}</h2>
          <span className="muted">ID: {projectId.slice(0, 8)}...</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to={`/projects/${projectId}/overview`}>
            Overview
          </NavLink>
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
        <div className="sidebar-footer">
          <Link to="/">Back to projects</Link>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
function OverviewSection() {
  const { projectId } = useParams()
  const [status, setStatus] = useState<ApiStatus>('idle')
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [latestVersion, setLatestVersion] = useState<string>('n/a')
  const [updateAvailable, setUpdateAvailable] = useState<boolean | null>(null)
  const [licenseCount, setLicenseCount] = useState(0)
  const [releaseCount, setReleaseCount] = useState(0)

  const statusLabel = useMemo(() => {
    if (status === 'loading') return 'Checking'
    if (status === 'ok') return 'Online'
    if (status === 'error') return 'Offline'
    return 'Idle'
  }, [status])

  const checkApi = async (id: string) => {
    setStatus('loading')
    try {
      const data = await fetchJson<{ latest_version?: string; update_available?: boolean }>(
        `${API_BASE}/updates/latest?project_id=${encodeURIComponent(id)}&channel=stable`,
      )
      setLatestVersion(data.latest_version ?? 'n/a')
      setUpdateAvailable(Boolean(data.update_available))
      setStatus('ok')
    } catch {
      setLatestVersion('n/a')
      setUpdateAvailable(null)
      setStatus('error')
    } finally {
      setLastCheck(new Date())
    }
  }

  useEffect(() => {
    if (!projectId) return
    void checkApi(projectId)
    const loadCounts = async () => {
      const [licenses, releases] = await Promise.all([
        fetchJson<License[]>(`${API_BASE}/licenses?project_id=${projectId}`),
        fetchJson<Release[]>(`${API_BASE}/projects/${projectId}/releases`),
      ])
      setLicenseCount(licenses.length)
      setReleaseCount(releases.length)
    }
    void loadCounts()
  }, [projectId])

  if (!projectId) return null

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
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
        <div className="hero-panel">
          <div className="panel-header">
            <span>Status</span>
            <span className="pill subtle">API</span>
          </div>
          <div className="panel-body">
            <div className="meta-card">
              <span className="meta-title">API Status</span>
              <span className={`status ${status}`}>{statusLabel}</span>
              <span className="meta-note">
                {lastCheck ? lastCheck.toLocaleTimeString() : 'Not checked'}
              </span>
            </div>
            <div className="meta-card">
              <span className="meta-title">Latest Version</span>
              <span className="meta-value">{latestVersion}</span>
              <span className="meta-note">
                {updateAvailable === null
                  ? 'Unknown'
                  : updateAvailable
                    ? 'Update available'
                    : 'Up to date'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Licenses</h2>
          <p className="muted">Active licenses and limits.</p>
          <div className="stat-line">
            <span>Total licenses</span>
            <strong>{licenseCount}</strong>
          </div>
        </div>
        <div className="card">
          <h2>Releases</h2>
          <p className="muted">Published versions and channels.</p>
          <div className="stat-line">
            <span>Total releases</span>
            <strong>{releaseCount}</strong>
          </div>
        </div>
      </section>
    </div>
  )
}

function LicensesSection() {
  const { projectId } = useParams()
  const [licenses, setLicenses] = useState<License[]>([])
  const [activationCounts, setActivationCounts] = useState<Record<string, number>>({})
  const [plans, setPlans] = useState<Plan[]>([])
  const [licensePlan, setLicensePlan] = useState('basic')
  const [licenseMaxActivations, setLicenseMaxActivations] = useState(1)
  const [licenseDurationDays, setLicenseDurationDays] = useState('')
  const [licenseNotes, setLicenseNotes] = useState('')
  const [lastCreatedKey, setLastCreatedKey] = useState<string | null>(null)
  const [licenseQuery, setLicenseQuery] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<'all' | 'active' | 'revoked'>('all')
  const [licenseSort, setLicenseSort] = useState<'created_desc' | 'created_asc' | 'expires_asc' | 'expires_desc'>('created_desc')
  const [licensePage, setLicensePage] = useState(1)
  const [licensePageSize, setLicensePageSize] = useState(10)
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
        return { id: license.license_id, count: activations.length }
      }),
    )
    const next: Record<string, number> = {}
    counts.forEach((item) => {
      next[item.id] = item.count
    })
    setActivationCounts(next)
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

  const loadPlans = async () => {
    try {
      const data = await fetchJson<Plan[]>(`${API_BASE}/plans`)
      setPlans(data)
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
      }
    } catch {
      return
    }
  }

  useEffect(() => {
    if (!projectId) return
    void loadLicenses(projectId)
    void loadPlans()
  }, [projectId])

  if (!projectId) return null

  const normalizedQuery = licenseQuery.trim().toLowerCase()
  const filteredLicenses = useMemo(() => {
    const filtered = licenses.filter((license) => {
      if (licenseStatus === 'active' && license.revoked) return false
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

  const totalLicenses = filteredLicenses.length
  const totalPages = Math.max(1, Math.ceil(totalLicenses / licensePageSize))
  const currentPage = Math.min(licensePage, totalPages)
  const pageStart = (currentPage - 1) * licensePageSize
  const pagedLicenses = filteredLicenses.slice(pageStart, pageStart + licensePageSize)

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

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
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
          </div>
          <div className="form">
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
        <div className="card span-2">
          <div className="card-header">
            <div>
              <h2>Issued licenses</h2>
              <span className="muted">Open a license to inspect activations.</span>
            </div>
            <button className="ghost" onClick={() => loadLicenses(projectId)}>
              Reload
            </button>
          </div>
          <div className="toolbar">
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
                {Math.min(pageStart + pagedLicenses.length, totalLicenses)} of {totalLicenses}
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
                <span>
                  {(activationCounts[license.license_id] ?? 0)}/
                  {license.max_activations === 0 ? '∞' : license.max_activations}
                </span>
                <span>{license.notes || '-'}</span>
                <span>{license.revoked ? 'Revoked' : 'Active'}</span>
                <span>{new Date(license.created_at).toLocaleDateString()}</span>
                <span>
                  {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Unlimited'}
                </span>
                <div className="row-actions">
                  <button
                    className="ghost"
                    onClick={() => navigate(`/projects/${projectId}/activations?license=${license.license_id}`)}
                  >
                    Activations
                  </button>
                  <button
                    className="ghost danger"
                    onClick={() => handleRevokeLicense(license.license_id)}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {pagedLicenses.length === 0 && <div className="empty">No licenses yet.</div>}
          </div>
        </div>
      </section>
    </div>
  )
}
function ActivationsSection() {
  const { projectId } = useParams()
  const [licenses, setLicenses] = useState<License[]>([])
  const [activations, setActivations] = useState<Activation[]>([])
  const [selectedLicenseId, setSelectedLicenseId] = useState<string>('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [activationQuery, setActivationQuery] = useState('')
  const [activationStatus, setActivationStatus] = useState<'all' | 'active' | 'revoked'>('all')
  const [activationSort, setActivationSort] = useState<'created_desc' | 'created_asc'>('created_desc')
  const [activationPage, setActivationPage] = useState(1)
  const [activationPageSize, setActivationPageSize] = useState(10)

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
      const haystack = `${activation.activation_id} ${activation.device_id_hash}`.toLowerCase()
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
            <div className="table-row table-header">
              <span>ID</span>
              <span>Device Hash</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {pagedActivations.map((activation) => (
              <div key={activation.activation_id} className="table-row">
                <span>{activation.activation_id.slice(0, 8)}...</span>
                <span>{activation.device_id_hash.slice(0, 10)}...</span>
                <span>{activation.revoked ? 'Revoked' : 'Active'}</span>
                <div className="row-actions">
                  <button
                    className="ghost danger"
                    onClick={() => handleRevokeActivation(activation.activation_id)}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {pagedActivations.length === 0 && <div className="empty">No activations.</div>}
          </div>
        </div>
      </section>
    </div>
  )
}

function ReleasesSection() {
  const { projectId } = useParams()
  const [releases, setReleases] = useState<Release[]>([])
  const [releaseVersion, setReleaseVersion] = useState('')
  const [releaseChannel, setReleaseChannel] = useState('stable')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [releaseFile, setReleaseFile] = useState<File | null>(null)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [releaseQuery, setReleaseQuery] = useState('')
  const [releaseChannelFilter, setReleaseChannelFilter] = useState<'all' | 'stable' | 'beta' | 'hotfix'>('all')
  const [releaseSort, setReleaseSort] = useState<'published_desc' | 'published_asc'>('published_desc')
  const [releasePage, setReleasePage] = useState(1)
  const [releasePageSize, setReleasePageSize] = useState(12)
  const navigate = useNavigate()

  const loadReleases = async (id: string) => {
    const data = await fetchJson<Release[]>(`${API_BASE}/projects/${id}/releases`)
    setReleases(data)
  }

  const handlePromoteRelease = async (releaseId: string) => {
    if (!projectId) return
    const channel = window.prompt('Promote to channel (stable/beta/hotfix):', 'stable')
    if (!channel || !['stable', 'beta', 'hotfix'].includes(channel)) return
    await fetchJson<Release>(`${API_BASE}/projects/${projectId}/releases/${releaseId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
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
    if (releaseFile) {
      const formData = new FormData()
      formData.append('file', releaseFile)
      formData.append('version', releaseVersion.trim())
      formData.append('channel', releaseChannel)
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
          version: releaseVersion.trim(),
          channel: releaseChannel,
          notes: releaseNotes.trim() || undefined,
        }),
      })
    }

    setReleaseVersion('')
    setReleaseNotes('')
    setReleaseFile(null)

    await loadReleases(projectId)
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
      if (!normalizedQuery) return true
      const haystack = `${release.version} ${release.notes ?? ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    const sorted = [...filtered].sort((a, b) => {
      if (releaseSort === 'published_asc') {
        return new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
      }
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    })
    return sorted
  }, [releases, releaseChannelFilter, releaseSort, normalizedQuery])

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

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <div className="section-header">
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
              <span>Channel</span>
              <select value={releaseChannel} onChange={(event) => setReleaseChannel(event.target.value)}>
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
              Publish release
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
                <div className={`release-tag ${release.channel}`}>{release.channel}</div>
                <strong>{release.version}</strong>
                <span className="muted">{release.notes ?? 'No notes'}</span>
                <span className="muted">{new Date(release.published_at).toLocaleDateString()}</span>
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
                  <button className="ghost" onClick={() => handlePromoteRelease(release.id)}>
                    Promote
                  </button>
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

  const handlePromote = async () => {
    if (!projectId || !releaseId) return
    setError(null)
    try {
      await fetchJson<Release>(`${API_BASE}/projects/${projectId}/releases/${releaseId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: promoteChannel }),
      })
      await loadRelease()
    } catch {
      setError('Unable to promote release.')
    }
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
          <p>Inspect asset metadata and promote this release to another channel.</p>
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
              <div className="stat-line">
                <span>Version</span>
                <strong>{release.version}</strong>
              </div>
              <div className="stat-line">
                <span>Channel</span>
                <strong>{release.channel}</strong>
              </div>
              <div className="stat-line">
                <span>Published</span>
                <strong>{new Date(release.published_at).toLocaleDateString()}</strong>
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
              <h2>Promote / rollback</h2>
              <span className="muted">Clone this release into another channel.</span>
            </div>
          </div>
          <div className="form">
            <label className="field">
              <span>Target channel</span>
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
              <button className="primary" onClick={handlePromote}>
                Set as latest in channel
              </button>
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
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileMessage, setProfileMessage] = useState<string | null>(null)

  const [plans, setPlans] = useState<Plan[]>([])
  const [planName, setPlanName] = useState('')
  const [planMax, setPlanMax] = useState('1')
  const [planGrace, setPlanGrace] = useState('7')
  const [planDuration, setPlanDuration] = useState('365')
  const [planChannels, setPlanChannels] = useState<string[]>(['stable'])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [planMessage, setPlanMessage] = useState<string | null>(null)

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

  useEffect(() => {
    void loadProfile()
    void loadPlans()
  }, [])

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

      <section className="grid">
        <div className="card">
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
        </div>

        <div className="card span-2">
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
      </section>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <LoginGate>
        <Routes>
          <Route path="/" element={<ProjectsHome />} />
          <Route path="/settings" element={<SettingsSection />} />
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewSection />} />
            <Route path="licenses" element={<LicensesSection />} />
            <Route path="activations" element={<ActivationsSection />} />
            <Route path="releases" element={<ReleasesSection />} />
            <Route path="releases/:releaseId" element={<ReleaseDetailSection />} />
          </Route>
        </Routes>
      </LoginGate>
    </BrowserRouter>
  )
}

export default App
