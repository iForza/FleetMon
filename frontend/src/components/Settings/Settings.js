import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Alert,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { tractorApi } from '../../services/api';

const Settings = () => {
  const [tabValue, setTabValue] = useState(0);
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    company: '',
    phone: ''
  });
  const [tractors, setTractors] = useState([]);
  const [newTractor, setNewTractor] = useState({
    device_id: '',
    name: '',
    model: '',
    year: '',
    registration_number: ''
  });
  const [openTractorDialog, setOpenTractorDialog] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const { user, updateProfile } = useAuth();

  useEffect(() => {
    if (user) {
      setProfileData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        company: user.company || '',
        phone: user.phone || ''
      });
    }
    loadTractors();
  }, [user]);

  const loadTractors = async () => {
    try {
      const response = await tractorApi.getAll();
      setTractors(response.data.tractors);
    } catch (error) {
      console.error('Error loading tractors:', error);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    setMessage({ type: '', text: '' });
  };

  const handleProfileChange = (e) => {
    setProfileData({
      ...profileData,
      [e.target.name]: e.target.value
    });
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const result = await updateProfile(profileData);
      if (result.success) {
        setMessage({ type: 'success', text: 'Профиль успешно обновлен' });
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Ошибка обновления профиля' });
    } finally {
      setLoading(false);
    }
  };

  const handleTractorChange = (e) => {
    setNewTractor({
      ...newTractor,
      [e.target.name]: e.target.value
    });
  };

  const handleAddTractor = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await tractorApi.create(newTractor);
      setMessage({ type: 'success', text: 'Трактор успешно добавлен' });
      setNewTractor({
        device_id: '',
        name: '',
        model: '',
        year: '',
        registration_number: ''
      });
      setOpenTractorDialog(false);
      loadTractors();
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Ошибка добавления трактора' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" gutterBottom>
        Настройки
      </Typography>

      {message.text && (
        <Alert severity={message.type} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="Профиль" />
            <Tab label="Трактора" />
          </Tabs>
        </Box>

        <CardContent>
          {tabValue === 0 && (
            <Box component="form" onSubmit={handleProfileSubmit}>
              <Typography variant="h6" gutterBottom>
                Информация о профиле
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Имя"
                    name="first_name"
                    value={profileData.first_name}
                    onChange={handleProfileChange}
                    disabled={loading}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Фамилия"
                    name="last_name"
                    value={profileData.last_name}
                    onChange={handleProfileChange}
                    disabled={loading}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Email"
                    value={user?.email || ''}
                    disabled
                    helperText="Email нельзя изменить"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Компания"
                    name="company"
                    value={profileData.company}
                    onChange={handleProfileChange}
                    disabled={loading}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Телефон"
                    name="phone"
                    value={profileData.phone}
                    onChange={handleProfileChange}
                    disabled={loading}
                  />
                </Grid>
              </Grid>

              <Button
                type="submit"
                variant="contained"
                sx={{ mt: 3 }}
                disabled={loading}
              >
                Сохранить изменения
              </Button>
            </Box>
          )}

          {tabValue === 1 && (
            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  Управление тракторами
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setOpenTractorDialog(true)}
                >
                  Добавить трактор
                </Button>
              </Box>

              {tractors.length === 0 ? (
                <Alert severity="info">
                  У вас пока нет зарегистрированных тракторов
                </Alert>
              ) : (
                <List>
                  {tractors.map((tractor) => (
                    <ListItem key={tractor.id} divider>
                      <ListItemText
                        primary={tractor.name}
                        secondary={`${tractor.model} (${tractor.year}) - Device ID: ${tractor.device_id}`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton edge="end">
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Диалог добавления трактора */}
      <Dialog 
        open={openTractorDialog} 
        onClose={() => setOpenTractorDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Добавить новый трактор</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Device ID"
                name="device_id"
                value={newTractor.device_id}
                onChange={handleTractorChange}
                required
                helperText="Уникальный идентификатор ESP32 устройства"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Название трактора"
                name="name"
                value={newTractor.name}
                onChange={handleTractorChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Модель"
                name="model"
                value={newTractor.model}
                onChange={handleTractorChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Год выпуска"
                name="year"
                type="number"
                value={newTractor.year}
                onChange={handleTractorChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Регистрационный номер"
                name="registration_number"
                value={newTractor.registration_number}
                onChange={handleTractorChange}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenTractorDialog(false)}>
            Отмена
          </Button>
          <Button onClick={handleAddTractor} variant="contained" disabled={loading}>
            Добавить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;