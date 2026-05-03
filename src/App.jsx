import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import EntitiesPage from './pages/EntitiesPage'
import ListsPage from './pages/ListsPage'
import EntityReactionsPage from './pages/EntityReactionsPage'
import ListReactionsPage from './pages/ListReactionsPage'
import RelationsPage from './pages/RelationsPage'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/entities" element={<EntitiesPage />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/entity-reactions" element={<EntityReactionsPage />} />
            <Route path="/list-reactions" element={<ListReactionsPage />} />
            <Route path="/relations" element={<RelationsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
