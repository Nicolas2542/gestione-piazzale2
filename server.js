const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the React build directory
app.use(express.static(path.join(__dirname, 'build')));

// Inizializza il database
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
  if (err) {
    console.error('Errore durante la connessione al database:', err);
  } else {
    console.log('Connesso al database SQLite');
    initializeDatabase();
  }
});

// Funzione per inizializzare il database
function initializeDatabase() {
  // Crea la tabella delle celle se non esiste
  db.run(`CREATE TABLE IF NOT EXISTS cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell_number TEXT UNIQUE,
    field_id TEXT,
    field_n TEXT,
    field_tr TEXT,
    field_note TEXT,
    status TEXT DEFAULT 'default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Crea la tabella delle card se non esiste
  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell_id INTEGER,
    card_index INTEGER,
    status TEXT DEFAULT 'default',
    start_time DATETIME,
    end_time DATETIME,
    TR TEXT,
    card_id TEXT,
    N TEXT,
    Note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cell_id) REFERENCES cells(id),
    UNIQUE(cell_id, card_index)
  )`);

  // Inizializza le celle se non esistono
  db.get("SELECT COUNT(*) as count FROM cells", (err, row) => {
    if (err) {
      console.error('Errore durante il conteggio delle celle:', err);
      return;
    }

    if (row.count === 0) {
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
        return cellNumber;
      });

      const stmt = db.prepare("INSERT INTO cells (cell_number) VALUES (?)");
      cells.forEach(cellNumber => {
        stmt.run(cellNumber, function(err) {
          if (err) {
            console.error('Errore durante l\'inserimento della cella:', err);
            return;
          }
          // Inserisci le 4 card per ogni cella
          const cardStmt = db.prepare("INSERT INTO cards (cell_id, card_index) VALUES (?, ?)");
          for (let i = 0; i < 4; i++) {
            cardStmt.run(this.lastID, i);
          }
          cardStmt.finalize();
        });
      });
      stmt.finalize();
    }
  });
}

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
app.get('/api/cells', (req, res) => {
  db.all(`
    SELECT c.*, 
           json_group_array(
             json_object(
               'status', card.status,
               'startTime', card.start_time,
               'endTime', card.end_time,
               'TR', card.TR,
               'card_id', card.card_id,
               'N', card.N,
               'Note', card.Note
             )
           ) as cards
    FROM cells c
    LEFT JOIN cards card ON c.id = card.cell_id
    GROUP BY c.id
    ORDER BY c.id
  `, [], (err, rows) => {
    if (err) {
      console.error('Errore durante il recupero delle celle:', err);
      res.status(500).json({ error: 'Errore durante il recupero delle celle' });
      return;
    }

    // Converti la stringa JSON delle card in array
    const cells = rows.map(row => ({
      ...row,
      cards: JSON.parse(row.cards)
    }));

    res.json(cells);
  });
});

