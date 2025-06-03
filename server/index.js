// Endpoint per resettare i dati di monitoraggio
app.post('/api/reset-monitoring', async (req, res) => {
  try {
    // Verifica che l'utente sia admin
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Non autorizzato' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono resettare i dati di monitoraggio' });
    }

    // Cancella tutti i log di monitoraggio
    await db.query('DELETE FROM monitoring_logs');
    
    res.json({ message: 'Log di monitoraggio resettati con successo' });
  } catch (error) {
    console.error('Error resetting monitoring logs:', error);
    res.status(500).json({ error: 'Errore nel reset dei log di monitoraggio' });
  }
}); 

// Crea la tabella per i log di monitoraggio se non esiste
db.query(`
  CREATE TABLE IF NOT EXISTS monitoring_logs (
    id SERIAL PRIMARY KEY,
    cell_number VARCHAR(50) NOT NULL,
    card_index INTEGER NOT NULL,
    event_type VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    card_data JSONB
  )
`).catch(err => console.error('Error creating monitoring_logs table:', err));

// Endpoint per registrare un evento di monitoraggio
app.post('/api/monitoring-logs', async (req, res) => {
  try {
    const { cellNumber, cardIndex, eventType, cardData } = req.body;
    
    await db.query(
      'INSERT INTO monitoring_logs (cell_number, card_index, event_type, card_data) VALUES ($1, $2, $3, $4)',
      [cellNumber, cardIndex, eventType, JSON.stringify(cardData)]
    );

    res.json({ message: 'Evento registrato con successo' });
  } catch (error) {
    console.error('Error recording monitoring event:', error);
    res.status(500).json({ error: 'Errore nella registrazione dell\'evento' });
  }
});

// Endpoint per ottenere i log di monitoraggio
app.get('/api/monitoring-logs', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM monitoring_logs ORDER BY timestamp DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching monitoring logs:', error);
    res.status(500).json({ error: 'Errore nel recupero dei log' });
  }
}); 