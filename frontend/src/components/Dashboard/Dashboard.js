import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert
} from '@mui/material';
import { tractorApi } from '../../services/api';
import { useSocket } from '../../contexts/SocketContext';

const Dashboard = () => {
  const [tractors, setTractors] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { subscribeToDashboard } = useSocket();

  useEffect(() => {
    loadData();
    
    // Подписываемся на обновления dashboard
    const unsubscribe = subscribeToDashboard((data) => {
      console.log('Dashboard update received:', data);
      // Можно обновить данные в реальном времени
    });

    return unsubscribe;
  }, [subscribeToDashboard]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tractorsResponse, overviewResponse] = await Promise.all([
        tractorApi.getAll(),
        tractorApi.getOverview()
      ]);
      
      setTractors(tractorsResponse.data.tractors);
      setOverview(overviewResponse.data.overview);
    } catch (err) {
      setError('Ошибка загрузки данных dashboard');
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      {/* Общая статистика */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Всего тракторов
              </Typography>
              <Typography variant="h4">
                {overview?.total_tractors || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Активных
              </Typography>
              <Typography variant="h4" color="success.main">
                {overview?.active_tractors || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Неактивных
              </Typography>
              <Typography variant="h4" color="warning.main">
                {overview?.inactive_tractors || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Всего часов работы
              </Typography>
              <Typography variant="h4">
                {overview?.total_engine_hours?.toFixed(1) || '0.0'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Список тракторов */}
      <Typography variant="h5" gutterBottom>
        Ваши трактора
      </Typography>
      
      {tractors.length === 0 ? (
        <Alert severity="info">
          У вас пока нет зарегистрированных тракторов. 
          Добавьте трактор в разделе настройки.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {tractors.map((tractor) => {
            const isOnline = tractor.latest_telemetry && 
              new Date() - new Date(tractor.latest_telemetry.time) < 5 * 60 * 1000; // 5 минут
            
            return (
              <Grid item xs={12} md={6} lg={4} key={tractor.id}>
                <Card>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                      <Typography variant="h6" component="div">
                        {tractor.name}
                      </Typography>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: isOnline ? 'success.main' : 'grey.400'
                        }}
                      />
                    </Box>
                    
                    <Typography color="textSecondary" gutterBottom>
                      {tractor.model} ({tractor.year})
                    </Typography>
                    
                    {tractor.latest_telemetry ? (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2">
                          Скорость: {tractor.latest_telemetry.speed || 0} км/ч
                        </Typography>
                        <Typography variant="body2">
                          Топливо: {tractor.latest_telemetry.fuel_level || 0}%
                        </Typography>
                        <Typography variant="body2">
                          Обороты: {tractor.latest_telemetry.engine_rpm || 0} об/м
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Обновлено: {new Date(tractor.latest_telemetry.time).toLocaleString()}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                        Нет данных телеметрии
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default Dashboard;