// Save cell data (admin)
app.post('/api/cells', (req, res) => {
  const cellData = req.body;
  
  db.get("SELECT id FROM cells WHERE cell_number = ?", [cellData.cell_number], (err, row) => {
    if (err) {
      console.error('Errore durante la ricerca della cella:', err);
      res.status(500).json({ error: 'Errore durante il salvataggio' });
      return;
    }

    if (!row) {
      res.status(404).json({ error: 'Cella non trovata' });
      return;
    }

    // Aggiorna i dati della cella
    db.run(`
      UPDATE cells 
      SET field_id = ?,
          field_n = ?,
          field_tr = ?,
          field_note = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      cellData.field_id || '',
      cellData.field_n || '',
      cellData.field_tr || '',
      cellData.field_note || '',
      row.id
    ], function(err) {
      if (err) {
        console.error('Errore durante l\'aggiornamento della cella:', err);
        res.status(500).json({ error: 'Errore durante il salvataggio' });
        return;
      }

      // Aggiorna le card
      const cardStmt = db.prepare(`
        UPDATE cards 
        SET status = ?,
            TR = ?,
            card_id = ?,
            N = ?,
            Note = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE cell_id = ? AND card_index = ?
      `);

      cellData.cards.forEach((card, index) => {
        cardStmt.run(
          card.status || 'default',
          card.TR || '',
          card.card_id || '',
          card.N || '',
          card.Note || '',
          row.id,
          index
        );
      });

      cardStmt.finalize();
      res.json({ message: 'Dati salvati con successo' });
    });
  });
});

// Save preposto changes
app.post('/api/preposto-changes', (req, res) => {
  const { cellIndex, cardIndex, status, startTime, endTime } = req.body;
  
  db.get("SELECT id FROM cells WHERE id = ?", [cellIndex + 1], (err, row) => {
    if (err || !row) {
      res.status(404).json({ error: 'Cella non trovata' });
      return;
    }

    db.run(`
      UPDATE cards 
      SET status = ?,
          start_time = ?,
          end_time = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE cell_id = ? AND card_index = ?
    `, [status, startTime, endTime, row.id, cardIndex], function(err) {
      if (err) {
        console.error('Errore durante l\'aggiornamento della card:', err);
        res.status(500).json({ error: 'Errore durante il salvataggio' });
        return;
      }
      res.json({ message: 'Modifiche salvate con successo' });
    });
  });
});

// Get cell history
app.get('/api/cells/:cellNumber/history', (req, res) => {
  const { cellNumber } = req.params;
  
  db.all(`
    SELECT c.*, 
           json_group_array(
             json_object(
               'status', card.status,
               'startTime', card.start_time,
               'endTime', card.end_time,
               'TR', card.TR,
               'card_id', card.card_id,
               'N', card.N,
               'Note', card.Note,
               'updated_at', card.updated_at
             )
           ) as cards_history
    FROM cells c
    LEFT JOIN cards card ON c.id = card.cell_id
    WHERE c.cell_number = ?
    GROUP BY c.id
  `, [cellNumber], (err, rows) => {
    if (err) {
      console.error('Errore durante il recupero della cronologia:', err);
      res.status(500).json({ error: 'Errore durante il recupero della cronologia' });
      return;
    }

    if (rows.length === 0) {
      res.status(404).json({ error: 'Cella non trovata' });
      return;
    }

    const history = rows.map(row => ({
      cell_number: row.cell_number,
      field_id: row.field_id,
      field_n: row.field_n,
      field_tr: row.field_tr,
      field_note: row.field_note,
      updated_at: row.updated_at,
      cards: JSON.parse(row.cards_history)
    }));

    res.json(history);
  });
});

// Delete cell data
app.delete('/api/cells/:cellNumber', (req, res) => {
  const { cellNumber } = req.params;
  
  db.get("SELECT id FROM cells WHERE cell_number = ?", [cellNumber], (err, row) => {
    if (err || !row) {
      res.status(404).json({ error: 'Cella non trovata' });
      return;
    }

    // Resetta i dati della cella
    db.run(`
      UPDATE cells 
      SET field_id = '',
          field_n = '',
          field_tr = '',
          field_note = '',
          status = 'default',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [row.id], function(err) {
      if (err) {
        console.error('Errore durante il reset della cella:', err);
        res.status(500).json({ error: 'Errore durante l\'eliminazione' });
        return;
      }

      // Resetta le card
      db.run(`
        UPDATE cards 
        SET status = 'default',
            start_time = NULL,
            end_time = NULL,
            TR = '',
            card_id = '',
            N = '',
            Note = '',
            updated_at = CURRENT_TIMESTAMP
        WHERE cell_id = ?
      `, [row.id], function(err) {
        if (err) {
          console.error('Errore durante il reset delle card:', err);
          res.status(500).json({ error: 'Errore durante l\'eliminazione' });
          return;
        }
        res.json({ message: 'Dati eliminati con successo' });
      });
    });
  });
});

// Reset monitoring endpoint
app.post('/api/reset-monitoring', (req, res) => {
  db.run(`
    UPDATE cells 
    SET status = 'default',
        updated_at = CURRENT_TIMESTAMP
  `, [], function(err) {
    if (err) {
      console.error('Errore durante il reset del monitoraggio:', err);
      res.status(500).json({ error: 'Errore durante il reset del monitoraggio' });
      return;
    }

    db.run(`
      UPDATE cards 
      SET status = 'default',
          start_time = NULL,
          end_time = NULL,
          updated_at = CURRENT_TIMESTAMP
    `, [], function(err) {
      if (err) {
        console.error('Errore durante il reset delle card:', err);
        res.status(500).json({ error: 'Errore durante il reset del monitoraggio' });
        return;
      }
      res.json({ message: 'Monitoraggio resettato con successo' });
    });
  });
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