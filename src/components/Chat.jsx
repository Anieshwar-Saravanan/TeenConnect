import React, { useEffect, useState, useContext, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import ModerationPanel from './ModerationPanel'
import { AuthContext } from '../App'

export default function Chat() {
  const { issueId } = useParams()
  const navigate = useNavigate()
  const { user } = useContext(AuthContext)

  const [socket, setSocket] = useState(null)
  const [issue, setIssue] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const messagesRef = useRef(null)

  useEffect(() => {
    // Initialize socket connection
    const SERVER_URL = 'http://127.0.0.1:5001'
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    })
    setSocket(newSocket)

    // Debug logs
    console.log('Attempting socket connect to http://localhost:5001')
    if (newSocket.io) {
      newSocket.io.on('reconnect_attempt', (n) => console.log('reconnect attempt', n))
      newSocket.io.on('reconnect_failed', () => console.log('reconnect failed'))
    }
    newSocket.on('connect', () => {
      setIsConnected(true)
      console.log('Connected to server', newSocket.id)

      // Authenticate user
      if (user) {
        newSocket.emit('authenticate', { userId: user.id, role: user.role })
      }

      // Join issue room only after a successful connect
      if (issueId) {
        console.log('Joining issue room after connect:', issueId)
        newSocket.emit('join_issue', { issueId })
      }
    })

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false)
      console.log('Disconnected from server', reason)
    })

    newSocket.on('connect_error', (err) => {
      console.error('Socket connect_error:', err && err.message)
    })

    newSocket.on('error', (err) => {
      console.error('Socket error event:', err)
    })

    // Fetch issue data
    const fetchIssueData = async () => {
      try {
        // For now, we'll use a simple fetch for issue data since it's not real-time
        const res = await fetch(`http://localhost:5001/api/issues/${issueId}`)
        if (!res.ok) return
        const found = await res.json()
        setIssue(found)
      } catch {
        setIssue(null)
      }
    }
    fetchIssueData()

  // If connect hasn't happened yet, join will be emitted after connect handler.

    // Handle incoming messages
    newSocket.on('issue_messages', (msgs) => {
      setMessages(msgs)
    })

    newSocket.on('new_message', (msg) => {
      setMessages((prev) => [...prev, msg])
    })

    // Handle issue updates
    newSocket.on('issue_updated', (updatedIssue) => {
      if (updatedIssue.id === parseInt(issueId)) {
        setIssue(updatedIssue)
      }
    })

    return () => {
      try {
        newSocket.off()
        newSocket.disconnect()
      } catch (e) {
        console.warn('Error during socket cleanup', e)
      }
      setSocket(null)
    }
  }, [issueId, user])

  useEffect(() => {
    // scroll to bottom after messages update
    requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight
      }
    })
  }, [messages])

  const assignToSelf = () => {
    if (!user || !socket) return
    socket.emit('assign_issue', {
      issueId: parseInt(issueId),
      mentorId: user.id,
      mentorName: user.name
    })
  }

  const handleSend = () => {
    if (!text.trim() || !socket || !isConnected) return
    if (!issue?.assignedMentor) {
      alert('This issue is not assigned to a mentor yet. You cannot send messages until a mentor is assigned.')
      return
    }

    socket.emit('send_message', {
      issueId: parseInt(issueId),
      senderId: user?.id,
      senderRole: user?.role,
      text: text.trim()
    })

    setText('')
  }

  // Helper to resolve a sender's name from stored users
  const resolveSenderName = (senderId, senderRole) => {
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
              <div className={`small ${isConnected ? 'text-success' : 'text-danger'}`}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
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

              const ts = m.createdAt || m.created_at;
              return (
                <div
                  key={m.id}
                  className={`mb-2 d-flex flex-column ${alignClass}`}
                >
                  <div className={`px-3 py-2 rounded-3 ${bubbleColor}`} style={{ maxWidth: '70%' }}>
                    <div className="small fw-bold mb-1">
                      {resolveSenderName(m.senderId, m.senderRole)}{' '}
                      <span className="text-muted">· {ts ? new Date(ts).toLocaleTimeString() : ''}</span>
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
              disabled={!issue.assignedMentor || !isConnected}
              className="form-control"
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={!issue.assignedMentor || !isConnected}
            >
              Send
            </button>
          </div>
        </div>
        <div className="col-lg-4 col-12">
          <ModerationPanel messages={messages} />
        </div>
      </div>
    </div>
  )
}
