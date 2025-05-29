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

// Configurazione del database
console.log('=== CONFIGURAZIONE DATABASE ===');
console.log('DATABASE_URL presente:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@') : 'non presente');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

// Inizializzazione del database
async function initializeDatabase() {
  try {
    console.log('Tentativo di connessione al database...');
    const client = await pool.connect();
    console.log('Connessione al database riuscita!');
    
    // Crea la tabella cells se non esiste
    await client.query(`
      CREATE TABLE IF NOT EXISTS cells (
        id SERIAL PRIMARY KEY,
        cell_number VARCHAR(50) UNIQUE NOT NULL,
        cards JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tabella cells verificata/creata con successo');

    // Crea la tabella sessions se non esiste
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        session_id VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tabella sessions verificata/creata con successo');

    // Verifica se ci sono già celle nel database
    const result = await client.query('SELECT COUNT(*) FROM cells');
    console.log('Numero di celle nel database:', result.rows[0].count);
    
    if (result.rows[0].count === '0') {
      console.log('Inizializzazione delle celle...');
      // Inserisci le celle iniziali
      const cells = Array(17).fill(null).map((_, index) => {
        let cellNumber;
        if (index < 10) {
          cellNumber = `Buca ${index + 4}`;
        } else if (index < 14) {
          cellNumber = `Buca ${index + 16}`;
        } else {
          cellNumber = `Preparazione ${index - 13}`;
        }
        return {
          cell_number: cellNumber,
          cards: JSON.stringify(Array(4).fill(null).map(() => ({
            status: 'default',
            startTime: null,
            endTime: null,
            TR: '',
            ID: '',
            N: '',
            Note: ''
          })))
        };
      });

      // Inserisci tutte le celle
      for (const cell of cells) {
        await client.query(
          'INSERT INTO cells (cell_number, cards) VALUES ($1, $2)',
          [cell.cell_number, cell.cards]
        );
      }
      console.log('Celle inizializzate con successo');
    }
    
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

// Get active sessions endpoint
app.get('/api/active-sessions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT role, session_id, created_at 
      FROM sessions 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Errore durante il recupero delle sessioni attive:', error);
    res.status(500).json({ error: 'Errore del server' });
  }
});

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

// Funzione per convertire row/col in cell_number
function getCellNumber(row, col) {
  if (row === 0) {
    return `Buca ${col + 4}`;
  } else if (row === 1) {
    return `Buca ${col + 16}`;
  } else if (row === 2) {
    return `Preparazione ${col + 1}`;
  }
  return null;
}

// Save cell endpoint
app.post('/api/cells', async (req, res) => {
  try {
    let cell_number;
    const { row, col, cell_number: directCellNumber, cards } = req.body;
    console.log('Salvataggio cella:', { row, col, directCellNumber, cards });

    if (directCellNumber) {
      // Se viene fornito direttamente cell_number, usalo
      cell_number = directCellNumber;
    } else if (row !== undefined && col !== undefined) {
      // Altrimenti converti row/col in cell_number
      cell_number = getCellNumber(row, col);
    }

    if (!cell_number) {
      return res.status(400).json({ error: 'Coordinata cella non valida' });
    }

    // Verifica se la cella esiste
    const checkResult = await pool.query(
      'SELECT id FROM cells WHERE cell_number = $1',
      [cell_number]
    );

    if (checkResult.rows.length === 0) {
      // Se la cella non esiste, creala
      await pool.query(
        'INSERT INTO cells (cell_number, cards) VALUES ($1, $2)',
        [cell_number, JSON.stringify(cards)]
      );
      console.log('Nuova cella creata:', cell_number);
    } else {
      // Se la cella esiste, aggiorna mantenendo i dati esistenti
      const existingCell = await pool.query(
        'SELECT cards FROM cells WHERE cell_number = $1',
        [cell_number]
      );
      
      const existingCards = JSON.parse(existingCell.rows[0].cards);
      const updatedCards = cards.map((newCard, index) => {
        const existingCard = existingCards[index] || {};
        return {
          ...existingCard,
          ...newCard,
          // Mantieni i campi vuoti se non sono stati modificati
          TR: newCard.TR || existingCard.TR || '',
          ID: newCard.ID || existingCard.ID || '',
          N: newCard.N || existingCard.N || '',
          Note: newCard.Note || existingCard.Note || '',
          status: newCard.status || existingCard.status || 'default',
          startTime: newCard.startTime || existingCard.startTime || null,
          endTime: newCard.endTime || existingCard.endTime || null
        };
      });

      await pool.query(
        'UPDATE cells SET cards = $1, updated_at = CURRENT_TIMESTAMP WHERE cell_number = $2',
        [JSON.stringify(updatedCards), cell_number]
      );
      console.log('Cella aggiornata:', cell_number);
    }

    res.json({ message: 'Cella salvata con successo' });
  } catch (error) {
    console.error('Errore durante il salvataggio della cella:', error);
    res.status(500).json({ error: 'Errore del server' });
  }
});

// Initialize database on startup
initializeDatabase().catch(error => {
  console.error('Errore fatale durante l\'inizializzazione del database:', error);
  process.exit(1);
});

app.listen(port, () => {
  console.log(`Server in esecuzione sulla porta ${port}`);
}); 