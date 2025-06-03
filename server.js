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

// Funzione per testare la connessione al database
async function testDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('Test connessione database riuscito');
    client.release();
    return true;
  } catch (error) {
    console.error('Test connessione database fallito:', error);
    return false;
  }
}

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
    console.log('=== INIZIALIZZAZIONE DATABASE ===');
    console.log('Tentativo di connessione al database...');
    const client = await pool.connect();
    console.log('Connessione al database riuscita!');
    
    // Verifica se la tabella cells esiste
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'cells'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('Tabella cells non trovata, creazione in corso...');
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
      console.log('Tabella cells creata con successo');
    } else {
      console.log('Tabella cells già esistente');
    }

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
        try {
          const insertResult = await client.query(
            'INSERT INTO cells (cell_number, cards) VALUES ($1, $2) RETURNING id',
            [cell.cell_number, cell.cards]
          );
          console.log('Cella inserita:', cell.cell_number, 'ID:', insertResult.rows[0].id);
        } catch (error) {
          console.error('Errore durante l\'inserimento della cella:', cell.cell_number, error);
        }
      }
      console.log('Celle inizializzate con successo');
    }
    
    client.release();
    console.log('Database inizializzato con successo');
  } catch (error) {
    console.error('=== ERRORE INIZIALIZZAZIONE DATABASE ===');
    console.error('Dettagli errore:', {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack
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
  let client;
  try {
    console.log('=== DEBUG SERVER SAVE ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    // Test della connessione al database
    client = await pool.connect();
    console.log('Connessione al database riuscita');

    const { cell_number, cards } = req.body;
    if (!cell_number || !cards) {
      console.error('Dati mancanti:', { cell_number, cards });
      return res.status(400).json({ error: 'Dati mancanti' });
    }

    console.log('Cell number:', cell_number);
    console.log('Cards:', JSON.stringify(cards, null, 2));

    // Verifica se la cella esiste
    const checkResult = await client.query(
      'SELECT id, cards FROM cells WHERE cell_number = $1',
      [cell_number]
    );

    if (checkResult.rows.length === 0) {
      console.log('Creazione nuova cella:', cell_number);
      try {
        // Se la cella non esiste, creala
        const result = await client.query(
          'INSERT INTO cells (cell_number, cards) VALUES ($1, $2) RETURNING id',
          [cell_number, JSON.stringify(cards)]
        );
        console.log('Nuova cella creata con successo:', cell_number, 'ID:', result.rows[0].id);
      } catch (error) {
        console.error('Errore durante la creazione della cella:', error);
        throw new Error(`Errore durante la creazione della cella: ${error.message}`);
      }
    } else {
      console.log('Aggiornamento cella esistente:', cell_number);
      try {
        // Se la cella esiste, aggiorna i dati
        const result = await client.query(
          'UPDATE cells SET cards = $1, updated_at = CURRENT_TIMESTAMP WHERE cell_number = $2 RETURNING id',
          [JSON.stringify(cards), cell_number]
        );
        console.log('Cella aggiornata con successo:', cell_number, 'ID:', result.rows[0].id);
      } catch (error) {
        console.error('Errore durante l\'aggiornamento della cella:', error);
        throw new Error(`Errore durante l'aggiornamento della cella: ${error.message}`);
      }
    }

    res.json({ message: 'Cella salvata con successo' });
  } catch (error) {
    console.error('=== ERRORE SALVATAGGIO CELLA ===');
    console.error('Dettagli errore:', {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Errore del server', 
      details: error.message,
      type: error.name
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Preposto changes endpoint
app.post('/api/preposto-changes', async (req, res) => {
  let client;
  try {
    const { cellIndex, cardIndex, status, startTime, endTime } = req.body;
    console.log('=== DEBUG PREPOSTO CHANGES ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    client = await pool.connect();

    // Converti l'indice della cella nel numero della cella
    let cellNumber;
    if (cellIndex < 10) {
      cellNumber = `Buca ${cellIndex + 4}`;
    } else if (cellIndex < 14) {
      cellNumber = `Buca ${cellIndex + 16}`;
    } else {
      cellNumber = `Preparazione ${cellIndex - 13}`;
    }

    console.log('Cell number:', cellNumber);

    // Recupera la cella esistente
    const existingCell = await client.query(
      'SELECT cards FROM cells WHERE cell_number = $1',
      [cellNumber]
    );

    let existingCards;
    if (existingCell.rows.length === 0) {
      console.log('Cella non trovata, creazione in corso:', cellNumber);
      // Se la cella non esiste, creala con le card di default
      existingCards = Array(4).fill(null).map(() => ({
        status: 'default',
        startTime: null,
        endTime: null,
        TR: '',
        ID: '',
        N: '',
        Note: ''
      }));

      await client.query(
        'INSERT INTO cells (cell_number, cards) VALUES ($1, $2)',
        [cellNumber, JSON.stringify(existingCards)]
      );
      console.log('Nuova cella creata:', cellNumber);
    } else {
      try {
        // Verifica se cards è già un oggetto
        existingCards = typeof existingCell.rows[0].cards === 'object' 
          ? existingCell.rows[0].cards 
          : JSON.parse(existingCell.rows[0].cards);
        
        // Verifica che existingCards sia un array
        if (!Array.isArray(existingCards)) {
          console.error('Cards non è un array:', existingCards);
          existingCards = Array(4).fill(null).map(() => ({
            status: 'default',
            startTime: null,
            endTime: null,
            TR: '',
            ID: '',
            N: '',
            Note: ''
          }));
        }
      } catch (error) {
        console.error('Errore nel parsing delle cards:', error);
        console.error('Cards ricevute:', existingCell.rows[0].cards);
        existingCards = Array(4).fill(null).map(() => ({
          status: 'default',
          startTime: null,
          endTime: null,
          TR: '',
          ID: '',
          N: '',
          Note: ''
        }));
      }
    }

    // Verifica che l'indice della card sia valido
    if (cardIndex < 0 || cardIndex >= existingCards.length) {
      throw new Error(`Indice card non valido: ${cardIndex}`);
    }

    // Aggiorna solo i campi specifici della card
    existingCards[cardIndex] = {
      ...existingCards[cardIndex],
      status,
      startTime,
      endTime
    };

    // Salva le modifiche
    await client.query(
      'UPDATE cells SET cards = $1, updated_at = CURRENT_TIMESTAMP WHERE cell_number = $2',
      [JSON.stringify(existingCards), cellNumber]
    );

    console.log('Modifiche preposto salvate con successo');
    res.json({ message: 'Modifiche salvate con successo' });
  } catch (error) {
    console.error('=== ERRORE SALVATAGGIO MODIFICHE PREPOSTO ===');
    console.error('Dettagli errore:', {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Errore del server', 
      details: error.message,
      type: error.name
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Endpoint per popolare le celle mancanti
app.post('/api/populate-cells', async (req, res) => {
  let client;
  try {
    console.log('=== POPOLAMENTO CELLE MANCANTI ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    client = await pool.connect();
    
    // Verifica quali celle esistono già
    const existingCells = await client.query('SELECT cell_number FROM cells');
    const existingCellNumbers = new Set(existingCells.rows.map(row => row.cell_number));
    console.log('Celle esistenti:', Array.from(existingCellNumbers));
    
    // Prepara i dati per le nuove celle
    const defaultCards = JSON.stringify([
      { status: 'default', startTime: null, endTime: null, TR: '', ID: '', N: '', Note: '' },
      { status: 'default', startTime: null, endTime: null, TR: '', ID: '', N: '', Note: '' },
      { status: 'default', startTime: null, endTime: null, TR: '', ID: '', N: '', Note: '' },
      { status: 'default', startTime: null, endTime: null, TR: '', ID: '', N: '', Note: '' }
    ]);
    
    let insertedCount = 0;
    let errors = [];
    
    // Prima verifica se la cella richiesta esiste
    const requestedCell = req.body.cellNumber;
    console.log('Cella richiesta:', requestedCell);
    console.log('La cella esiste già?', existingCellNumbers.has(requestedCell));
    
    // Definisci tutte le celle che dovrebbero esistere
    const requiredCells = [];
    // Buche da 4 a 13
    for (let i = 4; i <= 13; i++) {
      requiredCells.push(`Buca ${i}`);
    }
    // Buche da 30 a 33
    for (let i = 30; i <= 33; i++) {
      requiredCells.push(`Buca ${i}`);
    }
    // Preparazione 1-3
    for (let i = 1; i <= 3; i++) {
      requiredCells.push(`Preparazione ${i}`);
    }
    
    console.log('Celle richieste:', requiredCells);
    
    // Inserisci tutte le celle mancanti
    for (const cellNumber of requiredCells) {
      if (!existingCellNumbers.has(cellNumber)) {
        try {
          console.log('Tentativo di inserimento cella:', cellNumber);
          const result = await client.query(
            'INSERT INTO cells (cell_number, cards) VALUES ($1, $2) RETURNING id',
            [cellNumber, defaultCards]
          );
          insertedCount++;
          console.log('Inserita nuova cella:', cellNumber, 'ID:', result.rows[0].id);
        } catch (error) {
          console.error(`Errore durante l'inserimento della cella ${cellNumber}:`, error);
          errors.push(`Errore durante l'inserimento della cella ${cellNumber}: ${error.message}`);
        }
      }
    }
    
    // Verifica se la cella richiesta esiste dopo il popolamento
    const finalCheck = await client.query(
      'SELECT EXISTS(SELECT 1 FROM cells WHERE cell_number = $1)',
      [requestedCell]
    );
    const cellExists = finalCheck.rows[0].exists;
    console.log('Verifica finale - La cella esiste?', cellExists);
    
    res.json({ 
      message: 'Operazione completata con successo',
      insertedCells: insertedCount,
      requestedCell: requestedCell,
      cellExists: cellExists,
      errors: errors
    });
  } catch (error) {
    console.error('Errore durante il popolamento delle celle:', error);
    res.status(500).json({ 
      error: 'Errore del server',
      details: error.message
    });
  } finally {
    if (client) {
      client.release();
    }
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