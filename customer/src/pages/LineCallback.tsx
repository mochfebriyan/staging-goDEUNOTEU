import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../components/ui'
import { finishLineLogin } from '../lib/lineLogin'

// LINE redirects here after the customer approves the login.
export default function LineCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // StrictMode runs effects twice; a LINE code can only be used once.
    if (started.current) return
    started.current = true
    finishLineLogin(window.location.search).then((err) => {
      if (err) setError(err)
      else navigate('/id?tab=profile', { replace: true })
    })
  }, [navigate])

  return (
    <div className="mx-auto max-w-md">
      <Card className="text-center">
        {error ? (
          <>
            <p className="text-sm font-semibold text-rose-700">Login LINE gagal</p>
            <p className="mt-2 text-sm break-words text-slate-600">{error}</p>
            <Link to="/id?tab=profile" className="mt-4 inline-block text-sm font-medium text-rose-600 hover:underline">
              Kembali ke Profil
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-600">Menyambungkan akun LINE…</p>
        )}
      </Card>
    </div>
  )
}
