import React, { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'

export default function Signup() {
  const { setUser } = useContext(AuthContext)
  const [role, setRole] = useState('teen')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e) {
    e.preventDefault()
    const users = JSON.parse(localStorage.getItem('tc_users') || '[]')
    const id = 'u_' + Date.now()
    const newUser = { id, name, email, password, role }
    users.push(newUser)
    localStorage.setItem('tc_users', JSON.stringify(users))
    // if mentor, ensure a mentors list
    if (role === 'mentor') {
      const mentors = JSON.parse(localStorage.getItem('tc_mentors') || '[]')
      mentors.push({ id, name, email })
      localStorage.setItem('tc_mentors', JSON.stringify(mentors))
    }
    setUser(newUser)
    navigate(role === 'teen' ? '/teen' : '/mentor')
  }

  return (
    <div className="auth-card">
      <h2>Create an account</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="teen">Teen</option>
            <option value="mentor">Mentor / Adult / Parent</option>
          </select>
        </label>

        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>

        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">Sign up</button>
        </div>
      </form>
    </div>
  )
}
