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
  DialogActions
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';

function Monitoring({ onBack, cells, user }) {
  const [resetDialog, setResetDialog] = useState({ open: false });

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleReset = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/reset-monitoring', {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Errore nel reset dei dati');
      
      setResetDialog({ open: false });
    } catch (error) {
      console.error('Error resetting monitoring data:', error);
    }
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
                    {card.startTime ? new Date(card.startTime).toLocaleTimeString() : '-'}
                  </TableCell>
                  <TableCell>
                    {card.endTime ? new Date(card.endTime).toLocaleTimeString() : '-'}
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

      {/* Reset Confirmation Dialog */}
      <Dialog
        open={resetDialog.open}
        onClose={() => setResetDialog({ open: false })}
      >
        <DialogTitle>Reset Monitoraggio</DialogTitle>
        <DialogContent>
          <Typography>
            Sei sicuro di voler resettare tutti i dati del monitoraggio? Questa azione non può essere annullata.
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
    </Container>
  );
}

export default Monitoring; 