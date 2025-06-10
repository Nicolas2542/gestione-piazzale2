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
    step: 1, // 1: first confirmation, 2: second confirmation
    message: ''
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
                cellIndex = num - 4;
              } else if (num >= 30 && num <= 33) {
                cellIndex = num - 20;  // Corretto per le buche 30-33
              }
            } else if (cellNumber.startsWith('Preparazione')) {
              const num = parseInt(cellNumber.split(' ')[1]);
              cellIndex = num + 13;
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
          cellName = `Buca ${i + 20}`;  // Corretto per le buche 30-33
        } else {
          cellName = `Preparazione ${i - 13}`;
        }

        const cellData = {
          cell_number: cellName,
          cards: newCells[i].cards.map(card => ({
            ...card,  // Mantiene tutti i dati esistenti
            status: 'default',  // Resetta solo lo stato
            startTime: null,    // Resetta i timestamp
            endTime: null
          }))
        };

        console.log('Salvataggio cella dopo reset:', cellName, cellData);

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
            cellIndex = num - 20;  // Corretto per le buche 30-33
          }
        } else if (cellNumber.startsWith('Preparazione')) {
          const num = parseInt(cellNumber.split(' ')[1]);
          cellIndex = num + 13;
        }

        if (cellIndex !== undefined && cellIndex >= 0 && cellIndex < updatedCells.length) {
          console.log(`Mapping finale ${cellNumber} to index ${cellIndex}`);
          updatedCells[cellIndex].cards = item.cards.map(card => ({
            ...card,  // Mantiene tutti i dati esistenti
            status: 'default',  // Resetta solo lo stato
            startTime: null,    // Resetta i timestamp
            endTime: null
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
      const cellNumber = cells[cellIndex].id;
      const currentTime = new Date().toISOString();
      
      // Aggiorna lo stato locale
      const newCells = [...cells];
      let newStatus;
      let message;

      if (!newCells[cellIndex].cards[cardIndex].status || newCells[cellIndex].cards[cardIndex].status === 'default') {
        // Prima interazione
        newStatus = status ? 'arrivato' : 'ritardo';
        message = status ? "E' arrivato in buca" : "In ritardo";
      } else {
        // Seconda interazione
        newStatus = status ? 'completato' : 'ritardo';
        message = status ? "Carico Completato" : "In ritardo";
      }
      
      newCells[cellIndex].cards[cardIndex] = {
        ...newCells[cellIndex].cards[cardIndex],
        status: newStatus,
        message: message,
        startTime: newStatus === 'arrivato' ? currentTime : newCells[cellIndex].cards[cardIndex].startTime,
        endTime: newStatus === 'completato' ? currentTime : null
      };

      setCells(newCells);

      // Registra l'evento nel log di monitoraggio
      try {
        const logResponse = await fetch(`${API_URL}/api/monitoring-logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            cellNumber,
            cardIndex: cardIndex + 1,
            eventType: newStatus,
            cardData: newCells[cellIndex].cards[cardIndex]
          }),
        });

        if (!logResponse.ok) {
          throw new Error('Errore nella registrazione dell\'evento');
        }
      } catch (error) {
        console.error('Error logging monitoring event:', error);
      }

      // Salva le modifiche nel database
      const response = await fetch(`${API_URL}/api/preposto-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          cellNumber,
          cardIndex,
          status: newStatus,
          message: message,
          startTime: newCells[cellIndex].cards[cardIndex].startTime,
          endTime: newCells[cellIndex].cards[cardIndex].endTime
        }),
      });

      if (!response.ok) {
        throw new Error('Errore nel salvataggio delle modifiche');
      }

      const result = await response.json();
      showNotification(result.message, 'success');
      
      // Ricarica i dati dopo il salvataggio
      await fetchData();
    } catch (error) {
      console.error('Error saving preposto changes:', error);
      showNotification(error.message, 'error');
    }
  };

  const fetchData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/cells`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Errore nel recupero dei dati');
      }
      
      const data = await response.json();
      
      // Mappa i dati ricevuti alle celle
      const mappedCells = data.map(cell => {
        const cellIndex = cells.findIndex(c => c.id === cell.cell_number);
        if (cellIndex === -1) return null;
        
        return {
          ...cells[cellIndex],
          cards: cell.cards
        };
      }).filter(Boolean);

      setCells(mappedCells);
    } catch (error) {
      console.error('Error fetching data:', error);
      showNotification('Errore nel recupero dei dati', 'error');
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

      <Grid container spacing={1}>
        {/* Buche da 4 a 13 */}
        <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Buca 4 - Buca 13</Typography>
        <Grid container spacing={2} direction="row" wrap="nowrap" sx={{ overflowX: 'auto' }}>
          {cells.filter(cell => {
            const match = cell.id.match(/^Buca (\d+)$/);
            if (!match) return false;
            const num = parseInt(match[1]);
            return num >= 4 && num <= 13;
          }).map((cell, cellIndex) => (
            <Grid item key={cell.id} sx={{ minWidth: 170 }}>
              <Card sx={{ maxWidth: 160, mx: 'auto' }}>
                <CardContent sx={{ p: 1 }}>
                  <Typography variant="subtitle2" gutterBottom align="center">
                    {cell.id}
                  </Typography>
                  <Box display="flex" flexDirection="column" gap={1}>
                    {cell.cards.map((card, cardIndex) => (
                      <Box key={cardIndex} sx={{
                        p: 0.5,
                        border: '1px solid #ddd',
                        borderRadius: 1,
                        mb: 0.5,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                        maxWidth: '140px',
                        mx: 'auto'
                      }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                            Card {cardIndex + 1}
                          </Typography>
                          {user === 'preposto' && (
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => setConfirmationDialog({
                                open: true,
                                cellIndex: cells.findIndex(c => c.id === cell.id),
                                cardIndex,
                                step: card.status === 'arrivato' ? 2 : 1,
                                message: card.status === 'arrivato' ?
                                  "Hanno controllato la merce e inviato la distinta?" :
                                  "E' arrivato in buca?"
                              })}
                              sx={{
                                minWidth: '30px',
                                height: '20px',
                                fontSize: '0.7rem',
                                py: 0
                              }}
                            >
                              OK
                            </Button>
                          )}
                        </Box>
                        {card.message && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: card.status === 'ritardo' ? 'error.main' : 'success.main',
                              fontWeight: 'bold',
                              fontSize: '0.7rem'
                            }}
                          >
                            {card.message}
                          </Typography>
                        )}
                        <Box sx={{ mt: 0.5 }}>
                          <TextField
                            size="small"
                            label="TR"
                            value={card.TR}
                            onChange={(e) => handleCellChange(cells.findIndex(c => c.id === cell.id), 'TR', e.target.value, cardIndex)}
                            fullWidth
                            sx={{ mb: 0.5 }}
                            InputProps={{
                              sx: { fontSize: '0.7rem', height: '28px' }
                            }}
                            InputLabelProps={{
                              sx: { fontSize: '0.7rem' }
                            }}
                          />
                          <TextField
                            size="small"
                            label="ID"
                            value={card.ID}
                            onChange={(e) => handleCellChange(cells.findIndex(c => c.id === cell.id), 'ID', e.target.value, cardIndex)}
                            fullWidth
                            sx={{ mb: 0.5 }}
                            InputProps={{
                              sx: { fontSize: '0.7rem', height: '28px' }
                            }}
                            InputLabelProps={{
                              sx: { fontSize: '0.7rem' }
                            }}
                          />
                          <TextField
                            size="small"
                            label="N"
                            value={card.N}
                            onChange={(e) => handleCellChange(cells.findIndex(c => c.id === cell.id), 'N', e.target.value, cardIndex)}
                            fullWidth
                            sx={{ mb: 0.5 }}
                            InputProps={{
                              sx: { fontSize: '0.7rem', height: '28px' }
                            }}
                            InputLabelProps={{
                              sx: { fontSize: '0.7rem' }
                            }}
                          />
                          <TextField
                            size="small"
                            label="Note"
                            value={card.Note}
                            onChange={(e) => handleCellChange(cells.findIndex(c => c.id === cell.id), 'Note', e.target.value, cardIndex)}
                            fullWidth
                            InputProps={{
                              sx: { fontSize: '0.7rem', height: '28px' }
                            }}
                            InputLabelProps={{
                              sx: { fontSize: '0.7rem' }
                            }}
                          />
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Buche da 30 a Preparazione 2 */}
        <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Buca 30 - Preparazione 2</Typography>
        <Grid container spacing={2} direction="row" wrap="nowrap" sx={{ overflowX: 'auto' }}>
          {cells.filter(cell => {
            if (/^Buca (3[0-2])$/.test(cell.id)) return true;
            if (/^Preparazione ([1-2])$/.test(cell.id)) return true;
            return false;
          }).map((cell, cellIndex) => (
            <Grid item key={cell.id} sx={{ minWidth: 170 }}>
              <Card sx={{ maxWidth: 160, mx: 'auto' }}>
                <CardContent sx={{ p: 1 }}>
                  <Typography variant="subtitle2" gutterBottom align="center">
                    {cell.id}
                  </Typography>
                  <Box display="flex" flexDirection="column" gap={1}>
                    {cell.cards.map((card, cardIndex) => (
                      <Box key={cardIndex} sx={{
                        p: 0.5,
                        border: '1px solid #ddd',
                        borderRadius: 1,
                        mb: 0.5,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5,
                        maxWidth: '140px',
                        mx: 'auto'
                      }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                            Card {cardIndex + 1}
                          </Typography>
                          {user === 'preposto' && (
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => setConfirmationDialog({
                                open: true,
                                cellIndex: cells.findIndex(c => c.id === cell.id),
                                cardIndex,
                                step: card.status === 'arrivato' ? 2 : 1,
                                message: card.status === 'arrivato' ?
                                  "Hanno controllato la merce e inviato la distinta?" :
                                  "E' arrivato in buca?"
                              })}
                              sx={{
                                minWidth: '30px',
                                height: '20px',
                                fontSize: '0.7rem',
                                py: 0
                              }}
                            >
                              OK
                            </Button>
                          )}
                        </Box>
                        {card.message && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: card.status === 'ritardo' ? 'error.main' : 'success.main',
                              fontWeight: 'bold',
                              fontSize: '0.7rem'
                            }}
                          >
                            {card.message}
                          </Typography>
                        )}
                        <Box sx={{ mt: 0.5 }}>
                          <TextField
                            size="small"
                            label="TR"
                            value={card.TR}
                            onChange={(e) => handleCellChange(cells.findIndex(c => c.id === cell.id), 'TR', e.target.value, cardIndex)}
                            fullWidth
                            sx={{ mb: 0.5 }}
                            InputProps={{
                              sx: { fontSize: '0.7rem', height: '28px' }
                            }}
                            InputLabelProps={{
                              sx: { fontSize: '0.7rem' }
                            }}
                          />
                          <TextField
                            size="small"
                            label="ID"
                            value={card.ID}
                            onChange={(e) => handleCellChange(cells.findIndex(c => c.id === cell.id), 'ID', e.target.value, cardIndex)}
                            fullWidth
                            sx={{ mb: 0.5 }}
                            InputProps={{
                              sx: { fontSize: '0.7rem', height: '28px' }
                            }}
                            InputLabelProps={{
                              sx: { fontSize: '0.7rem' }
                            }}
                          />
                          <TextField
                            size="small"
                            label="N"
                            value={card.N}
                            onChange={(e) => handleCellChange(cells.findIndex(c => c.id === cell.id), 'N', e.target.value, cardIndex)}
                            fullWidth
                            sx={{ mb: 0.5 }}
                            InputProps={{
                              sx: { fontSize: '0.7rem', height: '28px' }
                            }}
                            InputLabelProps={{
                              sx: { fontSize: '0.7rem' }
                            }}
                          />
                          <TextField
                            size="small"
                            label="Note"
                            value={card.Note}
                            onChange={(e) => handleCellChange(cells.findIndex(c => c.id === cell.id), 'Note', e.target.value, cardIndex)}
                            fullWidth
                            InputProps={{
                              sx: { fontSize: '0.7rem', height: '28px' }
                            }}
                            InputLabelProps={{
                              sx: { fontSize: '0.7rem' }
                            }}
                          />
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Grid>

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