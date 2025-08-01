import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Alert,
  CircularProgress,
  Tabs,
  Tab
} from '@mui/material';
import { tractorApi, telemetryApi } from '../../services/api';
import { useSocket } from '../../contexts/SocketContext';

const TractorDetail = () => {
  const { id } = useParams();
  const [tractor, setTractor] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const { joinTractorRoom, leaveTractorRoom, subscribeToTelemetry } = useSocket();

  useEffect(() => {
    if (id) {
      loadTractorData();
      joinTractorRoom(id);
      
      // Подписываемся на обновления телеметрии для этого трактора
      const unsubscribe = subscribeToTelemetry((data) => {
        if (data.tractorId === id) {
          updateTractorTelemetry(data);
        }
      });

      return () => {
        leaveTractorRoom(id);
        unsubscribe && unsubscribe();
      };
    }
  }, [id, joinTractorRoom, leaveTractorRoom, subscribeToTelemetry]);

  const loadTractorData = async () => {
    try {
      setLoading(true);
      
      const [tractorResponse, telemetryResponse] = await Promise.all([
        tractorApi.getById(id),
        telemetryApi.getQuickPeriod(id, '24hours')
      ]);
      
      setTractor(tractorResponse.data.tractor);
      setTelemetryHistory(telemetryResponse.data.data);
    } catch (err) {
      setError('Ошибка загрузки данных трактора');
      console.error('Tractor detail load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateTractorTelemetry = (telemetryData) => {
    setTractor(prevTractor => ({
      ...prevTractor,
      latest_telemetry: {
        ...prevTractor.latest_telemetry,
        ...telemetryData.location,
        ...telemetryData.metrics,
        time: telemetryData.timestamp
      }
    }));
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
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

  if (!tractor) {
    return <Alert severity="error">Трактор не найден</Alert>;
  }

  const isOnline = tractor.latest_telemetry && 
    new Date() - new Date(tractor.latest_telemetry.time) < 5 * 60 * 1000;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" gutterBottom>
        {tractor.name}
      </Typography>
      
      {/* Основная информация */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Информация о тракторе
              </Typography>
              <Typography variant="body1">
                <strong>Модель:</strong> {tractor.model || 'Не указана'}
              </Typography>
              <Typography variant="body1">
                <strong>Год:</strong> {tractor.year || 'Не указан'}
              </Typography>
              <Typography variant="body1">
                <strong>Регистрационный номер:</strong> {tractor.registration_number || 'Не указан'}
              </Typography>
              <Typography variant="body1">
                <strong>Device ID:</strong> {tractor.device_id}
              </Typography>
              <Box display="flex" alignItems="center" sx={{ mt: 2 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: isOnline ? 'success.main' : 'grey.400',
                    mr: 1
                  }}
                />
                <Typography variant="body2">
                  {isOnline ? 'Онлайн' : 'Оффлайн'}
                </Typography>
              </Box>
            </Grid>
            
            {tractor.latest_telemetry && (
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Текущие показатели
                </Typography>
                <Typography variant="body1">
                  <strong>Скорость:</strong> {tractor.latest_telemetry.speed || 0} км/ч
                </Typography>
                <Typography variant="body1">
                  <strong>Обороты двигателя:</strong> {tractor.latest_telemetry.engine_rpm || 0} об/м
                </Typography>
                <Typography variant="body1">
                  <strong>Уровень топлива:</strong> {tractor.latest_telemetry.fuel_level || 0}%
                </Typography>
                <Typography variant="body1">
                  <strong>Температура двигателя:</strong> {tractor.latest_telemetry.engine_temp || 0}°C
                </Typography>
                <Typography variant="body1">
                  <strong>Моточасы:</strong> {tractor.latest_telemetry.engine_hours || 0} ч
                </Typography>
                <Typography variant="body1">
                  <strong>Давление масла:</strong> {tractor.latest_telemetry.oil_pressure || 0} бар
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  Последнее обновление: {new Date(tractor.latest_telemetry.time).toLocaleString()}
                </Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Вкладки с дополнительной информацией */}
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="История телеметрии" />
            <Tab label="Статистика" />
            <Tab label="Маршруты" />
          </Tabs>
        </Box>
        
        <CardContent>
          {tabValue === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                История телеметрии (последние 24 часа)
              </Typography>
              {telemetryHistory.length === 0 ? (
                <Alert severity="info">Нет данных телеметрии за последние 24 часа</Alert>
              ) : (
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    Найдено записей: {telemetryHistory.length}
                  </Typography>
                  {/* Здесь можно добавить график или таблицу с историей */}
                </Box>
              )}
            </Box>
          )}
          
          {tabValue === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Статистика
              </Typography>
              <Alert severity="info">
                Статистика будет реализована в следующих версиях
              </Alert>
            </Box>
          )}
          
          {tabValue === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Маршруты
              </Typography>
              <Alert severity="info">
                Маршруты будут реализованы в следующих версиях
              </Alert>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default TractorDetail;