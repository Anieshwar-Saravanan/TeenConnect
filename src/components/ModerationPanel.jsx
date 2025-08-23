import React from 'react'

export default function ModerationPanel({ messages }) {
  return (
    <aside className="moderation-panel">
      <h4>AI Moderation (placeholder)</h4>
      <p className="muted">This area would show moderation insights (mocked).</p>
      <div className="moderation-sample">
        <strong>Last message checked:</strong>
        <div className="muted">{messages.length ? messages[messages.length - 1].text : '—'}</div>
      </div>
    </aside>
  )
}
