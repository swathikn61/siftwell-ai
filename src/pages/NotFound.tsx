import { Link } from 'react-router-dom'
import { Logo } from '../components/ui'

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="text-center">
        <Logo />
        <p className="mt-10 text-sm font-semibold text-navy-700">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-2 text-slate-500">The page you’re looking for doesn’t exist or has moved.</p>
        <div className="mt-8 flex justify-center gap-2">
          <Link to="/" className="btn-secondary">Go home</Link>
          <Link to="/app" className="btn-primary">Open dashboard</Link>
        </div>
      </div>
    </div>
  )
}
