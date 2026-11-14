import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './context/AppContext'
import { AppLayout } from './components/AppLayout'
import { Toaster } from './components/ui'
import Landing from './pages/Landing'
import { Login, Signup } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import SearchPage from './pages/Search'
import ProductDetail from './pages/ProductDetail'
import ComparePage from './pages/Compare'
import SavedPage from './pages/Saved'
import ProfilePage from './pages/Profile'
import NotFound from './pages/NotFound'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, authStatus } = useApp()
  const location = useLocation()
  // While a stored session is being checked, wait instead of bouncing to the login page
  if (authStatus === 'checking') {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50" role="status" aria-live="polite">
        <div className="flex items-center gap-2.5 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-navy-800" /> Restoring your session…
        </div>
      </div>
    )
  }
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  return <>{children}</>
}

function ScrollToHash() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    } else if (!pathname.startsWith('/app')) {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToHash />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="products/:slug" element={<ProductDetail />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  )
}
