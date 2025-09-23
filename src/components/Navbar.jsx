import React, { useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'

export default function Navbar() {
  const { user, setUser } = useContext(AuthContext)
  const navigate = useNavigate()

  function logout() {
    setUser(null)
    localStorage.removeItem('tc_user')
    navigate('/login')
  }

  const goHome = (e) => {
    e.preventDefault()
    if (user && user.role === 'teen') return navigate('/teen')
    if (user && user.role === 'mentor') return navigate('/mentor')
    return navigate('/login')
  }

  return (
    <header className="navbar">
      <div className="nav-left">
        <a href="/" className="logo" onClick={goHome}>
          Teen Connect
        </a>
      </div>
      <div className="nav-right">
        {user ? (
          <>
            <span className="nav-user">{user.name} ({user.role})</span>
            <button className="btn btn-ghost" onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            {/* <Link to="/login" className="btn btn-primary">Login</Link>
            <Link to="/signup" className="btn btn-ghost" style={{ marginLeft: 8 }}>Sign up</Link> */}
          </>
        )}
      </div>
    </header>
  )
}
