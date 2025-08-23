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

  const handleLogin = (e) => {
    e.preventDefault()
    // simple mocked auth: look for registered users in localStorage
    const users = JSON.parse(localStorage.getItem('tc_users') || '[]')
    const found = users.find((u) => u.email === email && u.password === password && u.role === role)
    if (found) {
      setUser(found)
      navigate(role === 'teen' ? '/teen' : '/mentor')
    } else {
      alert('Invalid credentials. You can sign up first.')
    }
  }

  const sendOtp = () => {
    if (!email) { alert('Enter your email to receive OTP'); return }
    // mock OTP generation and store in localStorage for verification
    const otp = (Math.floor(100000 + Math.random() * 900000)).toString()
    setMockOtp(otp)
    setOtpSent(true)
    // store otp against email in localStorage for demo
    const otps = JSON.parse(localStorage.getItem('tc_otps') || '{}')
    otps[email] = { otp, createdAt: Date.now() }
    localStorage.setItem('tc_otps', JSON.stringify(otps))
    // show mock otp as an alert for demo
    alert('Mock OTP (for demo): ' + otp)
  }

  const verifyOtp = (e) => {
    e.preventDefault()
    const otps = JSON.parse(localStorage.getItem('tc_otps') || '{}')
    const record = otps[email]
    if (!record) { alert('No OTP sent to this email.'); return }
    if (record.otp === otpValue) {
      // find user by email and role
      const users = JSON.parse(localStorage.getItem('tc_users') || '[]')
      let found = users.find((u) => u.email === email && u.role === role)
      if (!found) {
        // if not found, auto-create a teen/mentor-lite user for demo
        const id = 'u_' + Date.now()
        found = { id, name: email.split('@')[0], email, password: '', role }
        users.push(found)
        localStorage.setItem('tc_users', JSON.stringify(users))
        if (role === 'mentor') {
          const mentors = JSON.parse(localStorage.getItem('tc_mentors') || '[]')
          mentors.push({ id: found.id, name: found.name, email: found.email })
          localStorage.setItem('tc_mentors', JSON.stringify(mentors))
        }
      }
      setUser(found)
      navigate(role === 'teen' ? '/teen' : '/mentor')
    } else {
      alert('Invalid OTP')
    }
  }

  return (
    <div className="auth-card">
      <h2>Login to Teen Connect</h2>

      <form onSubmit={mode === 'password' ? handleLogin : verifyOtp} className="auth-form">
        <label className="form-group">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="teen">Teen</option>
            <option value="mentor">Mentor / Adult / Parent</option>
          </select>
        </label>

        <label className="form-group">
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>

        {mode === 'password' ? (
          <>
            <label className="form-group">
              Password
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </label>
            <div className="form-actions">
              <div>
                <button className="btn btn-primary" type="submit">Login</button>
                <button type="button" className="btn btn-otp" style={{ marginLeft: 8 }} onClick={() => setMode('otp')}>Login with OTP</button>
              </div>
              <Link to="/signup" className="btn btn-ghost">Create account</Link>
            </div>
          </>
        ) : (
          <>
            {otpSent && <div className="otp-banner">OTP sent to {email}</div>}
            <label className="form-group">
              Enter OTP
              <input value={otpValue} onChange={(e) => setOtpValue(e.target.value)} required />
            </label>
            <div className="form-actions">
              <div>
                <button className="btn btn-primary" type="submit">Verify & Login</button>
                <button type="button" className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={sendOtp}>{otpSent ? 'Resend OTP' : 'Send OTP'}</button>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => { setMode('password'); setOtpSent(false); setOtpValue('') }}>Use password</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
