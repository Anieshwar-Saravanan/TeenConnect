import React, { useContext, useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { AuthContext } from '../App'

export default function Login() {
  const { setUser } = useContext(AuthContext)
  const [socket, setSocket] = useState(null)
  const [role, setRole] = useState('teen')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('password') // 'password' or 'otp'
  const [otpSent, setOtpSent] = useState(false)
  const [otpValue, setOtpValue] = useState('')
  const [mockOtp, setMockOtp] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const newSocket = io('http://localhost:5001')
    setSocket(newSocket)

    // Handle login responses
    newSocket.on('login_success', (user) => {
      setUser(user)
      navigate(role === 'teen' ? '/teen' : '/mentor')
    })

    newSocket.on('login_error', (error) => {
      alert(error.error || 'Invalid credentials. You can sign up first.')
    })

    // Handle OTP responses
    newSocket.on('otp_sent', (data) => {
      setMockOtp(data.otp)
      setOtpSent(true)
      alert('Mock OTP (for demo): ' + data.otp)
    })

    newSocket.on('otp_error', (error) => {
      alert(error.error || 'Failed to send OTP')
    })

    newSocket.on('otp_login_success', (user) => {
      setUser(user)
      navigate(role === 'teen' ? '/teen' : '/mentor')
    })

    newSocket.on('otp_verify_error', (error) => {
      alert(error.error || 'Invalid OTP or user not found.')
    })

    return () => {
      newSocket.disconnect()
    }
  }, [role, navigate, setUser])

  const handleLogin = (e) => {
    e.preventDefault()
    if (!socket) return
    socket.emit('login', { email, password, role })
  }

  const sendOtp = () => {
    if (!email) { alert('Enter your email to receive OTP'); return }
    if (!socket) return
    socket.emit('send_otp', { email, role })
  }

  const verifyOtp = (e) => {
    e.preventDefault()
    if (!socket) return
    socket.emit('verify_otp', { email, otp: otpValue, role })
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
