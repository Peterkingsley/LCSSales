require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

// IMPORTANT: Import the Express application (routes) defined in telegram.js
const { app: telegramApp } = require('./telegram');

const app = express();
app.use(cors());
app.use(express.json());

// --- Database Connection Setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Ensure SSL is configured if deploying to a service like Render/Heroku
  ssl: { 
    rejectUnauthorized: false 
  }
});

// Test DB connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('DB Connection Error:', err));

// --- API Endpoints ---

// 1. Mount the Telegram bot's API endpoints (includes /api/broadcast)
app.use(telegramApp);

// 2. Existing endpoint to get user list for the dashboard
app.get('/users', async (req, res) => {
  try {
    // Note: We use the pool exported from server.js itself
    const result = await pool.query('SELECT * FROM users ORDER BY joined_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).send('Error fetching users');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = pool;