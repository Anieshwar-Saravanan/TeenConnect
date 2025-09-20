require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Users
app.post('/api/signup', async (req, res) => {
  const { name, email, password, role } = req.body;
    console.log('Signup request:', { name, email, role });
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, password, role]
    );
      // console.log('Signup success:', rows[0]);
    res.json(rows[0]);
  } catch (err) {
      console.error('Signup error:', err);
    res.status(400).json({ error: err.message });
      res.status(400).json({ error: 'Signup failed', details: err.detail || err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password, role } = req.body;
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND password = $2 AND role = $3',
    [email, password, role]
  );
  if (rows.length) res.json(rows[0]);
  else res.status(401).json({ error: 'Invalid credentials' });
});

// Get all mentors
app.get('/api/mentors', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, email FROM users WHERE role = 'mentor'");
    res.json(rows);
  } catch (err) {
    console.error('Get mentors error:', err);
    res.status(500).json({ error: 'Failed to fetch mentors' });
  }
});

// Issues
app.get('/api/issues', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM issues');
  // Map to camelCase for frontend compatibility
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
  res.json(issues);
});

app.post('/api/issues', async (req, res) => {
  let { title, description, created_by, createdBy } = req.body;
  // Accept both camelCase and snake_case
  if (!created_by && createdBy) created_by = createdBy;
  if (!created_by) {
    return res.status(400).json({ error: 'created_by is required' });
  }
  const { rows } = await pool.query(
    'INSERT INTO issues (title, description, created_by) VALUES ($1, $2, $3) RETURNING *',
    [title, description, created_by]
  );
  // Return camelCase for frontend
  const issue = rows[0];
  res.json({
    id: issue.id,
    title: issue.title,
    description: issue.description,
    createdBy: issue.created_by,
    assignedMentor: null,
    createdAt: issue.created_at
  });
});

// Assign mentor to issue
app.post('/api/issues/:id/assign', async (req, res) => {
  const issueId = req.params.id;
  const { mentorId, mentorName } = req.body;
  console.log('Assign request:', { issueId, mentorId, mentorName });
  try {
    // Update the assigned_mentor field in the issues table
    const result = await pool.query(
      'UPDATE issues SET assigned_mentor = $1 WHERE id = $2 RETURNING *',
      [mentorId, issueId]
    );
    // console.log('Assign result:', result.rows);
    if (result.rows.length === 0) {
      console.log('Assign failed: Issue not found');
      return res.status(404).json({ error: 'Issue not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Assign issue error:', err);
    res.status(500).json({ error: 'Failed to assign issue', details: err.message });
  }
});

// Get a single issue by ID, with assigned mentor details
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
      if (mentorRes.rows.length) {
        assignedMentor = mentorRes.rows[0];
      }
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


app.put('/api/issues/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { mentor_id } = req.body;
  const { rows } = await pool.query(
    'UPDATE issues SET assigned_mentor = $1 WHERE id = $2 RETURNING *',
    [mentor_id, id]
  );
  res.json(rows[0]);
});

// Messages
app.get('/api/issues/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    'SELECT * FROM messages WHERE issue_id = $1 ORDER BY created_at ASC',
    [id]
  );
  // Map sender_id to senderId for frontend compatibility
  const messages = rows.map(m => ({
    ...m,
    senderId: m.sender_id,
    createdAt: m.created_at
  }));
  res.json(messages);
});

app.post('/api/issues/:id/messages', async (req, res) => {
  const { id } = req.params;
  let { sender_id, senderId, text } = req.body;
  // Accept both camelCase and snake_case
  if (!sender_id && senderId) sender_id = senderId;
  if (!sender_id) {
    return res.status(400).json({ error: 'sender_id is required' });
  }
  const { rows } = await pool.query(
    'INSERT INTO messages (issue_id, sender_id, text) VALUES ($1, $2, $3) RETURNING *',
    [id, sender_id, text]
  );
  res.json(rows[0]);
});

const PORT  = 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
