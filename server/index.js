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

    // Recupera tutte le celle
    const cells = await db.query('SELECT * FROM cells');
    
    // Per ogni cella, resetta solo i dati di monitoraggio
    for (const cell of cells) {
      const cards = JSON.parse(cell.cards);
      const updatedCards = cards.map(card => ({
        ...card,
        startTime: null,
        endTime: null
      }));

      await db.query(
        'UPDATE cells SET cards = $1 WHERE cell_number = $2',
        [JSON.stringify(updatedCards), cell.cell_number]
      );
    }

    res.json({ message: 'Dati di monitoraggio resettati con successo' });
  } catch (error) {
    console.error('Error resetting monitoring data:', error);
    res.status(500).json({ error: 'Errore nel reset dei dati di monitoraggio' });
  }
}); 