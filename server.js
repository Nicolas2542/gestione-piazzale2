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

// Schema per le sessioni
const sessionSchema = new mongoose.Schema({
  role: { type: String, required: true },
  sessionId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Scade dopo 24 ore
});

const Cell = mongoose.model('Cell', cellSchema);
const Session = mongoose.model('Session', sessionSchema);

// In-memory storage for passwords
let passwords = {
  admin: 'admin123',
  preposto: 'preposto123'
};

// Connessione a MongoDB
const connectDB = async () => {
  try {
    console.log('=== VERIFICA VARIABILI D\'AMBIENTE ===');
    console.log('MONGODB_URI presente:', !!process.env.MONGODB_URI);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI non è definita nelle variabili d\'ambiente');
    }

    const uri = process.env.MONGODB_URI;
    console.log('=== TENTATIVO DI CONNESSIONE MONGODB ===');
    console.log('URI:', uri.replace(/:[^:@]*@/, ':****@')); // Nasconde la password nei log
    
    // Disconnetti se c'è una connessione esistente
    if (mongoose.connection.readyState !== 0) {
      console.log('Disconnessione da MongoDB esistente...');
      await mongoose.disconnect();
    }

    // Configurazione più robusta
    const options = {
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 90000,
      connectTimeoutMS: 60000,
      maxPoolSize: 10,
      minPoolSize: 1,
      retryWrites: true,
      retryReads: true,
      heartbeatFrequencyMS: 10000,
      family: 4,
      autoIndex: true,
      maxIdleTimeMS: 60000,
      waitQueueTimeoutMS: 60000
    };

    console.log('Opzioni di connessione:', options);
    
    await mongoose.connect(uri, options);
    
    console.log('=== CONNESSIONE MONGODB RIUSCITA ===');
    console.log('Stato connessione:', mongoose.connection.readyState);
    console.log('Host:', mongoose.connection.host);
    console.log('Port:', mongoose.connection.port);
    console.log('Database:', mongoose.connection.name);
    
    await initializeDatabase();
  } catch (err) {
    console.error('=== ERRORE CONNESSIONE MONGODB ===');
    console.error('Errore:', err.message);
    console.error('Stack trace:', err.stack);
    console.error('Stato connessione:', mongoose.connection.readyState);
    console.error('Dettagli errore:', {
      name: err.name,
      code: err.code,
      codeName: err.codeName
    });
    
    console.log('Riprovo la connessione tra 10 secondi...');
    setTimeout(connectDB, 10000);
  }
};

// Funzione per verificare la connessione
const checkConnection = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('Tentativo di riconnessione al database...');
      await connectDB();
    } else {
      // Verifica la connessione con un ping
      await mongoose.connection.db.admin().ping();
      console.log('Ping al database riuscito');
    }
  } catch (error) {
    console.error('Errore durante il check della connessione:', error);
    await connectDB();
  }
};

// Verifica la connessione ogni 15 secondi invece di 30
setInterval(checkConnection, 15000);

connectDB();

// Aggiungi listener per gli eventi di connessione
mongoose.connection.on('connected', () => {
  console.log('Mongoose connesso al database');
});

mongoose.connection.on('error', (err) => {
  console.error('Errore di connessione Mongoose:', err);
  console.error('Stack trace:', err.stack);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnesso dal database');
  // Tenta di riconnettersi dopo 5 secondi
  setTimeout(connectDB, 5000);
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
app.post('/api/login', async (req, res) => {
  try {
    console.log('Tentativo di login...');
    console.log('Stato connessione MongoDB:', mongoose.connection.readyState);
    
    await checkConnection();
    
    if (mongoose.connection.readyState !== 1) {
      console.error('Database non connesso. Stato:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database temporaneamente non disponibile' });
    }

    const { username, password } = req.body;
    console.log('Tentativo di login per:', username);
    
    if (!username || !password) {
      console.log('Credenziali mancanti');
      return res.status(400).json({ error: 'Username e password sono richiesti' });
    }

    if (username === 'admin' && password === passwords.admin) {
      const sessionId = Date.now().toString();
      console.log('Creazione sessione admin...');
      await Session.create({ role: 'admin', sessionId });
      console.log('Login admin riuscito');
      res.json({ role: 'admin', sessionId });
    } else if (username === 'preposto' && password === passwords.preposto) {
      const sessionId = Date.now().toString();
      console.log('Creazione sessione preposto...');
      await Session.create({ role: 'preposto', sessionId });
      console.log('Login preposto riuscito');
      res.json({ role: 'preposto', sessionId });
    } else {
      console.log('Credenziali non valide per:', username);
      res.status(401).json({ error: 'Credenziali non valide' });
    }
  } catch (error) {
    console.error('Errore durante il login:', error);
    console.error('Stack trace:', error.stack);
    console.error('Stato connessione MongoDB:', mongoose.connection.readyState);
    res.status(503).json({ error: 'Database temporaneamente non disponibile' });
  }
});

// Logout endpoint
app.post('/api/logout', async (req, res) => {
  try {
    const { role, sessionId } = req.body;
    await Session.deleteOne({ role, sessionId });
    res.json({ message: 'Logout effettuato con successo' });
  } catch (error) {
    console.error('Errore durante il logout:', error);
    res.status(500).json({ error: 'Errore durante il logout' });
  }
});

// Get active sessions count
app.get('/api/active-sessions', async (req, res) => {
  try {
    console.log('Recupero sessioni attive...');
    console.log('Stato connessione MongoDB:', mongoose.connection.readyState);
    
    await checkConnection();
    
    if (mongoose.connection.readyState !== 1) {
      console.error('Database non connesso. Stato:', mongoose.connection.readyState);
      return res.status(503).json({ error: 'Database temporaneamente non disponibile' });
    }

    const adminCount = await Session.countDocuments({ role: 'admin' });
    const prepostoCount = await Session.countDocuments({ role: 'preposto' });
    console.log('Sessioni attive:', { admin: adminCount, preposto: prepostoCount });
    
    res.json({
      admin: adminCount,
      preposto: prepostoCount
    });
  } catch (error) {
    console.error('Errore durante il recupero delle sessioni attive:', error);
    console.error('Stack trace:', error.stack);
    console.error('Stato connessione MongoDB:', mongoose.connection.readyState);
    res.status(503).json({ error: 'Database temporaneamente non disponibile' });
  }
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

    // Aggiorna solo i campi delle cards
    cell.cards = cellData.cards.map(card => ({
      status: card.status || 'default',
      startTime: card.startTime || null,
      endTime: card.endTime || null,
      TR: card.TR || '',
      ID: card.ID || '',
      N: card.N || '',
      Note: card.Note || ''
    }));

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