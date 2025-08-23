import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../App'

export default function MentorDashboard() {
  const { user } = useContext(AuthContext)
  const [issues, setIssues] = useState([])

  useEffect(() => {
    setIssues(JSON.parse(localStorage.getItem('tc_issues') || '[]'))
  }, [])

  // For demo: mark assigned to self when clicked
  function assignToSelf(issueId) {
    const all = issues.map((it) => (it.id === issueId ? { ...it, assignedMentor: { id: user.id, name: user.name } } : it))
    setIssues(all)
    localStorage.setItem('tc_issues', JSON.stringify(all))
  }

  return (
    <div className="dashboard">
      <div className="dashboard-left">
        <section className="card">
          <h3>Reported Issues</h3>
          <div className="muted" style={{ marginBottom: 12 }}>Mentors: review the description and click "Assign to me" to accept an issue — the chat becomes available only after acceptance.</div>
          {issues.length === 0 ? (
            <div className="muted">No issues reported yet.</div>
          ) : (
            <ul className="issue-list">
              {issues.map((it) => (
                <li key={it.id} className="issue-item">
                  <div>
                    <strong>{it.title}</strong>
                    <p className="muted" style={{ margin: '4px 0' }}>{it.description}</p>
                    <div className="muted">By {it.createdByName} · {new Date(it.createdAt).toLocaleString()}</div>
                    <div className="muted">Assigned: {it.assignedMentor ? it.assignedMentor.name : 'None'}</div>
                  </div>
                  <div className="issue-actions">
                    {!it.assignedMentor ? (
                      <button className="btn btn-ghost-light" onClick={() => assignToSelf(it.id)}>Assign to me</button>
                    ) : it.assignedMentor.id === user.id ? (
                      <Link to={`/chat/${it.id}`} className="btn btn-primary">Open Chat</Link>
                    ) : (
                      <div className="muted">Assigned to {it.assignedMentor.name}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="dashboard-right">
        <section className="card">
          <h3>Mentor Tools</h3>
          <p className="muted">Click an issue to open a private chat with the teen who posted it.</p>
        </section>
      </aside>
    </div>
  )
}
