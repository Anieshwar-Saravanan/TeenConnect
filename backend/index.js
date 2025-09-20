require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { createServer } = require('http');
const { Server } = require('socket.io');

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

// Track connected users: userId -> socketId
const connectedUsers = new Map();

// Store OTPs temporarily (in production, use Redis or similar)
const otpStore = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User authentication
  socket.on('authenticate', async (data) => {
    try {
      const { userId, role } = data;
      socket.userId = userId;
      socket.role = role;
      connectedUsers.set(userId, socket.id);

      // Join user-specific room
      socket.join(`user_${userId}`);

      socket.emit('authenticated', { success: true });
      console.log(`User ${userId} authenticated as ${role}`);
    } catch (error) {
      socket.emit('error', { message: 'Authentication failed' });
    }
  });

  // Signup
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

  // Login
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

  // Send OTP
  socket.on('send_otp', async (data) => {
    const { email, role } = data;
    try {
      // Generate a 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore.set(email, { otp, role, timestamp: Date.now() });

      // In production, send email here
      console.log(`OTP for ${email}: ${otp}`);

      socket.emit('otp_sent', { success: true, otp }); // For demo purposes
    } catch (err) {
      socket.emit('otp_error', { error: 'Failed to send OTP' });
    }
  });

  // Verify OTP
  socket.on('verify_otp', async (data) => {
    const { email, otp, role } = data;
    try {
      const stored = otpStore.get(email);
      if (!stored || stored.otp !== otp || stored.role !== role) {
        socket.emit('otp_verify_error', { error: 'Invalid OTP' });
        return;
      }

      // Check if OTP is expired (5 minutes)
      if (Date.now() - stored.timestamp > 5 * 60 * 1000) {
        otpStore.delete(email);
        socket.emit('otp_verify_error', { error: 'OTP expired' });
        return;
      }

      // Find or create user
      let { rows } = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND role = $2',
        [email, role]
      );

      if (rows.length === 0) {
        // Create user if doesn't exist
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

  // Get mentors
  socket.on('get_mentors', async () => {
    try {
      const { rows } = await pool.query("SELECT id, name, email FROM users WHERE role = 'mentor'");
      socket.emit('mentors_data', rows);
    } catch (err) {
      console.error('Get mentors error:', err);
      socket.emit('mentors_error', { error: 'Failed to fetch mentors' });
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

      // Broadcast to all connected clients
      io.emit('new_issue', newIssue);
      socket.emit('create_issue_success', newIssue);
    } catch (err) {
      socket.emit('create_issue_error', { error: err.message });
    }
  });

  // Assign mentor to issue
  socket.on('assign_issue', async (data) => {
    const { issueId, mentorId, mentorName } = data;
    console.log('Assign request:', { issueId, mentorId, mentorName });
    try {
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

      // Broadcast to all connected clients
      io.emit('issue_updated', issueData);
      socket.emit('assign_issue_success', issueData);
    } catch (err) {
      console.error('Assign issue error:', err);
      socket.emit('assign_issue_error', { error: 'Failed to assign issue', details: err.message });
    }
  });

  // Join issue room for real-time messaging
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

  // Send message
  socket.on('send_message', async (data) => {
    const { issueId, senderId, senderRole, text } = data;

    if (!text.trim()) return;

    try {
      const { rows } = await pool.query(
        'INSERT INTO messages (issue_id, sender_id, text) VALUES ($1, $2, $3) RETURNING *',
        [issueId, senderId, text.trim()]
      );

      const newMessage = {
        ...rows[0],
        senderId: rows[0].sender_id,
        createdAt: rows[0].created_at
      };

      // Send to all clients in the issue room
      io.to(`issue_${issueId}`).emit('new_message', newMessage);

    } catch (err) {
      socket.emit('send_message_error', { error: 'Failed to send message' });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
    }
  });
});

  // HTTP endpoints to support frontend fetches (kept for compatibility)
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
