import React, { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

function getAuthModeFromUrl() {
  return new URLSearchParams(window.location.search).get('auth')
}

function clearAuthCallbackUrl() {
  window.history.replaceState({}, document.title, window.location.pathname)
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState(() => getAuthModeFromUrl())

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!mounted) return
        setUser(session?.user || null)

        if (session?.user && getAuthModeFromUrl() === 'confirmed') {
          clearAuthCallbackUrl()
          setAuthMode(null)
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      setUser(session?.user || null)
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('recovery')
      } else if (session?.user && getAuthModeFromUrl() === 'confirmed') {
        clearAuthCallbackUrl()
        setAuthMode(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setAuthMode(null)
  }

  function handlePasswordUpdated() {
    clearAuthCallbackUrl()
    setAuthMode(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Carregando seu workspace…</p>
        </div>
      </div>
    )
  }

  if (authMode === 'recovery') {
    return (
      <Login
        onLogin={setUser}
        initialMode="recovery"
        onPasswordUpdated={handlePasswordUpdated}
      />
    )
  }

  return user ? (
    <Dashboard user={user} onLogout={handleLogout} />
  ) : (
    <Login onLogin={setUser} />
  )
}

export default App
