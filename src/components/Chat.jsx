import React, { useEffect, useMemo, useState, useContext, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ModerationPanel from './ModerationPanel'
import { AuthContext } from '../App'

// Simple chat bubbles and input using GlueStack-style components (mocked)
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

  if (!issue) return <div style={{ padding: 20 }}>Issue not found</div>

  return (
    <div className="chat-page">
      <div className="chat-area">
        <div className="chat-header">
          <button className="btn btn-link" onClick={() => navigate(-1)}>← Back</button>
          <div>
            <h3>{issue.title}</h3>
            <div className="muted">With: {issue.assignedMentor?.name || 'Unassigned'}</div>
            {issue.assignedMentor?.email && (
              <div className="muted">Mentor email: {issue.assignedMentor.email}</div>
            )}
          </div>
        </div>

        {!issue.assignedMentor && (
          <div className="card" style={{ margin: '8px 0', borderLeft: '4px solid var(--brand)' }}>
            <strong>Notice</strong>
            <div className="muted" style={{ marginTop: 6 }}>
              This issue is currently unassigned. Messaging is disabled until a mentor is assigned.
            </div>
            {user && user.role === 'mentor' && (
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary" onClick={assignToSelf}>Assign to me</button>
              </div>
            )}
          </div>
        )}

        <div className="messages" id="messages" ref={messagesRef}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`message-bubble ${m.senderRole === 'teen' ? 'msg-teen' : 'msg-mentor'}`}>
              <div className="message-meta">{resolveSenderName(m.senderId, m.senderRole)} · {new Date(m.createdAt).toLocaleTimeString()}</div>
              <div className="message-text">{m.text}</div>
            </div>
          ))}
        </div>

        <div className="chat-input">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={issue.assignedMentor ? 'Type a message...' : 'Cannot send messages until assigned'}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={!issue.assignedMentor}
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={!issue.assignedMentor}>Send</button>
        </div>
      </div>

      <ModerationPanel messages={messages} />
    </div>
  )
}
