import React, { useContext, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { AuthContext } from '../App'

export default function MentorDashboard() {
  const { user } = useContext(AuthContext)
  const [socket, setSocket] = useState(null)
  const [issues, setIssues] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    const newSocket = io('http://localhost:5001')
    setSocket(newSocket)

    // Authenticate user
    if (user) {
      newSocket.emit('authenticate', { userId: user.id, role: user.role })
    }

    // Get issues
    newSocket.emit('get_issues')

    // Handle issues data
    newSocket.on('issues_data', (data) => {
      setIssues(data)
    })

    // Handle issue updates
    newSocket.on('issue_updated', (updatedIssue) => {
      setIssues(prev => prev.map(issue =>
        issue.id === updatedIssue.id ? updatedIssue : issue
      ))
    })

    // Handle new issues
    newSocket.on('new_issue', (newIssue) => {
      setIssues(prev => [newIssue, ...prev])
    })

    // Handle assign responses
    newSocket.on('assign_issue_success', (updatedIssue) => {
      setIssues(prev => prev.map(issue =>
        issue.id === updatedIssue.id ? updatedIssue : issue
      ))
      navigate(`/chat/${updatedIssue.id}`)
    })

    newSocket.on('assign_issue_error', (error) => {
      alert(error.error || 'Failed to assign issue')
    })

    return () => {
      newSocket.disconnect()
    }
  }, [user, navigate])

  function assignToSelf(issueId) {
    if (!socket) return
    socket.emit('assign_issue', {
      issueId: parseInt(issueId),
      mentorId: user.id,
      mentorName: user.name
    })
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
                  {issues
                    .filter((it) => !it.assignedMentor || it.assignedMentor.id === user.id)
                    .map((it) => (
                      <li key={it.id} className="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                          <strong>{it.title}</strong>
                          <p className="text-muted mb-1 small">{it.description}</p>
                          <div className="text-muted small">Assigned: {it.assignedMentor ? it.assignedMentor.name : 'None'}</div>
                        </div>
                        <div>
                          {!it.assignedMentor ? (
                            <button className="btn btn-outline-primary" onClick={() => assignToSelf(it.id)}>Assign to me</button>
                          ) : it.assignedMentor.id === user.id ? (
                            <Link to={`/chat/${it.id}`} className="btn btn-primary">Open Chat</Link>
                          ) : null}
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
