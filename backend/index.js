require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { createServer } = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    credentials: true
  }
});

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const connectedUsers = new Map();

const otpStore = new Map();

let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS // app password
    }
  });
  transporter.verify().then(() => console.log('Gmail transporter ready')).catch(e => console.warn('Gmail transporter verify failed:', e.message));
} else {
  console.log('Gmail SMTP not configured — OTPs will be logged to console or returned to client in dev mode');
}

async function sendOtpEmail(email, otp) {
  if (!transporter) throw new Error('SMTP not configured');
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Your TeenConnect OTP',
    text: `Your verification code is: ${otp}`,
    html: `<p>Your verification code is: <strong>${otp}</strong></p>`
  };
  return transporter.sendMail(mailOptions);
}

// Perspective API helper
const PERSPECTIVE_KEY = process.env.PERSPECTIVE_API_KEY || process.env.PERSPECTIVE_KEY || null;
async function analyzeText(text) {
  if (!PERSPECTIVE_KEY) return null;
  try {
    const resp = await fetch(`https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${PERSPECTIVE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment: { text },
        languages: ['en'],
        requestedAttributes: { TOXICITY: {}, SEVERE_TOXICITY: {}, INSULT: {}, THREAT: {}, SEXUALLY_EXPLICIT: {}, IDENTITY_ATTACK: {} }
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.attributeScores || null;
  } catch (e) {
    console.warn('Perspective analyze error:', e.message);
    return null;
  }
}

// Simple PII detection regexes (email and common phone patterns)
const PII_EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PII_PHONE_REGEX = /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{1,4}\)[\s-]?|\d{1,4}[\s-])?\d{3,4}[\s-]?\d{3,4}/;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('authenticate', async (data) => {
    try {
      const { userId, role } = data;
      // check if mentor is forbidden
      if (role === 'mentor') {
        try {
          const { rows: urows } = await pool.query('SELECT forbidden FROM users WHERE id=$1', [userId]);
          if (urows.length && urows[0].forbidden) {
            socket.emit('forbidden', { message: 'You have been forbidden from the platform' });
            socket.disconnect(true);
            return;
          }
        } catch (e) {}
      }
      socket.userId = userId;
      socket.role = role;
      connectedUsers.set(userId, socket.id);

      socket.join(`user_${userId}`);

      socket.emit('authenticated', { success: true });
      console.log(`User ${userId} authenticated as ${role}`);
    } catch (error) {
      socket.emit('error', { message: 'Authentication failed' });
    }
  });

  socket.on('signup', async (data) => {
    const { name, email, password, role } = data;
    console.log('Signup request:', { name, email, role });
    try {
      const { rows } = await pool.query(
        'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, email, password, role]
      );
      socket.emit('signup_success', rows[0]);
    } catch (err) {
      console.error('Signup error:', err);
      socket.emit('signup_error', { error: err.message });
    }
  });


  socket.on('login', async (data) => {
    const { email, password, role } = data;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND password = $2 AND role = $3',
        [email, password, role]
      );
      if (rows.length) {
        socket.emit('login_success', rows[0]);
      } else {
        socket.emit('login_error', { error: 'Invalid credentials' });
      }
    } catch (err) {
      socket.emit('login_error', { error: err.message });
    }
  });


  socket.on('send_otp', async (data) => {
    const { email, role } = data;
    try {

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore.set(email, { otp, role, timestamp: Date.now() });
      console.log(`Generated OTP for ${email}`);

      if (transporter) {
        try {
          await sendOtpEmail(email, otp);
          socket.emit('otp_sent', { success: true });
        } catch (mailErr) {
          console.error('Failed to send OTP email:', mailErr);
          socket.emit('otp_error', { error: 'Failed to send OTP email' });
        }
      } else {
        // In non-configured environments we do NOT return the OTP to the client.
        // For safety, emit an error instructing to configure SMTP. If you need
        // a quick dev fallback, set OTP_ALLOW_PLAIN=true in your .env to allow
        // server-side logging of the OTP (still not returned to clients).
        console.warn(`SMTP not configured - OTP generated for ${email} but not sent`);
        if (process.env.OTP_ALLOW_PLAIN === 'true') {
          console.log(`DEV OTP for ${email}: ${otp}`);
        }
        socket.emit('otp_error', { error: 'SMTP not configured. OTP not sent.' });
      }
    } catch (err) {
      socket.emit('otp_error', { error: 'Failed to send OTP' });
    }
  });


  socket.on('verify_otp', async (data) => {
    const { email, otp, role } = data;
    try {
      const stored = otpStore.get(email);
      if (!stored || stored.otp !== otp || stored.role !== role) {
        socket.emit('otp_verify_error', { error: 'Invalid OTP' });
        return;
      }


      if (Date.now() - stored.timestamp > 5 * 60 * 1000) {
        otpStore.delete(email);
        socket.emit('otp_verify_error', { error: 'OTP expired' });
        return;
      }

          
      let { rows } = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND role = $2',
        [email, role]
      );

      if (rows.length === 0) {

        const { rows: newRows } = await pool.query(
          'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
          [email.split('@')[0], email, 'otp_user', role]
        );
        rows = newRows;
      }

      otpStore.delete(email);
      socket.emit('otp_login_success', rows[0]);
    } catch (err) {
      socket.emit('otp_verify_error', { error: err.message });
    }
  });

  socket.on('get_mentors', async () => {
    try {
      const { rows } = await pool.query("SELECT id, name, email FROM users WHERE role = 'mentor' AND (forbidden IS NULL OR forbidden = FALSE)");
      socket.emit('mentors_data', rows);
    } catch (err) {
      console.error('Get mentors error:', err);
      socket.emit('mentors_error', { error: 'Failed to fetch mentors' });
    }
  });

  // Block a mentor (teen action)
  socket.on('block_mentor', async (data) => {
    const { mentorId } = data || {};
    if (socket.role !== 'teen' || !socket.userId) return socket.emit('block_error', { error: 'Not allowed' });
    try {
      await pool.query(
        'INSERT INTO blocked_mentors (teen_id, mentor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [socket.userId, mentorId]
      );

      // After inserting the block, count how many distinct teens have blocked this mentor
      try {
        const { rows: countRows } = await pool.query('SELECT COUNT(DISTINCT teen_id) as cnt FROM blocked_mentors WHERE mentor_id=$1', [mentorId]);
        const cnt = parseInt(countRows[0] && countRows[0].cnt) || 0;
        const FORBID_THRESHOLD = 5;
        if (cnt >= FORBID_THRESHOLD) {
          // mark mentor as forbidden
          try {
            await pool.query('UPDATE users SET forbidden = TRUE WHERE id=$1', [mentorId]);
            // notify and disconnect the mentor if connected
            io.to(`user_${mentorId}`).emit('forbidden', { message: 'You have been forbidden from the platform due to multiple blocks' });
            const sockId = connectedUsers.get(mentorId);
            if (sockId) {
              const s = io.sockets.sockets.get(sockId);
              if (s) s.disconnect(true);
            }
          } catch (e) {
            console.warn('Failed to set forbidden flag for mentor', mentorId, e.message);
          }
        }
      } catch (e) {
        console.warn('Failed to count blocks for mentor', mentorId, e.message);
      }

      // Unassign this mentor from any issues created by this teen and mark blocked metadata
      const { rows: updated } = await pool.query(
        'UPDATE issues SET assigned_mentor = NULL WHERE assigned_mentor = $1 AND created_by = $2 RETURNING *',
        [mentorId, socket.userId]
      );

      // Notify the blocked mentor directly (if connected)
      io.to(`user_${mentorId}`).emit('blocked_by_teen', { teenId: socket.userId, mentorId, issueIds: updated.map(u => u.id) });

      // For each affected issue: delete its messages and replace it with a new issue
      for (const issue of updated) {
        const oldIssueId = issue.id;
        const title = issue.title;
        const description = issue.description;
        const createdBy = issue.created_by;

        // Delete existing messages for the old chat
        try {
          await pool.query('DELETE FROM messages WHERE issue_id=$1', [oldIssueId]);
        } catch (e) {
          console.warn('Failed to delete messages for old issue', oldIssueId, e.message);
        }

        // Remove the old issue row so the previous chat is removed
        try {
          await pool.query('DELETE FROM issues WHERE id=$1', [oldIssueId]);
        } catch (e) {
          console.warn('Failed to delete old issue', oldIssueId, e.message);
        }

        // Create a fresh issue so others can pick it up
        let newIssueRow = null;
        try {
          const { rows: newRows } = await pool.query(
            'INSERT INTO issues (title, description, created_by) VALUES ($1, $2, $3) RETURNING *',
            [title, description, createdBy]
          );
          newIssueRow = newRows[0];
        } catch (e) {
          console.error('Failed to create replacement issue for old', oldIssueId, e.message);
        }

        const newIssue = newIssueRow ? {
          id: newIssueRow.id,
          title: newIssueRow.title,
          description: newIssueRow.description,
          createdBy: newIssueRow.created_by,
          assignedMentor: null,
          createdAt: newIssueRow.created_at
        } : null;

        // Notify anyone in the old issue room that the chat was deleted and provide the new issue id
        io.to(`issue_${oldIssueId}`).emit('chat_deleted', { oldIssueId, newIssueId: newIssue ? newIssue.id : null });

        // Broadcast that the old issue was removed so dashboards refresh
        io.emit('issue_removed', { id: oldIssueId });

        // Broadcast the new issue so others see it
        if (newIssue) io.emit('new_issue', newIssue);
      }

      socket.emit('block_success', { mentorId });
    } catch (err) {
      console.error('Block mentor error:', err);
      socket.emit('block_error', { error: err.message });
    }
  });

  // Unblock a mentor (teen action)
  socket.on('unblock_mentor', async (data) => {
    const { mentorId } = data || {};
    if (socket.role !== 'teen' || !socket.userId) return socket.emit('unblock_error', { error: 'Not allowed' });
    try {
      await pool.query('DELETE FROM blocked_mentors WHERE teen_id=$1 AND mentor_id=$2', [socket.userId, mentorId]);
      // Notify the mentor they have been unblocked
      io.to(`user_${mentorId}`).emit('unblocked_by_teen', { teenId: socket.userId, mentorId });
      socket.emit('unblock_success', { mentorId });
    } catch (err) {
      console.error('Unblock mentor error:', err);
      socket.emit('unblock_error', { error: err.message });
    }
  });

  // Get blocked mentors for the authenticated teen
  socket.on('get_blocked_mentors', async () => {
    if (!socket.userId) return socket.emit('blocked_list', []);
    try {
      const { rows } = await pool.query('SELECT mentor_id FROM blocked_mentors WHERE teen_id=$1', [socket.userId]);
      socket.emit('blocked_list', rows.map(r => r.mentor_id));
    } catch (err) {
      console.error('Get blocked mentors error:', err);
      socket.emit('blocked_list', []);
    }
  });

  // Get issues
  socket.on('get_issues', async () => {
    try {
      const { rows } = await pool.query('SELECT * FROM issues');
      const issues = await Promise.all(rows.map(async (issue) => {
        let assignedMentor = null;
        if (issue.assigned_mentor) {
          const mentorRes = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [issue.assigned_mentor]);
          if (mentorRes.rows.length) {
            assignedMentor = mentorRes.rows[0];
          }
        }
        return {
          id: issue.id,
          title: issue.title,
          description: issue.description,
          createdBy: issue.created_by,
          assignedMentor,
          createdAt: issue.created_at
        };
      }));
      socket.emit('issues_data', issues);
    } catch (err) {
      socket.emit('issues_error', { error: 'Failed to fetch issues' });
    }
  });

  // Create issue
  socket.on('create_issue', async (data) => {
    let { title, description, created_by, createdBy } = data;
    if (!created_by && createdBy) created_by = createdBy;
    if (!created_by) {
      socket.emit('create_issue_error', { error: 'created_by is required' });
      return;
    }
    try {
      // block creation if PII detected in title/description
      try {
        if (PII_EMAIL_REGEX.test(title) || PII_EMAIL_REGEX.test(description) || PII_PHONE_REGEX.test(title) || PII_PHONE_REGEX.test(description)) {
          // try logging violation if table exists
          try {
            await pool.query('INSERT INTO pii_violations (user_id, issue_id, detected_text, detected_type) VALUES ($1, $2, $3, $4)', [created_by, null, `${title}\n${description}`, 'email_or_phone']);
          } catch (e) {}
          socket.emit('create_issue_error', { error: 'Do not share your personal info' });
          return;
        }
      } catch (e) {}
      const { rows } = await pool.query(
        'INSERT INTO issues (title, description, created_by) VALUES ($1, $2, $3) RETURNING *',
        [title, description, created_by]
      );
      const issue = rows[0];
      const newIssue = {
        id: issue.id,
        title: issue.title,
        description: issue.description,
        createdBy: issue.created_by,
        assignedMentor: null,
        createdAt: issue.created_at
      };

      io.emit('new_issue', newIssue);
      socket.emit('create_issue_success', newIssue);
    } catch (err) {
      socket.emit('create_issue_error', { error: err.message });
    }
  });


  socket.on('assign_issue', async (data) => {
    const { issueId, mentorId, mentorName } = data;
    console.log('Assign request:', { issueId, mentorId, mentorName });
    try {
      // Check if the teen that created this issue has blocked this mentor
      const issueRes = await pool.query('SELECT created_by FROM issues WHERE id=$1', [issueId]);
      const teenId = issueRes.rows[0] && issueRes.rows[0].created_by;
      if (teenId) {
        const blockedRes = await pool.query('SELECT 1 FROM blocked_mentors WHERE teen_id=$1 AND mentor_id=$2', [teenId, mentorId]);
        if (blockedRes.rows.length) {
          socket.emit('assign_issue_error', { error: 'This mentor is blocked by the teen' });
          return;
        }
      }
      // prevent assigning if mentor is forbidden
      try {
        const { rows: forb } = await pool.query('SELECT forbidden FROM users WHERE id=$1', [mentorId]);
        if (forb.length && forb[0].forbidden) {
          socket.emit('assign_issue_error', { error: 'This mentor is forbidden from the site' });
          return;
        }
      } catch (e) {}
      const result = await pool.query(
        'UPDATE issues SET assigned_mentor = $1 WHERE id = $2 RETURNING *',
        [mentorId, issueId]
      );
      if (result.rows.length === 0) {
        socket.emit('assign_issue_error', { error: 'Issue not found' });
        return;
      }

      const updatedIssue = result.rows[0];
      let assignedMentor = null;
      if (updatedIssue.assigned_mentor) {
        const mentorRes = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [updatedIssue.assigned_mentor]);
        if (mentorRes.rows.length) {
          assignedMentor = mentorRes.rows[0];
        }
      }

      const issueData = {
        id: updatedIssue.id,
        title: updatedIssue.title,
        description: updatedIssue.description,
        createdBy: updatedIssue.created_by,
        assignedMentor,
        createdAt: updatedIssue.created_at
      };


      io.emit('issue_updated', issueData);
      socket.emit('assign_issue_success', issueData);

      // Send assignment email to the teen (issue creator) (if SMTP configured)
      try {
        if (transporter && issueData && issueData.createdBy) {
          // fetch teen's email/name
          try {
            const { rows: teenRows } = await pool.query('SELECT id, name, email FROM users WHERE id=$1', [issueData.createdBy]);
            if (teenRows.length && teenRows[0].email) {
              const teen = teenRows[0];
              const mailOptions = {
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: teen.email,
                subject: `A mentor was assigned to your issue: ${issueData.title}`,
                text: `Hi ${teen.name || 'User'},\n\nA mentor (${assignedMentor?.name || 'Mentor'}) has been assigned to your issue titled "${issueData.title}".\n\nDescription:\n${issueData.description || ''}\n\nOpen the app to view the chat: http://localhost:5173/chat/${issueData.id}\n\nThanks,\nTeenConnect`,
                html: `<p>Hi ${teen.name || 'User'},</p><p>A mentor (<strong>${assignedMentor?.name || 'Mentor'}</strong>) has been assigned to your issue titled "<strong>${issueData.title}</strong>".</p><p>${issueData.description || ''}</p><p><a href="http://localhost:5173/chat/${issueData.id}">Open chat</a></p><p>— TeenConnect</p>`
              };
              transporter.sendMail(mailOptions).then(() => {
                console.log('Assignment email sent to teen', teen.email);
              }).catch((e) => {
                console.warn('Failed to send assignment email to teen', teen.email, e.message);
              });
            }
          } catch (e) {
            console.warn('Failed to fetch teen user for assignment email', e.message);
          }
        }
      } catch (e) {
        console.warn('Error while attempting to send assignment email', e.message);
      }
    } catch (err) {
      console.error('Assign issue error:', err);
      socket.emit('assign_issue_error', { error: 'Failed to assign issue', details: err.message });
    }
  });

  socket.on('join_issue', async (data) => {
    const { issueId } = data;
    socket.join(`issue_${issueId}`);

    try {
      // Send existing messages
      const { rows } = await pool.query(
        'SELECT * FROM messages WHERE issue_id = $1 ORDER BY created_at ASC',
        [issueId]
      );
      const messages = rows.map(m => ({
        ...m,
        senderId: m.sender_id,
        createdAt: m.created_at
      }));
      socket.emit('issue_messages', messages);
    } catch (err) {
      socket.emit('messages_error', { error: 'Failed to fetch messages' });
    }
  });


  socket.on('send_message', async (data) => {
    const { issueId, senderId, senderRole, text } = data;

    if (!text.trim()) return;

    try {
      // block messages containing PII
      try {
        if (PII_EMAIL_REGEX.test(text) || PII_PHONE_REGEX.test(text)) {
          try {
            await pool.query('INSERT INTO pii_violations (user_id, issue_id, message_id, detected_text, detected_type) VALUES ($1, $2, $3, $4, $5)', [senderId, issueId, null, text, 'email_or_phone']);
          } catch (e) {}
          socket.emit('send_message_error', { error: 'Do not share your personal info' });
          return;
        }
      } catch (e) {}
      // If the sender is a mentor, ensure they are not blocked by the teen who created the issue
      if (senderRole === 'mentor') {
        // check forbidden
        try {
          const { rows: f } = await pool.query('SELECT forbidden FROM users WHERE id=$1', [senderId]);
          if (f.length && f[0].forbidden) {
            socket.emit('send_message_error', { error: 'You are forbidden from the site' });
            return;
          }
        } catch (e) {}
        const issueRes = await pool.query('SELECT created_by FROM issues WHERE id=$1', [issueId]);
        const teenId = issueRes.rows[0] && issueRes.rows[0].created_by;
        if (teenId) {
          const blockedRes = await pool.query('SELECT 1 FROM blocked_mentors WHERE teen_id=$1 AND mentor_id=$2', [teenId, senderId]);
          if (blockedRes.rows.length) {
            socket.emit('send_message_error', { error: 'You are blocked by this teen' });
            return;
          }
        }
      }
      // Analyze text before saving to database so we can block toxic messages
      let moderationRaw = null;
      try {
        moderationRaw = await analyzeText(text.trim());
      } catch (e) {
        moderationRaw = null;
      }

      if (senderRole === 'mentor' && moderationRaw) {
        const summaryScores = {};
        for (const attr of Object.keys(moderationRaw)) {
          try {
            const attrObj = moderationRaw[attr];
            const val = attrObj && attrObj.summaryScore && typeof attrObj.summaryScore.value === 'number'
              ? attrObj.summaryScore.value
              : 0;
            summaryScores[attr] = val;
          } catch (inner) {
            summaryScores[attr] = 0;
          }
        }
        const toxicity = summaryScores.TOXICITY || 0;
        const severe = summaryScores.SEVERE_TOXICITY || 0;
        const BLOCK_THRESHOLD = 0.8; // tuneable
        if (toxicity >= BLOCK_THRESHOLD || severe >= BLOCK_THRESHOLD) {
          socket.emit('send_message_error', { error: 'Message blocked: violates community safety policies' });
          return;
        }
      }

      // Safe to insert message
      const { rows } = await pool.query(
        'INSERT INTO messages (issue_id, sender_id, text) VALUES ($1, $2, $3) RETURNING *',
        [issueId, senderId, text.trim()]
      );

      const newMessage = {
        ...rows[0],
        senderId: rows[0].sender_id,
        createdAt: rows[0].created_at
      };

      // attach moderation summary if available
      if (moderationRaw) {
        const summaryScores = {};
        for (const attr of Object.keys(moderationRaw)) {
          try {
            const attrObj = moderationRaw[attr];
            const val = attrObj && attrObj.summaryScore && typeof attrObj.summaryScore.value === 'number'
              ? attrObj.summaryScore.value
              : null;
            summaryScores[attr] = val;
          } catch (inner) {
            summaryScores[attr] = null;
          }
        }
        newMessage.moderation = { summaryScores };
      } else {
        newMessage.moderation = null;
      }

      io.to(`issue_${issueId}`).emit('new_message', newMessage);

    } catch (err) {
      socket.emit('send_message_error', { error: 'Failed to send message' });
    }
  });

  // Delete chat (like WhatsApp): support two scopes
  // { issueId, scope: 'for_me' | 'for_everyone' }
  socket.on('delete_chat', async (data) => {
    const { issueId, scope } = data || {};
    console.log('delete_chat event', { socketUserId: socket.userId, socketRole: socket.role, payload: data });

    if (!issueId || !scope) return socket.emit('delete_chat_error', { error: 'issueId and scope required' });

    try {
      // for_me: simply acknowledge so the client can remove local view
      if (scope === 'for_me') {
        socket.emit('delete_chat_success', { scope: 'for_me', issueId });
        return;
      }

      // for_everyone: only allow the issue creator or the assigned mentor to delete for everyone
      if (scope === 'for_everyone') {
        if (!socket.userId) return socket.emit('delete_chat_error', { error: 'Not authenticated' });
        // fetch issue
        const { rows: issueRows } = await pool.query('SELECT * FROM issues WHERE id=$1', [issueId]);
        if (!issueRows.length) return socket.emit('delete_chat_error', { error: 'Issue not found' });
        const issue = issueRows[0];

        const isCreator = Number(issue.created_by) === Number(socket.userId);
        const isAssignedMentor = Number(issue.assigned_mentor) === Number(socket.userId) && socket.role === 'mentor';
        if (!isCreator && !isAssignedMentor) {
          console.warn('Unauthorized delete_chat attempt', { issueId, socketUserId: socket.userId, issueCreatedBy: issue.created_by, assignedMentor: issue.assigned_mentor });
          return socket.emit('delete_chat_error', { error: 'Not authorized to delete for everyone' });
        }

        // Delete messages for the issue
        try {
          await pool.query('DELETE FROM messages WHERE issue_id=$1', [issueId]);
        } catch (e) {
          console.warn('Failed to delete messages for issue during delete_chat', issueId, e.message);
        }

        // Delete the issue row
        try {
          await pool.query('DELETE FROM issues WHERE id=$1', [issueId]);
        } catch (e) {
          console.warn('Failed to delete issue during delete_chat', issueId, e.message);
        }

        // Notify room and broadcast removal
        io.to(`issue_${issueId}`).emit('chat_deleted', { oldIssueId: issueId, newIssueId: null });
        io.emit('issue_removed', { id: issueId });

        socket.emit('delete_chat_success', { scope: 'for_everyone', issueId });
        return;
      }

      socket.emit('delete_chat_error', { error: 'Invalid scope' });
    } catch (err) {
      console.error('delete_chat error:', err);
      socket.emit('delete_chat_error', { error: 'Failed to delete chat' });
    }
  });

  // Delete a single message
  // payload: { messageId, issueId, scope: 'for_me' | 'for_everyone' }
  socket.on('delete_message', async (data) => {
    const { messageId, issueId, scope } = data || {};
    console.log('delete_message event', { socketUserId: socket.userId, socketRole: socket.role, payload: data });
    if (!messageId || !issueId || !scope) return socket.emit('delete_message_error', { error: 'messageId, issueId and scope required' });

    try {
      if (scope === 'for_me') {
        // client-side only acknowledgement
        socket.emit('delete_message_success', { scope: 'for_me', messageId, issueId });
        return;
      }

      if (scope === 'for_everyone') {
        if (!socket.userId) return socket.emit('delete_message_error', { error: 'Not authenticated' });
        // fetch message and verify authorization
        const { rows: msgRows } = await pool.query('SELECT * FROM messages WHERE id=$1 AND issue_id=$2', [messageId, issueId]);
        if (!msgRows.length) return socket.emit('delete_message_error', { error: 'Message not found' });
        const msg = msgRows[0];

        // Only the original sender may delete their message for everyone
        const isSender = Number(msg.sender_id) === Number(socket.userId);
        if (!isSender) {
          console.warn('Unauthorized delete_message attempt by non-sender', { messageId, issueId, socketUserId: socket.userId, msgSender: msg.sender_id });
          return socket.emit('delete_message_error', { error: 'Only the message sender can delete this message for everyone' });
        }

        // perform deletion
        try {
          await pool.query('DELETE FROM messages WHERE id=$1', [messageId]);
        } catch (e) {
          console.error('Failed to delete message', messageId, e.message);
        }

        // notify room that message was deleted
        io.to(`issue_${issueId}`).emit('message_deleted', { messageId, issueId });
        socket.emit('delete_message_success', { scope: 'for_everyone', messageId, issueId });
        return;
      }

      socket.emit('delete_message_error', { error: 'Invalid scope' });
    } catch (err) {
      console.error('delete_message error:', err);
      socket.emit('delete_message_error', { error: 'Failed to delete message' });
    }
  });


  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
    }
  });
});


  app.get('/api/issues/:id', async (req, res) => {
    const issueId = req.params.id;
    try {
      const result = await pool.query('SELECT * FROM issues WHERE id = $1', [issueId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Issue not found' });
      }
      const issue = result.rows[0];
      let assignedMentor = null;
      if (issue.assigned_mentor) {
        const mentorRes = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [issue.assigned_mentor]);
        if (mentorRes.rows.length) assignedMentor = mentorRes.rows[0];
      }
      res.json({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        createdBy: issue.created_by,
        assignedMentor,
        createdAt: issue.created_at
      });
    } catch (err) {
      console.error('Get issue by ID error:', err);
      res.status(500).json({ error: 'Failed to fetch issue' });
    }
  });

  app.get('/api/issues/:id/messages', async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await pool.query('SELECT * FROM messages WHERE issue_id = $1 ORDER BY created_at ASC', [id]);
      const messages = rows.map(m => ({
        ...m,
        senderId: m.sender_id,
        createdAt: m.created_at
      }));
      res.json(messages);
    } catch (err) {
      console.error('Get messages error:', err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

const PORT = 5001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));