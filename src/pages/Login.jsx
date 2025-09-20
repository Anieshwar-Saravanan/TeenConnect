import React, { useContext, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AuthContext } from '../App'

export default function Login() {
  const { setUser } = useContext(AuthContext)
  const [role, setRole] = useState('teen')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('password') // 'password' or 'otp'
  const [otpSent, setOtpSent] = useState(false)
  const [otpValue, setOtpValue] = useState('')
  const [mockOtp, setMockOtp] = useState(null)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('http://localhost:5001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role })
      })
      if (!res.ok) throw new Error('Invalid credentials')
      const user = await res.json()
      setUser(user)
      navigate(role === 'teen' ? '/teen' : '/mentor')
    } catch (err) {
      alert('Invalid credentials. You can sign up first.')
    }
  }

  const sendOtp = async () => {
    if (!email) { alert('Enter your email to receive OTP'); return }
    try {
      const res = await fetch('http://localhost:5001/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role })
      })
      const data = await res.json()
      setMockOtp(data.otp) // For demo, backend can return OTP
      setOtpSent(true)
      alert('Mock OTP (for demo): ' + data.otp)
    } catch (err) {
      alert('Failed to send OTP')
    }
  }

  const verifyOtp = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('http://localhost:5001/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpValue, role })
      })
      if (!res.ok) throw new Error('Invalid OTP')
      const user = await res.json()
      setUser(user)
      navigate(role === 'teen' ? '/teen' : '/mentor')
    } catch (err) {
      alert('Invalid OTP or user not found.')
    }
  }


  return (
    <div className="container d-flex align-items-center justify-content-center min-vh-100">
      <div className="card shadow" style={{ minWidth: 350, maxWidth: 420 }}>
        <div className="card-body">
          <h2 className="card-title text-center mb-4">Login</h2>
          <form onSubmit={mode === 'password' ? handleLogin : verifyOtp}>
            <div className="mb-3">
              <label className="form-label">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="form-select">
                <option value="teen">Teen</option>
                <option value="mentor">Mentor / Adult / Parent</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="form-control" />
            </div>
            {mode === 'password' ? (
              <>
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className="form-control" />
                </div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <button className="btn btn-primary" type="submit">Login</button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setMode('otp')}>Login with OTP</button>
                </div>
                <div className="text-center">
                  <Link to="/signup" className="btn btn-link">Create account</Link>
                </div>
              </>
            ) : (
              <>
                {otpSent && <div className="alert alert-warning py-2">OTP sent to {email}</div>}
                <div className="mb-3">
                  <label className="form-label">Enter OTP</label>
                  <input value={otpValue} onChange={(e) => setOtpValue(e.target.value)} required className="form-control" />
                </div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <button className="btn btn-primary" type="submit">Verify & Login</button>
                  <button type="button" className="btn btn-outline-secondary" onClick={sendOtp}>{otpSent ? 'Resend OTP' : 'Send OTP'}</button>
                </div>
                <div className="text-center">
                  <button type="button" className="btn btn-link" onClick={() => { setMode('password'); setOtpSent(false); setOtpValue('') }}>Use password</button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
