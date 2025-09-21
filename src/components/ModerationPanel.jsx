import React from 'react'

export default function ModerationPanel({ messages }) {
  const last = messages.length ? messages[messages.length - 1] : null;
  const summary = last && last.moderation && last.moderation.summaryScores ? last.moderation.summaryScores : null;

  return (
    <aside className="moderation-panel">
      <h4>AI Moderation</h4>
      <p className="muted">This area shows moderation insights for the latest message.</p>
      <div className="moderation-sample">
        <strong>Last message checked:</strong>
        <div className="muted">{last ? last.text : '—'}</div>
      </div>
      <div style={{marginTop:12}}>
        <strong>Scores:</strong>
        {!summary && <div className="muted">No moderation available</div>}
        {summary && (
          <ul style={{paddingLeft:16}}>
            {Object.entries(summary).map(([k,v]) => (
              <li key={k}>{k.replace(/_/g,' ')}: {v === null ? '—' : (v*100).toFixed(0) + '%'}</li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
