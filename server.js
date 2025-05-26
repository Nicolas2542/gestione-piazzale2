const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
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

// Cache per le celle
let cellsCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 2000; // 2 secondi

// Serve static files from the React build directory
app.use(express.static(path.join(__dirname, 'build')));

// Schema per le celle
const cellSchema = new mongoose.Schema({
  cell_number: { type: String, required: true, unique: true },
  field_id: String,
  field_n: String,
  field_tr: String,
  field_note: String,
  status: { type: String, default: 'default' },
  cards: [{
    status: { type: String, default: 'default' },
    startTime: Date,
    endTime: Date,
    TR: String,
    ID: String,
    N: String,
    Note: String
  }]
}, { timestamps: true });

const Cell = mongoose.model('Cell', cellSchema);

// In-memory storage for passwords
let passwords = {
  admin: 'admin123',
  preposto: 'preposto123'
};

// In-memory storage for active sessions
let activeSessions = {
  admin: [],
  preposto: []
};

// Connessione a MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gestione-piazzale', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log('Connesso a MongoDB con successo');
    console.log('URI di connessione:', process.env.MONGODB_URI);
    initializeDatabase();
  })
  .catch(err => {
    console.error('Errore durante la connessione a MongoDB:', err);
    console.error('URI di connessione:', process.env.MONGODB_URI);
  });

// Aggiungi listener per gli eventi di connessione
mongoose.connection.on('connected', () => {
  console.log('Mongoose connesso al database');
});

mongoose.connection.on('error', (err) => {
  console.error('Errore di connessione Mongoose:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnesso dal database');
});

// Funzione per inizializzare il database
async function initializeDatabase() {
  try {
    const count = await Cell.countDocuments();
    if (count === 0) {
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
        return new Cell({
          cell_number: cellNumber,
          cards: Array(4).fill(null).map(() => ({
            status: 'default',
            startTime: null,
            endTime: null,
            TR: '',
            ID: '',
            N: '',
            Note: ''
          }))
        });
      });

      await Cell.insertMany(cells);
      console.log('Database inizializzato con successo');
    }
  } catch (error) {
    console.error('Errore durante l\'inizializzazione del database:', error);
  }
}

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'admin' && password === passwords.admin) {
    const sessionId = Date.now().toString();
    activeSessions.admin.push(sessionId);
    res.json({ role: 'admin', sessionId });
  } else if (username === 'preposto' && password === passwords.preposto) {
    const sessionId = Date.now().toString();
    activeSessions.preposto.push(sessionId);
    res.json({ role: 'preposto', sessionId });
  } else {
    res.status(401).json({ error: 'Credenziali non valide' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  const { role, sessionId } = req.body;
  if (activeSessions[role]) {
    activeSessions[role] = activeSessions[role].filter(id => id !== sessionId);
  }
  res.json({ message: 'Logout effettuato con successo' });
});

// Get active sessions count
app.get('/api/active-sessions', (req, res) => {
  res.json({
    admin: activeSessions.admin.length,
    preposto: activeSessions.preposto.length
  });
});

// Get all cells
app.get('/api/cells', async (req, res) => {
  try {
    const now = Date.now();
    
    // Se la cache è valida, usa quella
    if (cellsCache && (now - lastCacheUpdate) < CACHE_DURATION) {
      return res.json(cellsCache);
    }

    const cells = await Cell.find().sort('cell_number');
    
    // Aggiorna la cache
    cellsCache = cells;
    lastCacheUpdate = now;

    res.json(cells);
  } catch (error) {
    console.error('Errore durante il recupero delle celle:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle celle' });
  }
});

// Save cell data (admin)
app.post('/api/cells', async (req, res) => {
  try {
    const cellData = req.body;
    const cell = await Cell.findOne({ cell_number: cellData.cell_number });
    
    if (!cell) {
      return res.status(404).json({ error: 'Cella non trovata' });
    }

    cell.field_id = cellData.field_id || '';
    cell.field_n = cellData.field_n || '';
    cell.field_tr = cellData.field_tr || '';
    cell.field_note = cellData.field_note || '';
    cell.cards = cellData.cards;

    await cell.save();
    
    // Invalida la cache
    cellsCache = null;
    
    res.json({ message: 'Dati salvati con successo' });
  } catch (error) {
    console.error('Errore durante il salvataggio:', error);
    res.status(500).json({ error: 'Errore durante il salvataggio' });
  }
});

// Save preposto changes
app.post('/api/preposto-changes', async (req, res) => {
  try {
    const { cellIndex, cardIndex, status, startTime, endTime } = req.body;
    const cell = await Cell.findOne().skip(cellIndex);
    
    if (!cell) {
      return res.status(404).json({ error: 'Cella non trovata' });
    }

    cell.cards[cardIndex].status = status;
    cell.cards[cardIndex].startTime = startTime;
    cell.cards[cardIndex].endTime = endTime;

    await cell.save();
    res.json({ message: 'Modifiche salvate con successo' });
  } catch (error) {
    console.error('Errore durante il salvataggio:', error);
    res.status(500).json({ error: 'Errore durante il salvataggio' });
  }
});

// Get cell history
app.get('/api/cells/:cellNumber/history', async (req, res) => {
  try {
    const { cellNumber } = req.params;
    const cell = await Cell.findOne({ cell_number: cellNumber });
    
    if (!cell) {
      return res.status(404).json({ error: 'Cella non trovata' });
    }

    res.json([cell]);
  } catch (error) {
    console.error('Errore durante il recupero della cronologia:', error);
    res.status(500).json({ error: 'Errore durante il recupero della cronologia' });
  }
});

// Delete cell data
app.delete('/api/cells/:cellNumber', async (req, res) => {
  try {
    const { cellNumber } = req.params;
    const cell = await Cell.findOne({ cell_number: cellNumber });
    
    if (!cell) {
      return res.status(404).json({ error: 'Cella non trovata' });
    }

    cell.field_id = '';
    cell.field_n = '';
    cell.field_tr = '';
    cell.field_note = '';
    cell.status = 'default';
    cell.cards = cell.cards.map(() => ({
      status: 'default',
      startTime: null,
      endTime: null,
      TR: '',
      ID: '',
      N: '',
      Note: ''
    }));

    await cell.save();
    res.json({ message: 'Dati eliminati con successo' });
  } catch (error) {
    console.error('Errore durante l\'eliminazione:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione' });
  }
});

// Reset monitoring endpoint
app.post('/api/reset-monitoring', async (req, res) => {
  try {
    await Cell.updateMany({}, {
      $set: {
        status: 'default',
        'cards.$[].status': 'default',
        'cards.$[].startTime': null,
        'cards.$[].endTime': null
      }
    });
    
    res.json({ message: 'Monitoraggio resettato con successo' });
  } catch (error) {
    console.error('Errore durante il reset del monitoraggio:', error);
    res.status(500).json({ error: 'Errore durante il reset del monitoraggio' });
  }
});

// Change password endpoint
app.post('/api/change-password', (req, res) => {
  const { role, currentPassword, newPassword } = req.body;
  
  if (passwords[role] !== currentPassword) {
    res.status(401).json({ error: 'Password attuale non valida' });
    return;
  }
  
  passwords[role] = newPassword;
  res.json({ message: 'Password modificata con successo' });
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 