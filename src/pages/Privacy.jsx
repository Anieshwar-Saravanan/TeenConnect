import React from 'react'

export default function Privacy() {
  return (
    <div className="container page-card py-4">
      <h2>Privacy Policy (Summary)</h2>
      <p>We take your privacy seriously. This is a brief summary for demonstration purposes.</p>
      <ul>
        <li>Conversations are private and only visible to participating users and moderators when required for safety.</li>
        <li>We avoid collecting unnecessary personal information. Do not share emails, phone numbers, or other PII in chats.</li>
        <li>We may retain anonymized logs for safety and improvement. Sensitive data is handled according to our internal policies.</li>
      </ul>
      <h3>Data retention</h3>
      <p>Messages and flags may be retained temporarily to support moderation and safety responses.</p>
      <h3>Contact</h3>
      <p>Questions about privacy? Email <a href="mailto:privacy@teenconnect.example">privacy@teenconnect.example</a>.</p>
    </div>
  )
}
