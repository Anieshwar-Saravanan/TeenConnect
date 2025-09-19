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
    const issues = JSON.parse(localStorage.getItem('tc_issues') || '[]')
    let found = issues.find((i) => i.id === issueId)
    if (!found) return

    // enrich assignedMentor by looking up users / mentors stored elsewhere
    const users = JSON.parse(localStorage.getItem('tc_users') || '[]')
    const mentorsList = JSON.parse(localStorage.getItem('tc_mentors') || '[]')

    if (found.assignedMentor && found.assignedMentor.id) {
      const mentorFromUsers = users.find((u) => u.id === found.assignedMentor.id && u.role === 'mentor')
      const mentorFromList = mentorsList.find((m) => m.id === found.assignedMentor.id)
      const fullMentor = mentorFromUsers
        ? { id: mentorFromUsers.id, name: mentorFromUsers.name, email: mentorFromUsers.email }
        : mentorFromList
        ? mentorFromList
        : null

      if (fullMentor) {
        // if stored mentor details are incomplete, persist the richer object
        if (!found.assignedMentor.email || found.assignedMentor.name !== fullMentor.name) {
          const updated = issues.map((it) => (it.id === issueId ? { ...it, assignedMentor: fullMentor } : it))
          localStorage.setItem('tc_issues', JSON.stringify(updated))
          found = updated.find((i) => i.id === issueId)
        }
      }
    }

    setIssue(found)

    // load or initialize messages
    const allMessages = JSON.parse(localStorage.getItem('tc_messages') || '{}')
    setMessages(allMessages[issueId] || [])
  }, [issueId])

  useEffect(() => {
    // save messages to localStorage whenever they change
    const allMessages = JSON.parse(localStorage.getItem('tc_messages') || '{}')
    allMessages[issueId] = messages
    localStorage.setItem('tc_messages', JSON.stringify(allMessages))
    // scroll to bottom after messages update
    requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight
      }
    })
  }, [messages, issueId])

  const assignToSelf = () => {
    if (!user) return

    // Ensure mentors list contains this mentor
    const users = JSON.parse(localStorage.getItem('tc_users') || '[]')
    const mentorsList = JSON.parse(localStorage.getItem('tc_mentors') || '[]')
    const mentorUser = users.find((u) => u.id === user.id && u.role === 'mentor')

    const mentorRecord = mentorUser
      ? { id: mentorUser.id, name: mentorUser.name, email: mentorUser.email }
      : { id: user.id, name: user.name, email: user.email || '' }

    const already = mentorsList.find((m) => m.id === mentorRecord.id)
    if (!already) {
      mentorsList.push(mentorRecord)
      localStorage.setItem('tc_mentors', JSON.stringify(mentorsList))
    }

    // Update issues list with full mentor record
    const issues = JSON.parse(localStorage.getItem('tc_issues') || '[]')
    const updated = issues.map((it) => (it.id === issueId ? { ...it, assignedMentor: mentorRecord } : it))
    localStorage.setItem('tc_issues', JSON.stringify(updated))
    const found = updated.find((i) => i.id === issueId)
    setIssue(found)
  }

  const handleSend = () => {
    if (!text.trim()) return
    // Prevent sending if issue is unassigned
    if (!issue?.assignedMentor) {
      alert('This issue is not assigned to a mentor yet. You cannot send messages until a mentor is assigned.')
      return
    }

    const newMsg = {
      id: Date.now().toString(),
      senderId: user?.id || 'anonymous',
      senderRole: user?.role || 'teen',
      text: text.trim(),
      createdAt: new Date().toISOString(),
    }
    setMessages((s) => [...s, newMsg])
    setText('')
  }

  // Helper to resolve a sender's name from stored users
  const resolveSenderName = (senderId, senderRole) => {
    const users = JSON.parse(localStorage.getItem('tc_users') || '[]')
    const u = users.find((x) => x.id === senderId)
    if (u) return u.name
    // fallback to role label
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
              {user && user.role === 'mentor' && (
                <button className="btn btn-primary mt-2 align-self-start" onClick={assignToSelf}>Assign to me</button>
              )}
            </div>
          )}

          <div className="border rounded p-3 mb-3 bg-light" style={{ height: 350, overflowY: 'auto' }} ref={messagesRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`mb-2 d-flex flex-column ${m.senderRole === 'teen' ? 'align-items-end' : 'align-items-start'}`}
              >
                <div className={`px-3 py-2 rounded-3 ${m.senderRole === 'teen' ? 'bg-primary text-white' : 'bg-success text-white'}`} style={{ maxWidth: '70%' }}>
                  <div className="small fw-bold mb-1">{resolveSenderName(m.senderId, m.senderRole)} <span className="text-white-50">· {new Date(m.createdAt).toLocaleTimeString()}</span></div>
                  <div>{m.text}</div>
                </div>
              </div>
            ))}
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
