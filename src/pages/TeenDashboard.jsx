import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../App'

export default function TeenDashboard() {
  const { user } = useContext(AuthContext)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [issues, setIssues] = useState([])
  const [mentors, setMentors] = useState([])

  useEffect(() => {
    setIssues(JSON.parse(localStorage.getItem('tc_issues') || '[]'))
    setMentors(JSON.parse(localStorage.getItem('tc_mentors') || '[]'))
  }, [])

  function postIssue(e) {
    e.preventDefault()
    const id = 'iss_' + Date.now()
    const newIssue = {
      id,
      title,
      description,
      createdBy: user.id,
      createdByName: user.name,
  // don't auto-assign a mentor — mentors must accept/assign from mentor dashboard
  assignedMentor: null,
      createdAt: new Date().toISOString(),
    }
    const next = [newIssue, ...issues]
    setIssues(next)
    localStorage.setItem('tc_issues', JSON.stringify(next))
    setTitle('')
    setDescription('')
  }

  const myIssues = issues.filter((i) => i.createdBy === user.id)

  return (
    <div className="dashboard">
      <div className="dashboard-left">
        <section className="card">
          <h3>Post an issue</h3>
          <form onSubmit={postIssue} className="issue-form">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="issue-title">Title</label>
                <input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="issue-description">Description</label>
                <textarea id="issue-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">Post</button>
            </div>
          </form>
        </section>

        <section className="card">
          <h3>My Issues</h3>
          {myIssues.length === 0 ? (
            <div className="muted">You have not posted any issues yet.</div>
          ) : (
            <ul className="issue-list">
              {myIssues.map((it) => (
                <li key={it.id} className="issue-item">
                  <div>
                    <strong>{it.title}</strong>
                    <div className="muted">{it.assignedMentor ? `Mentor: ${it.assignedMentor.name}` : 'Unassigned'}</div>
                  </div>
                  <Link to={`/chat/${it.id}`} className="btn btn-ghost-light">Open Chat</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="dashboard-right">
        <section className="card">
          <h3>Quick Tips</h3>
          <p className="muted">Use the private chat with your mentor to discuss issues safely.</p>
        </section>
      </aside>
    </div>
  )
}
