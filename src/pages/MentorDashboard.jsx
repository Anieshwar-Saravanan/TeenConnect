import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../App'

export default function MentorDashboard() {
  const { user } = useContext(AuthContext)
  const [issues, setIssues] = useState([])

  useEffect(() => {
    setIssues(JSON.parse(localStorage.getItem('tc_issues') || '[]'))
  }, [])

  function assignToSelf(issueId) {
    const all = issues.map((it) => (it.id === issueId ? { ...it, assignedMentor: { id: user.id, name: user.name } } : it))
    setIssues(all)
    localStorage.setItem('tc_issues', JSON.stringify(all))
  }

  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-lg-8 col-12 mb-3">
          <div className="card mb-4">
            <div className="card-body">
              <h3 className="card-title mb-3">Reported Issues</h3>
              <div className="text-muted mb-3">Mentors: review the description and click "Assign to me" to accept an issue — the chat becomes available only after acceptance.</div>
              {issues.length === 0 ? (
                <div className="text-muted">No issues reported yet.</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {issues.map((it) => (
                    <li key={it.id} className="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <strong>{it.title}</strong>
                        <p className="text-muted mb-1 small">{it.description}</p>
                        <div className="text-muted small">By {it.createdByName} · {new Date(it.createdAt).toLocaleString()}</div>
                        <div className="text-muted small">Assigned: {it.assignedMentor ? it.assignedMentor.name : 'None'}</div>
                      </div>
                      <div>
                        {!it.assignedMentor ? (
                          <button className="btn btn-outline-primary" onClick={() => assignToSelf(it.id)}>Assign to me</button>
                        ) : it.assignedMentor.id === user.id ? (
                          <Link to={`/chat/${it.id}`} className="btn btn-primary">Open Chat</Link>
                        ) : (
                          <span className="text-muted small">Assigned to {it.assignedMentor.name}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-4 col-12">
          <div className="card">
            <div className="card-body">
              <h3 className="card-title">Mentor Tools</h3>
              <p className="text-muted">Click an issue to open a private chat with the teen who posted it.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
