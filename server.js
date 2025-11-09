require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

// IMPORTANT: Import the Express Router (aliased as telegramRouter) and the function to set the DB pool
const { router: telegramRouter, setDbPool } = require('./telegram');

const app = express();
app.use(cors());
app.use(express.json());

// --- Database Connection Setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Ensure SSL is configured for Render deployment
  ssl: { 
    rejectUnauthorized: false 
  }
});

// 💡 FIX: Inject the database pool into the telegram module so telegram.js can access it
setDbPool(pool); 

// Test DB connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('DB Connection Error:', err));

// --- API Endpoints ---

// 1. Mount the Telegram bot's API endpoints (includes /api/broadcast)
// 🐛 FIX: Use the correctly imported variable: telegramRouter
app.use(telegramRouter);

// 2. Existing endpoint to get user list for the dashboard
app.get('/users', async (req, res) => {
  try {
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