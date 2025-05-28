const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

// Configura CORS per accettare richieste da qualsiasi origine
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configurazione del pool PostgreSQL
console.log('=== CONFIGURAZIONE DATABASE ===');
console.log('DATABASE_URL presente:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@') : 'non presente');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:kRhTsfkIKAxinxiuzrSbAchalCsoXeAV@interchange.proxy.rlwy.net:29869/railway',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test della connessione al database
pool.on('connect', () => {
  console.log('=== CONNESSIONE DATABASE RIUSCITA ===');
  console.log('Connesso al database PostgreSQL');
});

pool.on('error', (err) => {
  console.error('=== ERRORE CONNESSIONE DATABASE ===');
  console.error('Errore inatteso nel pool PostgreSQL:', err);
  console.error('Dettagli errore:', {
    name: err.name,
    code: err.code,
    message: err.message
  });
});

// Serve static files from the React build directory
app.use(express.static(path.join(__dirname, 'build')));

// In-memory storage for passwords
let passwords = {
  admin: 'admin123',
  preposto: 'preposto123'
};

// Funzione per inizializzare il database
async function initializeDatabase() {
  try {
    console.log('Tentativo di connessione al database...');
    console.log('Configurazione database:', {
      host: 'interchange.proxy.rlwy.net',
      port: 29869,
      database: 'railway',
      user: 'postgres'
    });
    
    const client = await pool.connect();
    console.log('Connessione al database riuscita!');
    
    // Crea la tabella cells se non esiste
    await client.query(`
      CREATE TABLE IF NOT EXISTS cells (
        id SERIAL PRIMARY KEY,
        row INTEGER NOT NULL,
        col INTEGER NOT NULL,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tabella cells verificata/creata con successo');
    
    client.release();
    console.log('Database inizializzato con successo');
  } catch (error) {
    console.error('Errore durante l\'inizializzazione del database:', error);
    console.error('Dettagli errore:', {
      name: error.name,
      code: error.code,
      message: error.message
    });
    throw error;
  }
}

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password sono richiesti' });
    }

    if (username === 'admin' && password === passwords.admin) {
      const sessionId = Date.now().toString();
      await pool.query(
        'INSERT INTO sessions (role, session_id) VALUES ($1, $2)',
        ['admin', sessionId]
      );
      res.json({ role: 'admin', sessionId });
    } else if (username === 'preposto' && password === passwords.preposto) {
      const sessionId = Date.now().toString();
      await pool.query(
        'INSERT INTO sessions (role, session_id) VALUES ($1, $2)',
        ['preposto', sessionId]
      );
      res.json({ role: 'preposto', sessionId });
    } else {
      res.status(401).json({ error: 'Credenziali non valide' });
    }
  } catch (error) {
    console.error('Errore durante il login:', error);
    res.status(500).json({ error: 'Errore del server' });
  }
});

// Logout endpoint
app.post('/api/logout', async (req, res) => {
  try {
    const { role, sessionId } = req.body;
    await pool.query(
      'DELETE FROM sessions WHERE role = $1 AND session_id = $2',
      [role, sessionId]
    );
    res.json({ message: 'Logout effettuato con successo' });
  } catch (error) {
    console.error('Errore durante il logout:', error);
    res.status(500).json({ error: 'Errore del server' });
  }
});

// Get cells endpoint
app.get('/api/cells', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cells ORDER BY cell_number');
    res.json(result.rows);
  } catch (error) {
    console.error('Errore durante il recupero delle celle:', error);
    res.status(500).json({ error: 'Errore del server' });
  }
});

// Save cell endpoint
app.post('/api/cells', async (req, res) => {
  try {
    const { cell_number, cards } = req.body;
    await pool.query(
      'UPDATE cells SET cards = $1, updated_at = CURRENT_TIMESTAMP WHERE cell_number = $2',
      [JSON.stringify(cards), cell_number]
    );
    res.json({ message: 'Cella aggiornata con successo' });
  } catch (error) {
    console.error('Errore durante il salvataggio della cella:', error);
    res.status(500).json({ error: 'Errore del server' });
  }
});

// Initialize database on startup
initializeDatabase();

app.listen(port, () => {
  console.log(`Server in esecuzione sulla porta ${port}`);
}); 