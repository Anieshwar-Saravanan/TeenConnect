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

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const res = await fetch('http://localhost:5001/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role })
      })
      if (!res.ok) throw new Error('Signup failed')
      const user = await res.json()
      setUser(user)
      navigate(role === 'teen' ? '/teen' : '/mentor')
    } catch (err) {
      alert('Signup failed. Try again.')
    }
  }

  return (
    <div className="container d-flex align-items-center justify-content-center min-vh-100">
      <div className="card shadow" style={{ minWidth: 350, maxWidth: 420 }}>
        <div className="card-body">
          <h2 className="card-title text-center mb-4">Create an account</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="form-select">
                <option value="teen">Teen</option>
                <option value="mentor">Mentor / Adult / Parent</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="form-control" />
            </div>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="form-control" />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className="form-control" />
            </div>
            <div className="d-flex justify-content-end">
              <button className="btn btn-primary" type="submit">Sign up</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
