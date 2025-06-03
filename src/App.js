import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  TextField, 
  Grid, 
  Card, 
  CardContent,
  Box,
  Button,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  AppBar,
  Toolbar
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LogoutIcon from '@mui/icons-material/Logout';
import LockIcon from '@mui/icons-material/Lock';
import Login from './components/Login';
import Monitoring from './components/Monitoring';
import SaveIcon from '@mui/icons-material/Save';
import ClearIcon from '@mui/icons-material/Clear';
import HistoryIcon from '@mui/icons-material/History';
import DeleteIcon from '@mui/icons-material/Delete';

const API_URL = 'https://web-production-b7884.up.railway.app';

function App() {
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [cells, setCells] = useState(Array(17).fill(null).map((_, index) => ({
    id: index < 10 ? `Buca ${index + 4}` : 
        index < 14 ? `Buca ${index + 16}` :
        `Preparazione ${index - 13}`,
    cards: Array(4).fill(null).map(() => ({
      status: 'default',
      startTime: null,
      endTime: null,
      TR: '',
      ID: '',
      N: '',
      Note: ''
    }))
  })));
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  const [historyDialog, setHistoryDialog] = useState({ open: false, cellNumber: '', history: [] });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, cellNumber: '' });
  const [confirmationDialog, setConfirmationDialog] = useState({ 
    open: false, 
    cellIndex: null, 
    cardIndex: null,
    step: 1 // 1: first confirmation, 2: second confirmation
  });
  const [resetColorsDialog, setResetColorsDialog] = useState({ open: false });
  const [passwordDialog, setPasswordDialog] = useState({ 
    open: false,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    error: ''
  });

  // Load data from backend when component mounts
  useEffect(() => {
    if (user) {
      const loadData = async () => {
        try {
          const response = await fetch(`${API_URL}/api/cells`);
          if (!response.ok) {
            throw new Error('Errore nel caricamento dei dati');
          }
          const data = await response.json();
          const updatedCells = [...cells];
          
          data.forEach(item => {
            let cellIndex;
            const cellNumber = item.cell_number;
            
            if (cellNumber.startsWith('Buca')) {
              const num = parseInt(cellNumber.split(' ')[1]);
              if (num >= 4 && num <= 13) {
                cellIndex = num - 4;  // Buca 4 -> index 0, Buca 13 -> index 9
              } else if (num >= 30 && num <= 33) {
                cellIndex = num - 20;  // Buca 30 -> index 10, Buca 33 -> index 13
              }
            } else if (cellNumber.startsWith('Preparazione')) {
              const num = parseInt(cellNumber.split(' ')[1]);
              cellIndex = num + 13;  // Preparazione 1 -> index 14, Preparazione 3 -> index 16
            }

            if (cellIndex !== undefined && cellIndex >= 0 && cellIndex < updatedCells.length) {
              console.log(`Mapping ${cellNumber} to index ${cellIndex}`);
              updatedCells[cellIndex].cards = item.cards.map(card => ({
                status: card.status || 'default',
                startTime: card.startTime || null,
                endTime: card.endTime || null,
                TR: card.TR || '',
                ID: card.ID || '',
                N: card.N || '',
                Note: card.Note || ''
              }));
            }
          });
          
          setCells(updatedCells);
          showNotification('Dati caricati con successo', 'success');
        } catch (error) {
          console.error('Error loading data:', error);
          showNotification('Impossibile connettersi al server. Verificare che il server sia in esecuzione.', 'error');
        }
      };

      loadData();
    }
  }, [user]);

  // Polling per aggiornare i dati
  useEffect(() => {
    if (user) {
      const pollData = async () => {
        try {
          const response = await fetch(`${API_URL}/api/cells`);
          if (!response.ok) {
            throw new Error('Errore nel caricamento dei dati');
          }
          const data = await response.json();
          
          // Aggiorna solo se non ci sono modifiche locali in corso
          setCells(prevCells => {
            const newCells = [...prevCells];
            data.forEach(item => {
              let cellIndex;
              const cellNumber = item.cell_number;
              
              if (cellNumber.startsWith('Buca')) {
                const num = parseInt(cellNumber.split(' ')[1]);
                if (num >= 4 && num <= 13) {
                  cellIndex = num - 4;
                } else if (num >= 30 && num <= 33) {
                  cellIndex = num - 20;
                }
              } else if (cellNumber.startsWith('Preparazione')) {
                const num = parseInt(cellNumber.split(' ')[1]);
                cellIndex = num + 13;
              }

              if (cellIndex !== undefined && cellIndex >= 0 && cellIndex < newCells.length) {
                // Mantieni i dati locali se sono stati modificati
                const localCell = newCells[cellIndex];
                const serverCards = item.cards.map(card => ({
                  status: card.status || 'default',
                  startTime: card.startTime || null,
                  endTime: card.endTime || null,
                  TR: card.TR || '',
                  ID: card.ID || '',
                  N: card.N || '',
                  Note: card.Note || ''
                }));

                // Aggiorna solo se i dati del server sono diversi
                if (JSON.stringify(localCell.cards) !== JSON.stringify(serverCards)) {
                  newCells[cellIndex].cards = serverCards;
                }
              }
            });
            return newCells;
          });
        } catch (error) {
          console.error('Error polling data:', error);
        }
      };

      // Poll ogni 5 secondi
      const interval = setInterval(pollData, 5000);
      pollData(); // Poll immediatamente

      return () => clearInterval(interval);
    }
  }, [user]);

  // Aggiungi debouncing per il salvataggio
  const debouncedSave = (() => {
    let timeout;
    return (cellIndex) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        saveCellData(cellIndex);
      }, 1000); // Attendi 1 secondo dopo l'ultima modifica prima di salvare
    };
  })();

  const handleLogin = (role, newSessionId) => {
    setUser(role);
    setSessionId(newSessionId);
    showNotification(`Accesso effettuato come ${role}`, 'success');
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: user, sessionId }),
      });
    } catch (error) {
      console.error('Error during logout:', error);
    }
    // Rimuovi la sessione dal localStorage
    localStorage.removeItem('session');
    setUser(null);
    setSessionId(null);
    showNotification('Logout effettuato', 'success');
  };

  const showNotification = (message, severity) => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  const handleCellChange = (cellIndex, field, value, cardIndex) => {
    if (user !== 'admin') return; // Only admin can modify data
    const newCells = [...cells];
    if (cardIndex !== null) {
      // Gestisci tutti i campi allo stesso modo
      newCells[cellIndex].cards[cardIndex][field] = value;
      setCells(newCells);
    }
  };

  // Funzione per determinare il colore del campo TR
  const getTRColor = (tr) => {
    const cleanTR = tr.trim().toLowerCase();
    // Check for TR 1 variations
    if (cleanTR === '1' || cleanTR === '1a' || cleanTR === '1b' || cleanTR === '1s' || cleanTR === '1c') {
      return '#2196f3'; // Blue
    }
    // Check for TR 2 variations
    if (cleanTR === '2' || cleanTR === '2a' || cleanTR === '2b' || cleanTR === '2s' || cleanTR === '2c') {
      return '#ff9800'; // Orange
    }
    // Check for TR 3 variations
    if (cleanTR === '3' || cleanTR === '3a' || cleanTR === '3b' || cleanTR === '3s' || cleanTR === '3c') {
      return '#9c27b0'; // Purple
    }
    // Check for Serale variations
    if (cleanTR === 'serale' || cleanTR === 'serale a' || cleanTR === 'serale b' || cleanTR === 'serale s' || cleanTR === 'serale c') {
      return '#795548'; // Brown
    }
    return 'white';
  };

  const saveCellData = async (cellIndex) => {
    setSaving(true);
    try {
      // Determina il nome della cella in base all'indice
      let cellName;
      if (cellIndex < 10) {
        cellName = `Buca ${cellIndex + 4}`;
      } else if (cellIndex < 14) {
        cellName = `Buca ${cellIndex + 16}`;
      } else {
        cellName = `Preparazione ${cellIndex - 13}`;
      }

      // Verifica che i dati della cella esistano
      if (!cells[cellIndex] || !cells[cellIndex].cards) {
        console.error('Dati cella non validi:', cellIndex);
        return;
      }

      const cellData = {
        cell_number: cellName,
        cards: cells[cellIndex].cards.map(card => ({
          status: card.status || 'default',
          startTime: card.startTime || null,
          endTime: card.endTime || null,
          TR: card.TR || '',
          ID: card.ID || '',
          N: card.N || '',
          Note: card.Note || ''
        }))
      };

      console.log('=== DEBUG SAVE ===');
      console.log('Cell Index:', cellIndex);
      console.log('Cell Name:', cellName);
      console.log('Current Cell Data:', JSON.stringify(cells[cellIndex], null, 2));
      console.log('Sending to server:', JSON.stringify(cellData, null, 2));

      const response = await fetch(`${API_URL}/api/cells`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cellData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server response error:', errorData);
        throw new Error(errorData.error || 'Errore nel salvataggio');
      }
      
      const result = await response.json();
      console.log('Server response success:', result);
      showNotification(result.message || 'Dati salvati con successo', 'success');

      // Ricarica i dati dal server dopo il salvataggio
      const updatedResponse = await fetch(`${API_URL}/api/cells`);
      if (!updatedResponse.ok) {
        throw new Error('Errore nel caricamento dei dati aggiornati');
      }
      const updatedData = await updatedResponse.json();
      
      // Aggiorna lo stato locale con i dati aggiornati
      const updatedCells = [...cells];
      updatedData.forEach(item => {
        let cellIndex;
        const cellNumber = item.cell_number;
        
        if (cellNumber.startsWith('Buca')) {
          const num = parseInt(cellNumber.split(' ')[1]);
          if (num >= 4 && num <= 13) {
            cellIndex = num - 4;
          } else if (num >= 30 && num <= 33) {
            cellIndex = num - 20;
          }
        } else if (cellNumber.startsWith('Preparazione')) {
          const num = parseInt(cellNumber.split(' ')[1]);
          cellIndex = num + 13;
        }

        if (cellIndex !== undefined && cellIndex >= 0 && cellIndex < updatedCells.length) {
          updatedCells[cellIndex].cards = item.cards.map(card => ({
            status: card.status || 'default',
            startTime: card.startTime || null,
            endTime: card.endTime || null,
            TR: card.TR || '',
            ID: card.ID || '',
            N: card.N || '',
            Note: card.Note || ''
          }));
        }
      });
      
      setCells(updatedCells);

    } catch (error) {
      console.error('Error saving data:', error);
      showNotification('Impossibile salvare i dati. Verificare che il server sia in esecuzione.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const clearCellData = (cellIndex) => {
    if (user !== 'admin') return; // Only admin can clear data
    const newCells = [...cells];
    newCells[cellIndex].cards = newCells[cellIndex].cards.map(() => ({
      status: 'default',
      startTime: null,
      endTime: null,
      TR: '',
      ID: '',
      N: '',
      Note: ''
    }));
    setCells(newCells);
    saveCellData(cellIndex);
  };

  const viewHistory = async (cellNumber) => {
    try {
      const response = await fetch(`${API_URL}/api/cells/${cellNumber}/history`);
      if (!response.ok) throw new Error('Errore nel caricamento della cronologia');
      const history = await response.json();
      setHistoryDialog({ open: true, cellNumber, history });
    } catch (error) {
      showNotification('Errore nel caricamento della cronologia', 'error');
    }
  };

  const handleDelete = async (cellNumber) => {
    if (user !== 'admin') return; // Only admin can delete data
    try {
      const response = await fetch(`${API_URL}/api/cells/${cellNumber}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Errore nell\'eliminazione della cella');
      
      const result = await response.json();
      showNotification(result.message, 'success');
      setDeleteDialog({ open: false, cellNumber: '' });
      
      // Refresh data
      const cellIndex = parseInt(cellNumber.split(' ')[1]) - 1;
      clearCellData(cellIndex);
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleResetColors = async () => {
    if (user !== 'admin') return;
    
    try {
      // Prima resetta tutte le celle localmente
      const newCells = [...cells];
      newCells.forEach(cell => {
        cell.cards = cell.cards.map(card => ({
          ...card,  // Mantiene tutti i dati esistenti
          status: 'default',  // Resetta solo lo stato
          startTime: null,    // Resetta i timestamp
          endTime: null
        }));
      });
      setCells(newCells);
      setResetColorsDialog({ open: false });

      // Poi salva tutte le celle sul server in sequenza
      for (let i = 0; i < newCells.length; i++) {
        let cellName;
        if (i < 10) {
          cellName = `Buca ${i + 4}`;
        } else if (i < 14) {
          cellName = `Buca ${i + 16}`;
        } else {
          cellName = `Preparazione ${i - 13}`;
        }

        const cellData = {
          cell_number: cellName,
          cards: newCells[i].cards.map(card => ({
            status: 'default',
            startTime: null,
            endTime: null,
            TR: card.TR || '',
            ID: card.ID || '',
            N: card.N || '',
            Note: card.Note || ''
          }))
        };

        const response = await fetch(`${API_URL}/api/cells`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cellData),
        });

        if (!response.ok) {
          throw new Error(`Errore nel salvataggio della cella ${cellName}`);
        }
      }

      // Ricarica i dati dal server per assicurarsi che tutto sia sincronizzato
      const updatedResponse = await fetch(`${API_URL}/api/cells`);
      if (!updatedResponse.ok) {
        throw new Error('Errore nel caricamento dei dati aggiornati');
      }
      const updatedData = await updatedResponse.json();
      
      // Aggiorna lo stato locale con i dati aggiornati
      const updatedCells = [...cells];
      updatedData.forEach(item => {
        let cellIndex;
        const cellNumber = item.cell_number;
        
        if (cellNumber.startsWith('Buca')) {
          const num = parseInt(cellNumber.split(' ')[1]);
          if (num >= 4 && num <= 13) {
            cellIndex = num - 4;
          } else if (num >= 30 && num <= 33) {
            cellIndex = num - 20;
          }
        } else if (cellNumber.startsWith('Preparazione')) {
          const num = parseInt(cellNumber.split(' ')[1]);
          cellIndex = num + 13;
        }

        if (cellIndex !== undefined && cellIndex >= 0 && cellIndex < updatedCells.length) {
          updatedCells[cellIndex].cards = item.cards.map(card => ({
            status: card.status || 'default',
            startTime: card.startTime || null,
            endTime: card.endTime || null,
            TR: card.TR || '',
            ID: card.ID || '',
            N: card.N || '',
            Note: card.Note || ''
          }));
        }
      });
      
      setCells(updatedCells);
      showNotification('Colori resettati con successo', 'success');
    } catch (error) {
      console.error('Error resetting colors:', error);
      showNotification('Errore nel reset dei colori', 'error');
    }
  };

  const handlePrepostoConfirmation = async (cellIndex, cardIndex, status) => {
    try {
      console.log('Saving preposto changes for:', { cellIndex, cardIndex, status });
      
      // Determina il nome della cella in base all'indice
      let cellNumber;
      if (cellIndex < 10) {
        cellNumber = `Buca ${cellIndex + 4}`;
      } else if (cellIndex < 14) {
        cellNumber = `Buca ${cellIndex + 20}`;  // Corretto per le buche 30-33
      } else {
        cellNumber = `Preparazione ${cellIndex - 13}`;
      }

      console.log('Nome cella determinato:', cellNumber);

      // Determina il nuovo stato della card
      let newStatus;
      const currentStatus = cells[cellIndex].cards[cardIndex].status;
      
      if (currentStatus === 'yellow') {
        // Se la cella è già gialla, il nuovo stato sarà verde se confermato, altrimenti rimane gialla
        newStatus = status ? 'green' : 'yellow';
      } else {
        // Se la cella non è gialla, il nuovo stato sarà giallo se confermato, altrimenti rosso
        newStatus = status ? 'yellow' : 'red';
      }

      const startTime = newStatus === 'yellow' ? new Date().toISOString() : null;
      const endTime = newStatus === 'green' ? new Date().toISOString() : null;

      // Aggiorna prima lo stato locale
      const newCells = [...cells];
      newCells[cellIndex].cards[cardIndex] = {
        ...newCells[cellIndex].cards[cardIndex],
        status: newStatus,
        startTime,
        endTime
      };
      setCells(newCells);

      // Verifica se la cella esiste
      console.log('Verifica esistenza cella:', cellNumber);
      const checkResponse = await fetch(`${API_URL}/api/cells/${cellNumber}`);
      if (!checkResponse.ok) {
        // Se la cella non esiste, popola tutte le celle mancanti
        console.log('Cella non trovata, popolamento celle mancanti...');
        const populateResponse = await fetch(`${API_URL}/api/populate-cells`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cellNumber })
        });

        if (!populateResponse.ok) {
          throw new Error('Errore durante il popolamento delle celle');
        }

        const populateResult = await populateResponse.json();
        console.log('Risultato popolamento celle:', populateResult);

        if (!populateResult.cellExists) {
          // Se ci sono errori specifici, mostrali
          if (populateResult.errors && populateResult.errors.length > 0) {
            throw new Error(populateResult.errors.join('\n'));
          }
          throw new Error(`Impossibile creare la cella ${cellNumber}`);
        }
      }

      // Procedi con il salvataggio delle modifiche
      console.log('Salvataggio modifiche per cella:', cellNumber);
      const response = await fetch(`${API_URL}/api/preposto-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cellNumber,
          cardIndex,
          status: newStatus,
          startTime,
          endTime
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore nel salvataggio delle modifiche');
      }

      const result = await response.json();
      console.log('Risultato salvataggio:', result);

      // Ricarica i dati dopo il salvataggio
      console.log('Ricarico dati dopo salvataggio...');
      const finalReloadResponse = await fetch(`${API_URL}/api/cells`);
      if (!finalReloadResponse.ok) {
        throw new Error('Errore nel ricaricamento dei dati finali');
      }
      const finalReloadData = await finalReloadResponse.json();
      
      // Aggiorna lo stato locale con i dati finali
      const finalCells = [...cells];
      finalReloadData.forEach(item => {
        let cellIndex;
        const cellNumber = item.cell_number;
        
        if (cellNumber.startsWith('Buca')) {
          const num = parseInt(cellNumber.split(' ')[1]);
          if (num >= 4 && num <= 13) {
            cellIndex = num - 4;
          } else if (num >= 30 && num <= 33) {
            cellIndex = num - 20;  // Corretto per le buche 30-33
          }
        } else if (cellNumber.startsWith('Preparazione')) {
          const num = parseInt(cellNumber.split(' ')[1]);
          cellIndex = num + 13;
        }

        if (cellIndex !== undefined && cellIndex >= 0 && cellIndex < finalCells.length) {
          console.log(`Mapping finale ${cellNumber} to index ${cellIndex}`);
          finalCells[cellIndex].cards = item.cards.map(card => ({
            status: card.status || 'default',
            startTime: card.startTime || null,
            endTime: card.endTime || null,
            TR: card.TR || '',
            ID: card.ID || '',
            N: card.N || '',
            Note: card.Note || ''
          }));
        }
      });
      
      setCells(finalCells);

      // Chiudi il dialog di conferma
      setConfirmationDialog({ open: false, cellIndex: null, cardIndex: null, step: 1 });

      showNotification('Modifiche salvate con successo', 'success');
    } catch (error) {
      console.error('Error saving preposto changes:', error);
      showNotification(error.message || 'Errore nel salvataggio delle modifiche', 'error');
    }
  };

  const handlePasswordChange = async () => {
    if (passwordDialog.newPassword !== passwordDialog.confirmPassword) {
      setPasswordDialog(prev => ({ ...prev, error: 'Le password non coincidono' }));
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: user,
          currentPassword: passwordDialog.currentPassword,
          newPassword: passwordDialog.newPassword
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      const result = await response.json();
      showNotification(result.message, 'success');
      setPasswordDialog({ 
        open: false,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        error: ''
      });
    } catch (error) {
      setPasswordDialog(prev => ({ ...prev, error: error.message }));
    }
  };

  // Filter cells based on search term
  const filteredCells = cells.map(cell => {
    // Se non c'è un termine di ricerca, mostra tutte le celle normalmente
    if (!searchTerm) return cell;

    // Controlla se almeno una card nella cella corrisponde alla ricerca
    const hasMatchingCard = cell.cards.some(card => 
      (card.ID && card.ID.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (card.N && card.N.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Se nessuna card corrisponde, non mostrare la cella
    if (!hasMatchingCard) return null;

    // Altrimenti, mostra la cella con tutte le sue card
    return cell;
  }).filter(Boolean); // Rimuove le celle null (quelle senza corrispondenze)

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (showMonitoring) {
    return <Monitoring onBack={() => setShowMonitoring(false)} cells={cells} user={user} />;
  }

  return (
    <Container maxWidth="xl" sx={{ py: 1 }}>
      <AppBar position="static" sx={{ mb: 2 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Gestione Piazzale - {user === 'admin' ? 'Amministratore' : 'Preposto'}
          </Typography>
          {user === 'admin' && (
            <>
              <Button 
                color="inherit" 
                onClick={() => setShowMonitoring(true)}
                sx={{ mr: 2 }}
              >
                Monitoraggio
              </Button>
              <Button 
                color="inherit" 
                onClick={() => setResetColorsDialog({ open: true })}
                sx={{ mr: 2 }}
              >
                Reset Colori
              </Button>
            </>
          )}
          <Button 
            color="inherit" 
            startIcon={<LockIcon />}
            onClick={() => setPasswordDialog({ ...passwordDialog, open: true })}
            sx={{ mr: 2 }}
          >
            Cambia Password
          </Button>
          <Button 
            color="inherit" 
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Cerca..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 0.5, color: 'text.secondary', fontSize: '1rem' }} />
          }}
          sx={{ '& .MuiInputBase-root': { height: '32px' } }}
        />
      </Box>

      <Grid container spacing={0.25}>
        {filteredCells.slice(0, 10).map((cell, index) => (
          <Grid item xs={2.4} sm={2} md={1.2} lg={1} key={index}>
            <Box sx={{ mb: 0.25 }}>
              <Typography variant="caption" align="center" sx={{ 
                p: 0.15, 
                bgcolor: 'primary.main', 
                color: 'white',
                borderRadius: 0.25,
                fontSize: '0.75rem',
                fontWeight: 'bold',
                display: 'block'
              }}>
                {`Buca ${index + 4}`}
              </Typography>
            </Box>
            {[0, 1, 2, 3].map((cardIndex) => (
              <Card key={cardIndex} sx={{ 
                maxWidth: 120, 
                mx: 'auto', 
                mb: 0.5,
                bgcolor: cell.cards[cardIndex].status === 'yellow' ? '#fff176' : 
                        cell.cards[cardIndex].status === 'red' ? '#ff8a80' : 
                        cell.cards[cardIndex].status === 'green' ? '#81c784' :
                        'white'
              }}>
                <CardContent sx={{ p: 0.25 }}>
                  <Grid container spacing={0.25}>
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ mr: 0.5, fontSize: '0.65rem', width: '25px' }}>
                          ID:
                        </Typography>
                        <TextField
                          fullWidth
                          value={cell.cards[cardIndex].ID}
                          onChange={(e) => handleCellChange(index, 'ID', e.target.value, cardIndex)}
                          size="small"
                          disabled={user !== 'admin'}
                          sx={{ 
                            '& .MuiInputBase-input': { 
                              py: 0.15, 
                              fontSize: '0.65rem',
                              fontWeight: 'bold'
                            },
                            '& .MuiOutlinedInput-root': { minHeight: '24px' }
                          }}
                        />
                      </Box>
                    </Grid>
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ mr: 0.5, fontSize: '0.65rem', width: '25px' }}>
                          N:
                        </Typography>
                        <TextField
                          fullWidth
                          value={cell.cards[cardIndex].N}
                          onChange={(e) => handleCellChange(index, 'N', e.target.value, cardIndex)}
                          size="small"
                          disabled={user !== 'admin'}
                          sx={{ 
                            '& .MuiInputBase-input': { 
                              py: 0.15, 
                              fontSize: '0.65rem',
                              fontWeight: 'bold'
                            },
                            '& .MuiOutlinedInput-root': { minHeight: '24px' }
                          }}
                        />
                      </Box>
                    </Grid>
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ mr: 0.5, fontSize: '0.65rem', width: '25px' }}>
                          TR:
                        </Typography>
                        <TextField
                          fullWidth
                          value={cell.cards[cardIndex].TR || ''}
                          onChange={(e) => handleCellChange(index, 'TR', e.target.value, cardIndex)}
                          size="small"
                          disabled={user !== 'admin'}
                          sx={{ 
                            '& .MuiInputBase-input': { 
                              py: 0.15, 
                              fontSize: '0.65rem',
                              fontWeight: 'bold'
                            },
                            '& .MuiOutlinedInput-root': { 
                              minHeight: '24px',
                              bgcolor: getTRColor(cell.cards[cardIndex].TR || ''),
                              '& fieldset': {
                                borderColor: 'transparent'
                              }
                            }
                          }}
                        />
                      </Box>
                    </Grid>
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ mr: 0.5, fontSize: '0.65rem', width: '25px' }}>
                          Note:
                        </Typography>
                        <TextField
                          fullWidth
                          value={cell.cards[cardIndex].Note}
                          onChange={(e) => handleCellChange(index, 'Note', e.target.value, cardIndex)}
                          size="small"
                          multiline
                          rows={1}
                          disabled={user !== 'admin'}
                          sx={{ 
                            '& .MuiInputBase-input': { 
                              py: 0.15, 
                              fontSize: '0.65rem',
                              fontWeight: 'bold'
                            },
                            '& .MuiOutlinedInput-root': { minHeight: '24px' }
                          }}
                        />
                      </Box>
                    </Grid>
                    {user === 'preposto' && (
                      <Grid item xs={12} sx={{ mt: 0.25 }}>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          fullWidth
                          onClick={() => {
                            const currentStatus = cells[index].cards[cardIndex].status;
                            setConfirmationDialog({ 
                              open: true, 
                              cellIndex: index, 
                              cardIndex, 
                              step: currentStatus === 'yellow' ? 2 : 1 
                            });
                          }}
                          sx={{ 
                            py: 0.15,
                            fontSize: '0.65rem',
                            height: '20px',
                            minWidth: 'auto'
                          }}
                        >
                          OK
                        </Button>
                      </Grid>
                    )}
                    {user === 'admin' && (
                      <Grid item xs={12} sx={{ mt: 0.25 }}>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          fullWidth
                          onClick={() => saveCellData(index)}
                          sx={{ 
                            py: 0.15,
                            fontSize: '0.65rem',
                            height: '20px',
                            minWidth: 'auto'
                          }}
                        >
                          OK
                        </Button>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>
            ))}
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: 4, mb: 2 }}>
        <Typography variant="subtitle2" align="center" sx={{ mb: 1, color: 'text.secondary' }}>
          Buche 30-33 e Preparazione
        </Typography>
        <Grid container spacing={0.25}>
          {filteredCells.slice(10, 17).map((cell, index) => {
            // Calcola l'indice corretto per le celle da buca 30 in poi
            const actualIndex = index + 10;
            return (
              <Grid item xs={2.4} sm={2} md={1.2} lg={1} key={actualIndex}>
                <Box sx={{ mb: 0.25 }}>
                  <Typography variant="caption" align="center" sx={{ 
                    p: 0.15, 
                    bgcolor: 'primary.main', 
                    color: 'white',
                    borderRadius: 0.25,
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    display: 'block'
                  }}>
                    {actualIndex < 14 ? `Buca ${actualIndex + 16}` : `Preparazione ${actualIndex - 13}`}
                  </Typography>
                </Box>
                {[0, 1, 2, 3].map((cardIndex) => (
                  <Card key={cardIndex} sx={{ 
                    maxWidth: 120, 
                    mx: 'auto', 
                    mb: 0.5,
                    bgcolor: cell.cards[cardIndex].status === 'yellow' ? '#fff176' : 
                            cell.cards[cardIndex].status === 'red' ? '#ff8a80' : 
                            cell.cards[cardIndex].status === 'green' ? '#81c784' :
                            'white'
                  }}>
                    <CardContent sx={{ p: 0.25 }}>
                      <Grid container spacing={0.25}>
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ mr: 0.5, fontSize: '0.65rem', width: '25px' }}>
                              ID:
                            </Typography>
                            <TextField
                              fullWidth
                              value={cell.cards[cardIndex].ID}
                              onChange={(e) => handleCellChange(actualIndex, 'ID', e.target.value, cardIndex)}
                              size="small"
                              disabled={user !== 'admin'}
                              sx={{ 
                                '& .MuiInputBase-input': { 
                                  py: 0.15, 
                                  fontSize: '0.65rem',
                                  fontWeight: 'bold'
                                },
                                '& .MuiOutlinedInput-root': { minHeight: '24px' }
                              }}
                            />
                          </Box>
                        </Grid>
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ mr: 0.5, fontSize: '0.65rem', width: '25px' }}>
                              N:
                            </Typography>
                            <TextField
                              fullWidth
                              value={cell.cards[cardIndex].N}
                              onChange={(e) => handleCellChange(actualIndex, 'N', e.target.value, cardIndex)}
                              size="small"
                              disabled={user !== 'admin'}
                              sx={{ 
                                '& .MuiInputBase-input': { 
                                  py: 0.15, 
                                  fontSize: '0.65rem',
                                  fontWeight: 'bold'
                                },
                                '& .MuiOutlinedInput-root': { minHeight: '24px' }
                              }}
                            />
                          </Box>
                        </Grid>
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ mr: 0.5, fontSize: '0.65rem', width: '25px' }}>
                              TR:
                            </Typography>
                            <TextField
                              fullWidth
                              value={cell.cards[cardIndex].TR || ''}
                              onChange={(e) => handleCellChange(actualIndex, 'TR', e.target.value, cardIndex)}
                              size="small"
                              disabled={user !== 'admin'}
                              sx={{ 
                                '& .MuiInputBase-input': { 
                                  py: 0.15, 
                                  fontSize: '0.65rem',
                                  fontWeight: 'bold'
                                },
                                '& .MuiOutlinedInput-root': { 
                                  minHeight: '24px',
                                  bgcolor: getTRColor(cell.cards[cardIndex].TR || ''),
                                  '& fieldset': {
                                    borderColor: 'transparent'
                                  }
                                }
                              }}
                            />
                          </Box>
                        </Grid>
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ mr: 0.5, fontSize: '0.65rem', width: '25px' }}>
                              Note:
                            </Typography>
                            <TextField
                              fullWidth
                              value={cell.cards[cardIndex].Note}
                              onChange={(e) => handleCellChange(actualIndex, 'Note', e.target.value, cardIndex)}
                              size="small"
                              multiline
                              rows={1}
                              disabled={user !== 'admin'}
                              sx={{ 
                                '& .MuiInputBase-input': { 
                                  py: 0.15, 
                                  fontSize: '0.65rem',
                                  fontWeight: 'bold'
                                },
                                '& .MuiOutlinedInput-root': { minHeight: '24px' }
                              }}
                            />
                          </Box>
                        </Grid>
                        {user === 'preposto' && (
                          <Grid item xs={12} sx={{ mt: 0.25 }}>
                            <Button
                              variant="contained"
                              color="primary"
                              size="small"
                              fullWidth
                              onClick={() => {
                                const currentStatus = cells[actualIndex].cards[cardIndex].status;
                                setConfirmationDialog({ 
                                  open: true, 
                                  cellIndex: actualIndex, 
                                  cardIndex, 
                                  step: currentStatus === 'yellow' ? 2 : 1 
                                });
                              }}
                              sx={{ 
                                py: 0.15,
                                fontSize: '0.65rem',
                                height: '20px',
                                minWidth: 'auto'
                              }}
                            >
                              OK
                            </Button>
                          </Grid>
                        )}
                        {user === 'admin' && (
                          <Grid item xs={12} sx={{ mt: 0.25 }}>
                            <Button
                              variant="contained"
                              color="primary"
                              size="small"
                              fullWidth
                              onClick={() => saveCellData(actualIndex)}
                              sx={{ 
                                py: 0.15,
                                fontSize: '0.65rem',
                                height: '20px',
                                minWidth: 'auto'
                              }}
                            >
                              OK
                            </Button>
                          </Grid>
                        )}
                      </Grid>
                    </CardContent>
                  </Card>
                ))}
              </Grid>
            );
          })}
        </Grid>
      </Box>

      {/* History Dialog */}
      <Dialog
        open={historyDialog.open}
        onClose={() => setHistoryDialog({ ...historyDialog, open: false })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Cronologia - {historyDialog.cellNumber}</DialogTitle>
        <DialogContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Data Modifica</TableCell>
                  <TableCell>ID</TableCell>
                  <TableCell>N</TableCell>
                  <TableCell>TR</TableCell>
                  <TableCell>Note</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {historyDialog.history.map((record, index) => (
                  <TableRow key={index}>
                    <TableCell>{new Date(record.updated_at).toLocaleString()}</TableCell>
                    <TableCell>{record.field_id}</TableCell>
                    <TableCell>{record.field_n}</TableCell>
                    <TableCell>{record.field_tr}</TableCell>
                    <TableCell>{record.field_note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialog({ ...historyDialog, open: false })}>
            Chiudi
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ ...deleteDialog, open: false })}
      >
        <DialogTitle>Conferma Eliminazione</DialogTitle>
        <DialogContent>
          Sei sicuro di voler eliminare {deleteDialog.cellNumber}?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })}>
            Annulla
          </Button>
          <Button 
            onClick={() => handleDelete(deleteDialog.cellNumber)} 
            color="error"
            variant="contained"
          >
            Elimina
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog for Preposto */}
      <Dialog
        open={confirmationDialog.open}
        onClose={() => setConfirmationDialog({ open: false, cellIndex: null, cardIndex: null, step: 1 })}
      >
        <DialogTitle>Conferma</DialogTitle>
        <DialogContent>
          <Typography>
            {confirmationDialog.step === 1 ? 
              "Arrivato in buca?" : 
              "Hanno controllato la merce e inviato la distinta?"
            }
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => handlePrepostoConfirmation(confirmationDialog.cellIndex, confirmationDialog.cardIndex, false)}
            color="error"
          >
            No
          </Button>
          <Button 
            onClick={() => handlePrepostoConfirmation(confirmationDialog.cellIndex, confirmationDialog.cardIndex, true)}
            color="success"
            variant="contained"
          >
            Si
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Colors Dialog */}
      <Dialog
        open={resetColorsDialog.open}
        onClose={() => setResetColorsDialog({ open: false })}
      >
        <DialogTitle>Reset Colori</DialogTitle>
        <DialogContent>
          <Typography>
            Sei sicuro di voler resettare tutti i colori delle card allo stato originale?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetColorsDialog({ open: false })}>
            Annulla
          </Button>
          <Button 
            onClick={handleResetColors}
            color="primary"
            variant="contained"
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog
        open={passwordDialog.open}
        onClose={() => setPasswordDialog({ ...passwordDialog, open: false })}
      >
        <DialogTitle>Cambia Password</DialogTitle>
        <DialogContent>
          {passwordDialog.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {passwordDialog.error}
            </Alert>
          )}
          <TextField
            margin="dense"
            label="Password Attuale"
            type="password"
            fullWidth
            value={passwordDialog.currentPassword}
            onChange={(e) => setPasswordDialog(prev => ({ ...prev, currentPassword: e.target.value }))}
          />
          <TextField
            margin="dense"
            label="Nuova Password"
            type="password"
            fullWidth
            value={passwordDialog.newPassword}
            onChange={(e) => setPasswordDialog(prev => ({ ...prev, newPassword: e.target.value }))}
          />
          <TextField
            margin="dense"
            label="Conferma Nuova Password"
            type="password"
            fullWidth
            value={passwordDialog.confirmPassword}
            onChange={(e) => setPasswordDialog(prev => ({ ...prev, confirmPassword: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordDialog({ ...passwordDialog, open: false })}>
            Annulla
          </Button>
          <Button onClick={handlePasswordChange} variant="contained">
            Cambia Password
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

export default App; 