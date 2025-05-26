import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert
} from '@mui/material';

const API_URL = 'https://web-production-b7884.up.railway.app';

function Login({ onLogin }) {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [activeSessions, setActiveSessions] = useState({ admin: 0, preposto: 0 });

  useEffect(() => {
    // Controlla se c'è una sessione salvata
    const savedSession = localStorage.getItem('session');
    if (savedSession) {
      const { role, sessionId } = JSON.parse(savedSession);
      onLogin(role, sessionId);
    }

    // Controlla le sessioni attive ogni 5 secondi
    const checkSessions = async () => {
      try {
        const response = await fetch(`${API_URL}/api/active-sessions`);
        if (response.ok) {
          const data = await response.json();
          setActiveSessions(data);
        }
      } catch (error) {
        console.error('Error checking active sessions:', error);
      }
    };

    const interval = setInterval(checkSessions, 5000);
    checkSessions(); // Controlla immediatamente

    return () => clearInterval(interval);
  }, [onLogin]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        throw new Error('Credenziali non valide');
      }

      const data = await response.json();
      // Salva la sessione nel localStorage
      localStorage.setItem('session', JSON.stringify(data));
      onLogin(data.role, data.sessionId);
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
            Gestione Piazzale - Login
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          {activeSessions.preposto > 0 && (
            <Alert severity="info" sx={{ width: '100%', mb: 2 }}>
              Ci sono {activeSessions.preposto} preposti attualmente connessi
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={credentials.username}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={credentials.password}
              onChange={handleChange}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Accedi
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

export default Login; 