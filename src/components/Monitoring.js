import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Tabs,
  Tab
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';

const API_URL = 'https://web-production-b7884.up.railway.app';

function Monitoring({ onBack, cells, user }) {
  const [resetDialog, setResetDialog] = useState({ open: false });
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  const [monitoringLogs, setMonitoringLogs] = useState([]);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (user === 'admin') {
      fetchMonitoringLogs();
    }
  }, [user]);

  const fetchMonitoringLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/monitoring-logs`);
      if (!response.ok) {
        throw new Error('Errore nel recupero dei log');
      }
      const data = await response.json();
      setMonitoringLogs(data);
    } catch (error) {
      console.error('Error fetching monitoring logs:', error);
      showNotification('Errore nel recupero dei log', 'error');
    }
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleReset = async () => {
    try {
      const response = await fetch(`${API_URL}/api/reset-monitoring`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Errore nel reset dei dati');
      }
      
      setResetDialog({ open: false });
      showNotification('Log di monitoraggio resettati con successo', 'success');
      fetchMonitoringLogs(); // Ricarica i log dopo il reset
    } catch (error) {
      console.error('Error resetting monitoring data:', error);
      showNotification(error.message || 'Errore nel reset dei log di monitoraggio', 'error');
    }
  };

  const showNotification = (message, severity) => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={onBack}
          variant="outlined"
        >
          Indietro
        </Button>
        {user === 'admin' && (
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => setResetDialog({ open: true })}
            variant="contained"
            color="error"
          >
            Reset Monitoraggio
          </Button>
        )}
      </Box>

      <Typography variant="h5" component="h1" gutterBottom>
        Monitoraggio
      </Typography>

      {user === 'admin' && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Stato Attuale" />
            <Tab label="Log Storico" />
          </Tabs>
        </Box>
      )}

      {activeTab === 0 ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>N</TableCell>
                <TableCell>TR</TableCell>
                <TableCell>Note</TableCell>
                <TableCell>Stato</TableCell>
                <TableCell>Inizio</TableCell>
                <TableCell>Fine</TableCell>
                <TableCell>Tempo Totale</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cells
                .flatMap((cell, cellIndex) =>
                  cell.cards.map((card, cardIndex) => ({
                    ...card,
                    cellNumber: cell.id,
                    cardIndex: cardIndex + 1
                  }))
                )
                .filter(card => card.status === 'yellow' || card.status === 'green')
                .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
                .map((card, index) => (
                  <TableRow key={`${card.cellNumber}-${card.cardIndex}`}>
                    <TableCell>{card.ID || '-'}</TableCell>
                    <TableCell>{card.N || '-'}</TableCell>
                    <TableCell>{card.TR || '-'}</TableCell>
                    <TableCell>{card.Note || '-'}</TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          bgcolor: card.status === 'yellow' ? '#fff176' :
                                  card.status === 'red' ? '#ff8a80' :
                                  card.status === 'green' ? '#81c784' :
                                  '#e0e0e0'
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {card.startTime ? new Date(card.startTime).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell>
                      {card.endTime ? new Date(card.endTime).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell>
                      {card.startTime && (card.endTime || card.status === 'yellow') ? 
                        formatDuration(Math.round((new Date(card.endTime || new Date()) - new Date(card.startTime)) / 1000)) : 
                        '-'
                      }
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cella</TableCell>
                <TableCell>Card</TableCell>
                <TableCell>Evento</TableCell>
                <TableCell>Data e Ora</TableCell>
                <TableCell>ID</TableCell>
                <TableCell>N</TableCell>
                <TableCell>TR</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {monitoringLogs.map((log, index) => (
                <TableRow key={log.id}>
                  <TableCell>{log.cell_number}</TableCell>
                  <TableCell>{log.card_index}</TableCell>
                  <TableCell>
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        bgcolor: log.event_type === 'yellow' ? '#fff176' : '#81c784'
                      }}
                    />
                  </TableCell>
                  <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{log.card_data?.ID || '-'}</TableCell>
                  <TableCell>{log.card_data?.N || '-'}</TableCell>
                  <TableCell>{log.card_data?.TR || '-'}</TableCell>
                  <TableCell>{log.card_data?.Note || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Reset Confirmation Dialog */}
      <Dialog
        open={resetDialog.open}
        onClose={() => setResetDialog({ open: false })}
      >
        <DialogTitle>Reset Monitoraggio</DialogTitle>
        <DialogContent>
          <Typography>
            Sei sicuro di voler resettare tutti i log di monitoraggio? Questa azione non può essere annullata.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialog({ open: false })}>
            Annulla
          </Button>
          <Button 
            onClick={handleReset}
            color="error"
            variant="contained"
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
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

export default Monitoring; 