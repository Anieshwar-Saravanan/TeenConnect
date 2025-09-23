import React, { createContext, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import TeenDashboard from './pages/TeenDashboard'
import MentorDashboard from './pages/MentorDashboard'
import Chat from './components/Chat'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import About from './pages/About'
import Privacy from './pages/Privacy'

export const AuthContext = createContext()

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tc_user')) || null
    } catch (e) {
      return null
    }
  })

  useEffect(() => {
    if (user) localStorage.setItem('tc_user', JSON.stringify(user))
    else localStorage.removeItem('tc_user')
  }, [user])

  // Seed demo data (users, mentors, issues, messages) once when the app mounts
  useEffect(() => {
    const existingUsers = JSON.parse(localStorage.getItem('tc_users') || '[]')
    const existingMentors = JSON.parse(localStorage.getItem('tc_mentors') || '[]')
    const existingIssues = JSON.parse(localStorage.getItem('tc_issues') || '[]')
    const existingMessages = JSON.parse(localStorage.getItem('tc_messages') || '{}')

    if (existingUsers.length === 0) {
      const teenId = 'u_demo_teen'
      const issueId = 'iss_demo'

      const demoUsers = [
        { id: teenId, name: 'Demo Teen', email: 'teen@example.com', password: 'pass', role: 'teen' },
      ]

      const demoMentors = []

      const demoIssues = [
        {
          id: issueId,
          title: 'Test Issue: Feeling overwhelmed',
          description: 'I have been feeling stressed about school and family expectations.',
          createdBy: teenId,
          createdByName: 'Demo Teen',
          assignedMentor: null,
          createdAt: new Date().toISOString(),
        },
      ]

      const demoMessages = {
        [issueId]: [
          { id: 'm1', senderId: teenId, senderRole: 'teen', text: 'Hi, I need someone to talk to.', createdAt: new Date().toISOString() },
        ],
      }

      localStorage.setItem('tc_users', JSON.stringify(demoUsers))
      localStorage.setItem('tc_mentors', JSON.stringify(demoMentors))
      localStorage.setItem('tc_issues', JSON.stringify(demoIssues))
      localStorage.setItem('tc_messages', JSON.stringify(demoMessages))
    } else {
      // if users exist but there is no issue/chat data, ensure messages object exists
      if (!localStorage.getItem('tc_messages')) {
        localStorage.setItem('tc_messages', JSON.stringify(existingMessages))
      }
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <div className="app-shell">
        <Navbar />
        <main className="main-container">
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route
              path="/teen/*"
              element={user && user.role === 'teen' ? <TeenDashboard /> : <Navigate to="/login" />}
            />

            <Route
              path="/mentor/*"
              element={user && user.role === 'mentor' ? <MentorDashboard /> : <Navigate to="/login" />}
            />

            <Route path="/chat/:issueId" element={<Chat />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />

            <Route path="*" element={<div style={{ padding: 20 }}>404 - Not Found</div>} />
          </Routes>
        </main>
        <Footer />
      </div>
    </AuthContext.Provider>
  )
}
