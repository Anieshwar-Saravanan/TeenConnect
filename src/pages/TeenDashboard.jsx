import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { AuthContext } from '../App'

export default function TeenDashboard() {
  const { user } = useContext(AuthContext)
  const [socket, setSocket] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [issues, setIssues] = useState([])
  const [mentors, setMentors] = useState([])

  useEffect(() => {
    const newSocket = io('http://localhost:5001')
    setSocket(newSocket)

    // Authenticate user
    if (user) {
      newSocket.emit('authenticate', { userId: user.id, role: user.role })
    }

    // Get issues and mentors
    newSocket.emit('get_issues')
    newSocket.emit('get_mentors')

    // Handle issues data
    newSocket.on('issues_data', (data) => {
      setIssues(data)
    })

    // Handle mentors data
    newSocket.on('mentors_data', (data) => {
      setMentors(data)
    })

    // Handle new issues
    newSocket.on('new_issue', (newIssue) => {
      setIssues(prev => [newIssue, ...prev])
    })

    // Handle issue updates
    newSocket.on('issue_updated', (updatedIssue) => {
      setIssues(prev => prev.map(issue =>
        issue.id === updatedIssue.id ? updatedIssue : issue
      ))
    })

    // Handle create issue responses
    newSocket.on('create_issue_success', (newIssue) => {
      setIssues(prev => [newIssue, ...prev])
      setTitle('')
      setDescription('')
    })

    newSocket.on('create_issue_error', (error) => {
      alert(error.error || 'Failed to post issue')
    })

    return () => {
      newSocket.disconnect()
    }
  }, [user])

  function postIssue(e) {
    e.preventDefault()
    if (!socket) return
    socket.emit('create_issue', {
      title,
      description,
      created_by: user.id,
      createdBy: user.id
    })
  }

  const myIssues = issues.filter((i) => i.createdBy === user.id)

  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-lg-8 col-12 mb-3">
          <div className="card mb-4">
            <div className="card-body">
              <h3 className="card-title mb-3">Post an issue</h3>
              <form onSubmit={postIssue}>
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label htmlFor="issue-title" className="form-label">Title</label>
                    <input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="form-control" />
                  </div>
                  <div className="col-md-6">
                    <label htmlFor="issue-description" className="form-label">Description</label>
                    <textarea id="issue-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} required className="form-control" />
                  </div>
                </div>
                <div className="d-flex justify-content-end">
                  <button className="btn btn-primary" type="submit">Post</button>
                </div>
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 className="card-title mb-3">My Issues</h3>
              {myIssues.length === 0 ? (
                <div className="text-muted">You have not posted any issues yet.</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {myIssues.map((it) => (
                    <li key={it.id} className="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <strong>{it.title}</strong>
                        <div className="text-muted small">{it.assignedMentor ? `Mentor: ${it.assignedMentor.name}` : 'Unassigned'}</div>
                      </div>
                      <Link to={`/chat/${it.id}`} className="btn btn-outline-primary">
                        {it.assignedMentor ? 'Open Chat' : 'View Chat (disabled)'}
                      </Link>
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
              <h3 className="card-title">Quick Tips</h3>
              <p className="text-muted">Use the private chat with your mentor to discuss issues safely. This is a mock app — data is stored locally.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
