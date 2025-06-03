const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Configurazione del database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware per verificare l'autenticazione
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token mancante' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token non valido' });
    }
    req.user = user;
    next();
  });
};

// Crea la tabella per i log di monitoraggio se non esiste
pool.query(`
  CREATE TABLE IF NOT EXISTS monitoring_logs (
    id SERIAL PRIMARY KEY,
    cell_number VARCHAR(50) NOT NULL,
    card_index INTEGER NOT NULL,
    event_type VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    card_data JSONB
  )
`).catch(err => console.error('Error creating monitoring_logs table:', err));

// Endpoint per il login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Verifica le credenziali
    if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET);
      res.json({ role: 'admin', token });
    } else if (username === 'preposto' && password === process.env.PREPOSTO_PASSWORD) {
      const token = jwt.sign({ role: 'preposto' }, process.env.JWT_SECRET);
      res.json({ role: 'preposto', token });
    } else {
      res.status(401).json({ error: 'Credenziali non valide' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Errore durante il login' });
  }
});

// Endpoint per ottenere tutte le celle
app.get('/api/cells', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cells');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching cells:', error);
    res.status(500).json({ error: 'Errore nel recupero delle celle' });
  }
});

// Endpoint per ottenere una cella specifica
app.get('/api/cells/:cellNumber', async (req, res) => {
  try {
    const { cellNumber } = req.params;
    const result = await pool.query('SELECT * FROM cells WHERE cell_number = $1', [cellNumber]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Cella non trovata' });
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error fetching cell:', error);
    res.status(500).json({ error: 'Errore nel recupero della cella' });
  }
});

// Endpoint per salvare una cella
app.post('/api/cells', async (req, res) => {
  try {
    const { cell_number, cards } = req.body;
    
    const result = await pool.query(
      'INSERT INTO cells (cell_number, cards) VALUES ($1, $2) ON CONFLICT (cell_number) DO UPDATE SET cards = $2 RETURNING *',
      [cell_number, JSON.stringify(cards)]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving cell:', error);
    res.status(500).json({ error: 'Errore nel salvataggio della cella' });
  }
});

// Endpoint per registrare un evento di monitoraggio
app.post('/api/monitoring-logs', async (req, res) => {
  try {
    const { cellNumber, cardIndex, eventType, cardData } = req.body;
    
    const result = await pool.query(
      'INSERT INTO monitoring_logs (cell_number, card_index, event_type, card_data) VALUES ($1, $2, $3, $4) RETURNING *',
      [cellNumber, cardIndex, eventType, JSON.stringify(cardData)]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error recording monitoring event:', error);
    res.status(500).json({ error: 'Errore nella registrazione dell\'evento' });
  }
});

// Endpoint per ottenere i log di monitoraggio
app.get('/api/monitoring-logs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM monitoring_logs ORDER BY timestamp DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching monitoring logs:', error);
    res.status(500).json({ error: 'Errore nel recupero dei log' });
  }
});

// Endpoint per resettare i log di monitoraggio
app.post('/api/reset-monitoring', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono resettare i dati di monitoraggio' });
    }

    await pool.query('DELETE FROM monitoring_logs');
    res.json({ message: 'Log di monitoraggio resettati con successo' });
  } catch (error) {
    console.error('Error resetting monitoring logs:', error);
    res.status(500).json({ error: 'Errore nel reset dei log di monitoraggio' });
  }
});

// Endpoint per popolare le celle mancanti
app.post('/api/populate-cells', async (req, res) => {
  try {
    const { cellNumber } = req.body;
    
    // Verifica se la cella esiste già
    const existingCell = await pool.query('SELECT * FROM cells WHERE cell_number = $1', [cellNumber]);
    
    if (existingCell.rows.length > 0) {
      return res.json({ cellExists: true });
    }

    // Crea la cella con 4 card vuote
    const defaultCards = Array(4).fill({
      status: 'default',
      startTime: null,
      endTime: null,
      TR: '',
      ID: '',
      N: '',
      Note: ''
    });

    await pool.query(
      'INSERT INTO cells (cell_number, cards) VALUES ($1, $2)',
      [cellNumber, JSON.stringify(defaultCards)]
    );

    res.json({ cellExists: false });
  } catch (error) {
    console.error('Error populating cells:', error);
    res.status(500).json({ error: 'Errore nel popolamento delle celle' });
  }
});

// Endpoint per i cambiamenti del preposto
app.post('/api/preposto-changes', async (req, res) => {
  try {
    const { cellNumber, cardIndex, status, startTime, endTime } = req.body;
    
    const result = await pool.query(
      'UPDATE cells SET cards = jsonb_set(cards, $1, $2) WHERE cell_number = $3 RETURNING *',
      [
        `{${cardIndex},status}`,
        JSON.stringify(status),
        cellNumber
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cella non trovata' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving preposto changes:', error);
    res.status(500).json({ error: 'Errore nel salvataggio delle modifiche' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 