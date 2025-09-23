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
  const [blockedIds, setBlockedIds] = useState([])
  const [isMentorBlockedOnThisIssue, setIsMentorBlockedOnThisIssue] = useState(false)
  const [chatDeletedNotice, setChatDeletedNotice] = useState(null)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [openMessageMenu, setOpenMessageMenu] = useState(null) // message id that has menu open
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
      // ask for blocked mentors for this teen if we are a teen
      if (user && user.role === 'teen') {
        newSocket.emit('get_blocked_mentors', { teenId: user.id })
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

    // Show alerts for server-side message errors (PII / blocked messages)
    newSocket.on('send_message_error', (err) => {
      try {
        const msg = err && (err.error || err.message) ? (err.error || err.message) : 'Failed to send message'
        alert(msg)
      } catch (e) { console.warn(e) }
    })

    // If server forbids the user, show alert and navigate home
    newSocket.on('forbidden', (payload) => {
      try {
        const msg = (payload && payload.message) ? payload.message : 'You have been forbidden from the site'
        alert(msg)
        navigate('/')
      } catch (e) {}
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

    // blocked mentors list
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

    // Handle issue updates
    newSocket.on('issue_updated', (updatedIssue) => {
      if (updatedIssue.id === parseInt(issueId)) {
        setIssue(updatedIssue)
        // if backend includes blocked metadata, reflect it in UI
        if (updatedIssue.blockedMentorId) {
          // if current user is the teen, show that mentor is blocked; if mentor is the blocked mentor, show blocked state
          setIsMentorBlockedOnThisIssue(true)
        } else {
          setIsMentorBlockedOnThisIssue(false)
        }
      }
    })

    // Handle chat deletion (old issue replaced with a new one)
    newSocket.on('chat_deleted', (payload) => {
      try {
        const { oldIssueId, newIssueId } = payload || {}
        if (parseInt(oldIssueId) === parseInt(issueId)) {
          // Show a brief notice and then navigate
          setChatDeletedNotice({ oldIssueId, newIssueId })
          setTimeout(() => {
            if (newIssueId) navigate(`/chat/${newIssueId}`)
            else navigate(-1)
          }, 800)
        }
      } catch (e) {}
    })

    // Responses for delete_message (single message)
    newSocket.on('delete_message_success', (payload) => {
      try {
        if (payload.scope === 'for_me') {
          // remove message from local view
          const msgId = payload?.messageId
          if (msgId) {
            setMessages(prev => (prev || []).filter(m => m.id !== msgId))
            setOpenMessageMenu(null)
          }
          // optional brief user feedback
          try { alert('Message removed from your view') } catch (e) {}
        } else if (payload.scope === 'for_everyone') {
          try { alert('Message deleted for everyone') } catch (e) {}
        }
      } catch (e) {}
    })

    newSocket.on('delete_message_error', (err) => {
      try {
        const msg = err && (err.error || err.message) ? (err.error || err.message) : 'Failed to delete message'
        alert(msg)
      } catch (e) {}
    })

    newSocket.on('message_deleted', (payload) => {
      try {
        const { messageId } = payload || {}
        if (!messageId) return
        setMessages((prev) => (prev || []).filter(m => m.id !== messageId))
      } catch (e) {}
    })

    // Responses for delete_chat
    newSocket.on('delete_chat_success', (payload) => {
      try {
        if (payload.scope === 'for_me') {
          alert('Chat removed from your view')
        } else if (payload.scope === 'for_everyone') {
          alert('Chat deleted for everyone')
            navigate(-1)
        }
      } catch (e) {}
    })

    newSocket.on('delete_chat_error', (err) => {
      try {
        const msg = err && (err.error || err.message) ? (err.error || err.message) : 'Failed to delete chat'
        alert(msg)
      } catch (e) {}
    })

    // If the mentor user receives a direct notification that they were blocked
    newSocket.on('blocked_by_teen', (data) => {
      try {
        const { teenId, mentorId, issueIds } = data || {};
        if (user && user.role === 'mentor' && user.id === mentorId && Array.isArray(issueIds) && issueIds.includes(parseInt(issueId))) {
          setIsMentorBlockedOnThisIssue(true)
        }
      } catch (e) {}
    })

    newSocket.on('unblocked_by_teen', (data) => {
      try {
        const { teenId, mentorId } = data || {};
        if (user && user.role === 'mentor' && user.id === mentorId) {
          setIsMentorBlockedOnThisIssue(false)
        }
      } catch (e) {}
    })

    return () => {
      try {
        newSocket.off()
        newSocket.off('blocked_list')
        newSocket.off('block_success')
        newSocket.off('unblock_success')
  newSocket.off('delete_chat_success')
  newSocket.off('delete_chat_error')
  newSocket.off('delete_message_success')
  newSocket.off('delete_message_error')
  newSocket.off('message_deleted')
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

  // Helper to format timestamps (hours and minutes only)
  const formatTime = (ts) => {
    try {
      if (!ts) return ''
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch (e) {
      return ''
    }
  }

  if (!issue) return <div className="p-4">Issue not found</div>

  return (
    <div className="container chat-container py-4">
      <div className="row">
        <div className="col-lg-8 col-12 mb-3">
          <div className="d-flex align-items-center mb-3">
            <button className="btn btn-link p-0 me-3" onClick={() => navigate(-1)}>← Back</button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
              <h3 className="mb-0">{issue.title}</h3>
              <div className="text-muted small">Mentor: {issue.assignedMentor?.name || 'Unassigned'}</div>
              {/* {issue.assignedMentor?.email && (
                <div className="text-muted small">Mentor email: {issue.assignedMentor.email}</div>
              )} */}
              {isMentorBlockedOnThisIssue && (
                <div className="mt-2 alert alert-warning p-2 small">This mentor has been blocked by the teen for this issue — chat is paused with them. The issue is open for other mentors to take over.</div>
              )}
              {/* Block/unblock controls visible only to the teen who owns this issue */}
              {user && user.role === 'teen' && issue && issue.assignedMentor && (
                (() => {
                  const isBlocked = blockedIds.includes(issue.assignedMentor.id)
                  return (
                    <div className="mt-2 d-flex align-items-center">
                      {isBlocked ? (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => socket && socket.emit('unblock_mentor', { teenId: user.id, mentorId: issue.assignedMentor.id })}>Unblock Mentor</button>
                      ) : (
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => socket && socket.emit('block_mentor', { teenId: user.id, mentorId: issue.assignedMentor.id })}>Block Mentor</button>
                      )}
                      {/* small spacer */}
                      <div style={{ width: 8 }} />
                      {/* triple-dot header menu trigger */}
                      <div style={{ position: 'relative' }}>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowHeaderMenu(s => !s)} aria-label="Open menu">⋮</button>
                        {showHeaderMenu && (
                          <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 50, minWidth: 200 }}>
                            <div className="card shadow-sm">
                              <div className="list-group list-group-flush">
                                {/* <button className="list-group-item list-group-item-action" onClick={() => {
                                  setShowHeaderMenu(false)
                                  console.debug('Delete for me clicked', { socket })
                                  if (!socket || (socket && socket.connected === false)) return alert('Not connected to server')
                                  if (!confirm('Delete this chat for me? This will only remove it from your view.')) return
                                  socket.emit('delete_chat', { issueId: parseInt(issueId), scope: 'for_me' })
                                }}>Delete for me</button> */}
                                {/* show delete for everyone only if authorized */}
                                {((user && issue.createdBy === user.id) || (user && user.role === 'mentor' && issue.assignedMentor && issue.assignedMentor.id === user.id)) && (
                                  <button className="list-group-item list-group-item-action text-danger" onClick={() => {
                                    setShowHeaderMenu(false)
                                    console.debug('Delete for everyone clicked', { socket })
                                    if (!socket || (socket && socket.connected === false)) return alert('Not connected to server')
                                    if (!confirm('Delete this chat for everyone? This will permanently remove messages and the issue for all participants.')) return
                                    socket.emit('delete_chat', { issueId: parseInt(issueId), scope: 'for_everyone' })
                                  }}>Delete the issue</button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()
              )}
              </div>
              <div className={`small ${isConnected ? 'text-success' : 'text-danger'}`}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
              {chatDeletedNotice && (
                <div className="mt-2 alert alert-info p-2 small">This chat was archived and a new issue was created — redirecting...</div>
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

              const ts = m.createdAt || m.created_at;
              return (
                <div
                  key={m.id}
                  className={`mb-2 d-flex flex-column ${alignClass}`}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div className={`px-3 py-2 rounded-3 ${bubbleColor}`} style={{ maxWidth: '70%' }}>
                      <div className="small fw-bold mb-1">
                        {resolveSenderName(m.senderId, m.senderRole)}{' '}
                        <span className="text-muted">· {ts ? formatTime(ts) : ''}</span>
                      </div>
                      {m.moderation && m.moderation.summaryScores && (
                        (() => {
                          const scores = m.moderation.summaryScores;
                          const entries = Object.entries(scores).filter(([, v]) => typeof v === 'number');
                          if (entries.length === 0) return null;
                          entries.sort((a, b) => b[1] - a[1]);
                          const [topAttr, topVal] = entries[0];
                          return (
                            <div className="mt-1">
                              <span className="badge bg-warning text-dark" style={{fontSize: '0.72rem'}}>
                                {topAttr.replace(/_/g, ' ')}: {(topVal * 100).toFixed(0)}%
                              </span>
                            </div>
                          );
                        })()
                      )}
                      <div>{m.text}</div>
                    </div>
                    <div style={{ marginLeft: 8, position: 'relative' }}>
                      <button className="btn btn-sm btn-light" onClick={() => setOpenMessageMenu(openMessageMenu === m.id ? null : m.id)}>⋯</button>
                      {openMessageMenu === m.id && (
                        <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 60 }}>
                          <div className="card shadow-sm">
                            <div className="list-group list-group-flush">
                              <button className="list-group-item list-group-item-action" onClick={() => {
                                setOpenMessageMenu(null)
                                console.debug('Delete message for me clicked', { messageId: m.id })
                                if (!socket || (socket && socket.connected === false)) return alert('Not connected to server')
                                if (!confirm('Delete this message for me?')) return
                                socket.emit('delete_message', { messageId: m.id, issueId: parseInt(issueId), scope: 'for_me' })
                              }}>Delete for me</button>
                              {(user && Number(m.senderId) === Number(user.id)) && (
                                <button className="list-group-item list-group-item-action text-danger" onClick={() => {
                                  setOpenMessageMenu(null)
                                  console.debug('Delete message for everyone clicked', { messageId: m.id })
                                  if (!socket || (socket && socket.connected === false)) return alert('Not connected to server')
                                  if (!confirm('Delete this message for everyone? This action cannot be undone.')) return
                                  socket.emit('delete_message', { messageId: m.id, issueId: parseInt(issueId), scope: 'for_everyone' })
                                }}>Delete for everyone</button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
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
              disabled={!issue.assignedMentor || !isConnected || isMentorBlockedOnThisIssue}
              className="form-control"
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={!issue.assignedMentor || !isConnected || isMentorBlockedOnThisIssue}
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
