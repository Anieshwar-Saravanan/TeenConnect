import React, { useEffect, useState, useContext, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ModerationPanel from './ModerationPanel'
import { AuthContext } from '../App'

export default function Chat() {
  const { issueId } = useParams()
  const navigate = useNavigate()
  const { user } = useContext(AuthContext)

  const [issue, setIssue] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const messagesRef = useRef(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`http://localhost:5001/api/issues/${issueId}`)
        if (!res.ok) return
        const found = await res.json()
        setIssue(found)
        const msgRes = await fetch(`http://localhost:5001/api/issues/${issueId}/messages`)
        if (!msgRes.ok) { setMessages([]); return }
        const msgs = await msgRes.json()
        setMessages(msgs)
      } catch {
        setIssue(null)
        setMessages([])
      }
    }
    fetchData()
  }, [issueId])

  useEffect(() => {
    // scroll to bottom after messages update
    requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight
      }
    })
  }, [messages, issueId])

  const assignToSelf = async () => {
    if (!user) return
    try {
      const res = await fetch(`http://localhost:5001/api/issues/${issueId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId: user.id, mentorName: user.name })
      })
      if (!res.ok) throw new Error('Failed to assign')
      const updated = await res.json()
      setIssue(updated)
    } catch {
      alert('Failed to assign issue')
    }
  }

  const handleSend = async () => {
    if (!text.trim()) return
    if (!issue?.assignedMentor) {
      alert('This issue is not assigned to a mentor yet. You cannot send messages until a mentor is assigned.')
      return
    }
    try {
      const res = await fetch(`http://localhost:5001/api/issues/${issueId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: user?.id, senderRole: user?.role, text: text.trim() })
      })
      if (!res.ok) throw new Error('Failed to send message')
      const newMsg = await res.json()
      setMessages((s) => [...s, newMsg])
      setText('')
    } catch {
      alert('Failed to send message')
    }
  }

  // Helper to resolve a sender's name from stored users
  const resolveSenderName = (senderId, senderRole) => {
    // For demo, just return senderRole if not found
    if (!issue) return senderRole
    if (issue.createdBy === senderId) return issue.createdByName
    if (issue.assignedMentor && issue.assignedMentor.id === senderId) return issue.assignedMentor.name
    return senderRole === 'teen' ? 'Teen' : senderRole === 'mentor' ? 'Mentor' : 'User'
  }

  if (!issue) return <div className="p-4">Issue not found</div>

  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-lg-8 col-12 mb-3">
          <div className="d-flex align-items-center mb-3">
            <button className="btn btn-link p-0 me-3" onClick={() => navigate(-1)}>← Back</button>
            <div>
              <h3 className="mb-0">{issue.title}</h3>
              <div className="text-muted small">With: {issue.assignedMentor?.name || 'Unassigned'}</div>
              {issue.assignedMentor?.email && (
                <div className="text-muted small">Mentor email: {issue.assignedMentor.email}</div>
              )}
            </div>
          </div>

          {!issue.assignedMentor && (
            <div className="alert alert-warning d-flex flex-column p-3 mb-3">
              <strong>Notice</strong>
              <div className="small mt-1">
                This issue is currently unassigned. Messaging is disabled until a mentor is assigned.
              </div>
            </div>
          )}

          <div className="border rounded p-3 mb-3 bg-light" style={{ height: 350, overflowY: 'auto' }} ref={messagesRef}>
            {messages.map((m) => {
              const isCurrentUser = m.senderId === user?.id;
              const bubbleColor = isCurrentUser ? 'bg-primary text-white' : 'bg-success text-white';
              const alignClass = isCurrentUser ? 'align-items-end' : 'align-items-start';
              // Support both created_at and createdAt
              const ts = m.createdAt || m.created_at;
              return (
                <div
                  key={m.id}
                  className={`mb-2 d-flex flex-column ${alignClass}`}
                >
                  <div className={`px-3 py-2 rounded-3 ${bubbleColor}`} style={{ maxWidth: '70%' }}>
                    <div className="small fw-bold mb-1">
                      {resolveSenderName(m.senderId, m.senderRole)}{' '}
                      <span className="text-white-50">· {ts ? new Date(ts).toLocaleTimeString() : ''}</span>
                    </div>
                    <div>{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="input-group">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={issue.assignedMentor ? 'Type a message...' : 'Cannot send messages until assigned'}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={!issue.assignedMentor}
              className="form-control"
            />
            <button className="btn btn-primary" onClick={handleSend} disabled={!issue.assignedMentor}>Send</button>
          </div>
        </div>
        <div className="col-lg-4 col-12">
          <ModerationPanel messages={messages} />
        </div>
      </div>
    </div>
  )
}
