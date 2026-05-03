import { createContext, useContext, useState, useCallback } from 'react'
import { USERS } from '../data/users'
import { SERVERS } from '../data/servers'
import { DUMMY_DATASETS } from '../data/dummyDatasets'

const AppContext = createContext(null)

const STORAGE_KEY = 'tarcinapp_prefs'

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable — silently ignore
  }
}

export function AppProvider({ children }) {
  const prefs = loadPrefs()

  const [selectedUserId, setSelectedUserIdRaw] = useState(
    prefs.userId ?? USERS[0].id
  )
  const [selectedServerUrl, setSelectedServerUrlRaw] = useState(
    prefs.serverUrl ?? SERVERS[0].url
  )
  const [selectedDatasetKey, setSelectedDatasetKeyRaw] = useState(
    prefs.datasetKey ?? Object.keys(DUMMY_DATASETS)[0]
  )
  // When useDummyData is true the API client returns dummy data instead of hitting the real server
  const [useDummyData, setUseDummyDataRaw] = useState(
    prefs.useDummyData ?? false
  )

  const setSelectedUserId = useCallback((id) => {
    setSelectedUserIdRaw(id)
    savePrefs({ ...loadPrefs(), userId: id })
  }, [])

  const setSelectedServerUrl = useCallback((url) => {
    setSelectedServerUrlRaw(url)
    savePrefs({ ...loadPrefs(), serverUrl: url })
  }, [])

  const setSelectedDatasetKey = useCallback((key) => {
    setSelectedDatasetKeyRaw(key)
    savePrefs({ ...loadPrefs(), datasetKey: key })
  }, [])

  const setUseDummyData = useCallback((val) => {
    setUseDummyDataRaw(val)
    savePrefs({ ...loadPrefs(), useDummyData: val })
  }, [])

  const currentUser = USERS.find((u) => u.id === selectedUserId) ?? USERS[0]
  const currentServer = SERVERS.find((s) => s.url === selectedServerUrl) ?? SERVERS[0]
  const currentDataset = DUMMY_DATASETS[selectedDatasetKey]

  return (
    <AppContext.Provider
      value={{
        // Users
        users: USERS,
        selectedUserId,
        setSelectedUserId,
        currentUser,
        // Servers
        servers: SERVERS,
        selectedServerUrl,
        setSelectedServerUrl,
        currentServer,
        // Dummy data
        datasets: DUMMY_DATASETS,
        selectedDatasetKey,
        setSelectedDatasetKey,
        currentDataset,
        useDummyData,
        setUseDummyData,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
