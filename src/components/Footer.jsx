import React from 'react'

export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div className="footer-left">&copy; {new Date().getFullYear()} TeenConnect</div>
        <div className="footer-right">
          <a href="/about" className="footer-link">About</a>
          <a href="/privacy" className="footer-link">Privacy</a>
        </div>
      </div>
    </footer>
  )
}
