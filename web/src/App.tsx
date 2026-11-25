import type { ReactNode } from 'react'
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import SignIn from './pages/SignIn'
import Projects from './pages/Projects'
import NewProject from './pages/NewProject'
import ProjectSettings from './pages/ProjectSettings'

import { LOGO_URL } from './lib/format'

// Hash router: GitHub Pages can't serve deep links, so routes live after /#/.
export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/sign-in" element={<SignInRoute />} />
          <Route path="/" element={<RequireAuth><Projects /></RequireAuth>} />
          <Route path="/projects/new" element={<RequireAuth><NewProject /></RequireAuth>} />
          <Route
            path="/projects/:projectId/settings/:section?"
            element={<RequireAuth><ProjectSettings /></RequireAuth>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}

function SignInRoute() {
  const { session, loading } = useAuth()
  if (loading) return <p className="loading">Loading…</p>
  return session ? <Navigate to="/" replace /> : <SignIn />
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <p className="loading">Loading…</p>
  if (!session) return <Navigate to="/sign-in" replace />
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <img src={LOGO_URL} alt="" />
          ChooseTogether
        </Link>
        <span className="who">{session.user.email}</span>
        <button className="textbtn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {children}
    </>
  )
}
