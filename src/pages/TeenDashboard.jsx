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
  const [blockedIds, setBlockedIds] = useState([])

  useEffect(() => {
    const newSocket = io('http://localhost:5001')
    setSocket(newSocket)

    // Authenticate user
    if (user) {
      newSocket.emit('authenticate', { userId: user.id, role: user.role })
    }

  // Get issues, mentors and blocked mentors list
  newSocket.emit('get_issues')
  newSocket.emit('get_mentors')
  if (user) newSocket.emit('get_blocked_mentors', { teenId: user.id })

    // Handle issues data
    newSocket.on('issues_data', (data) => {
      setIssues(data)
    })

    // Handle mentors data
    newSocket.on('mentors_data', (data) => {
      setMentors(data)
    })

    // Handle blocked mentors list
    newSocket.on('blocked_list', (data) => {
      let ids = []
      if (Array.isArray(data)) {
        if (data.length > 0 && typeof data[0] === 'number') ids = data
        else if (data.length > 0 && data[0].blocked_mentor_id) ids = data.map(d => d.blocked_mentor_id)
        else if (data.length > 0 && data[0].mentor_id) ids = data.map(d => d.mentor_id)
        else ids = data
      }
      setBlockedIds(ids)
    })

    newSocket.on('block_success', (row) => {
      const id = row?.blocked_mentor_id ?? row?.mentor_id ?? row?.id
      if (id) setBlockedIds(prev => Array.from(new Set([...(prev||[]), id])))
    })

    newSocket.on('unblock_success', (row) => {
      const id = row?.blocked_mentor_id ?? row?.mentor_id ?? row?.id
      if (id) setBlockedIds(prev => (prev || []).filter(x => x !== id))
    })

    // Handle new issues
    newSocket.on('new_issue', (newIssue) => {
      setIssues(prev => {
        if (!newIssue || prev.some(i => i.id === newIssue.id)) return prev
        return [newIssue, ...prev]
      })
    })

    // Handle issue updates
    newSocket.on('issue_updated', (updatedIssue) => {
      setIssues(prev => prev.map(issue =>
        issue.id === updatedIssue.id ? updatedIssue : issue
      ))
    })

    // Handle create issue responses
    newSocket.on('create_issue_success', (newIssue) => {
      setIssues(prev => {
        if (!newIssue || prev.some(i => i.id === newIssue.id)) return prev
        return [newIssue, ...prev]
      })
      setTitle('')
      setDescription('')
    })

    // Handle delete chat success (ack) and issue removal broadcasts
    newSocket.on('delete_chat_success', (data) => {
      // remove locally if server acknowledged
      const id = data?.issueId
      if (id) setIssues(prev => (prev || []).filter(i => i.id !== id))
    })

    newSocket.on('issue_removed', (data) => {
      const id = data?.id
      if (id) setIssues(prev => (prev || []).filter(i => i.id !== id))
    })

    newSocket.on('create_issue_error', (error) => {
      alert(error.error || 'Failed to post issue')
    })

    return () => {
      newSocket.off('issues_data')
      newSocket.off('mentors_data')
      newSocket.off('new_issue')
      newSocket.off('issue_updated')
      newSocket.off('create_issue_success')
      newSocket.off('create_issue_error')
      newSocket.off('delete_chat_success')
      newSocket.off('issue_removed')
      newSocket.off('blocked_list')
      newSocket.off('block_success')
      newSocket.off('unblock_success')
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
  // derive mentors that are assigned to any of this teen's issues
  const assignedMentors = Array.from(new Map(
    myIssues
      .filter(i => i.assignedMentor)
      .map(i => [i.assignedMentor.id, i.assignedMentor])
  ).values())

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
                      <div className="d-flex gap-2">
                        <Link to={`/chat/${it.id}`} className="btn btn-outline-primary">
                          {it.assignedMentor ? 'Open Chat' : 'View Chat (disabled)'}
                        </Link>
                        {!it.assignedMentor && (
                          <button className="btn btn-outline-danger" onClick={() => {
                            if (!socket) return
                            if (!window.confirm('Delete this issue and its draft chat? This cannot be undone.')) return
                            socket.emit('delete_chat', { issueId: it.id, scope: 'for_everyone' })
                          }}>Delete</button>
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
              <h3 className="card-title">Quick Tips</h3>
              <p className="text-muted">Use the private chat with your mentor to discuss issues safely.</p>
            </div>
          </div>
          <div className="card mt-3">
            <div className="card-body">
              <h3 className="card-title">Mentors</h3>
              {assignedMentors.length === 0 ? (
                <div className="text-muted">No mentors assigned to your issues.</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {assignedMentors.map(m => {
                    const isBlocked = blockedIds.includes(m.id)
                    return (
                      <li key={m.id} className="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                          <strong>{m.name}</strong>
                          <div className="text-muted small">{m.email}</div>
                        </div>
                        <div>
                          {isBlocked ? (
                            <button className="btn btn-sm btn-outline-danger" onClick={() => socket && socket.emit('unblock_mentor', { teenId: user.id, mentorId: m.id })}>Unblock</button>
                          ) : (
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => socket && socket.emit('block_mentor', { teenId: user.id, mentorId: m.id })}>Block</button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
