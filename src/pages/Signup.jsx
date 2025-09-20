import React, { useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { AuthContext } from '../App'

export default function Signup() {
  const { setUser } = useContext(AuthContext)
  const [socket, setSocket] = useState(null)
  const [role, setRole] = useState('teen')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const newSocket = io('http://localhost:5001')
    setSocket(newSocket)

    // Handle signup responses
    newSocket.on('signup_success', (user) => {
      setUser(user)
      navigate(role === 'teen' ? '/teen' : '/mentor')
    })

    newSocket.on('signup_error', (error) => {
      alert(error.error || 'Signup failed. Try again.')
    })

    return () => {
      newSocket.disconnect()
    }
  }, [role, navigate, setUser])

  function handleSubmit(e) {
    e.preventDefault()
    if (!socket) return
    socket.emit('signup', { name, email, password, role })
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
