import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker, Popup } from 'react-map-gl';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress
} from '@mui/material';
import { tractorApi } from '../../services/api';
import { useSocket } from '../../contexts/SocketContext';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';

const TractorMap = () => {
  const [tractors, setTractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTractor, setSelectedTractor] = useState(null);
  const [viewport, setViewport] = useState({
    latitude: 55.7558,
    longitude: 37.6176,
    zoom: 10
  });
  const mapRef = useRef();
  const { subscribeToTelemetry } = useSocket();

  useEffect(() => {
    loadTractors();
    
    // Подписываемся на обновления телеметрии
    const unsubscribe = subscribeToTelemetry((data) => {
      updateTractorLocation(data);
    });

    return unsubscribe;
  }, [subscribeToTelemetry]);

  const loadTractors = async () => {
    try {
      setLoading(true);
      const response = await tractorApi.getAll();
      const tractorsWithLocation = response.data.tractors.filter(
        tractor => tractor.latest_telemetry?.latitude && tractor.latest_telemetry?.longitude
      );
      
      setTractors(tractorsWithLocation);
      
      // Центрируем карту по первому трактору
      if (tractorsWithLocation.length > 0) {
        const firstTractor = tractorsWithLocation[0];
        setViewport(prev => ({
          ...prev,
          latitude: firstTractor.latest_telemetry.latitude,
          longitude: firstTractor.latest_telemetry.longitude
        }));
      }
    } catch (err) {
      setError('Ошибка загрузки данных тракторов');
      console.error('Tractors load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateTractorLocation = (telemetryData) => {
    setTractors(prevTractors => 
      prevTractors.map(tractor => 
        tractor.id === telemetryData.tractorId
          ? {
              ...tractor,
              latest_telemetry: {
                ...tractor.latest_telemetry,
                ...telemetryData.location,
                ...telemetryData.metrics,
                time: telemetryData.timestamp
              }
            }
          : tractor
      )
    );
  };

  const getTractorIcon = (tractor) => {
    const isOnline = tractor.latest_telemetry && 
      new Date() - new Date(tractor.latest_telemetry.time) < 5 * 60 * 1000;
    
    return {
      color: isOnline ? '#4caf50' : '#757575',
      size: 30
    };
  };

  if (!MAPBOX_TOKEN) {
    return (
      <Alert severity="warning">
        Mapbox токен не настроен. Добавьте REACT_APP_MAPBOX_TOKEN в переменные окружения.
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ height: 'calc(100vh - 100px)', width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Карта тракторов
      </Typography>
      
      {tractors.length === 0 ? (
        <Alert severity="info">
          Нет тракторов с данными местоположения
        </Alert>
      ) : (
        <Map
          ref={mapRef}
          {...viewport}
          onMove={evt => setViewport(evt.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/satellite-streets-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {tractors.map((tractor) => {
            const icon = getTractorIcon(tractor);
            
            return (
              <Marker
                key={tractor.id}
                latitude={tractor.latest_telemetry.latitude}
                longitude={tractor.latest_telemetry.longitude}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedTractor(tractor);
                }}
              >
                <Box
                  sx={{
                    width: icon.size,
                    height: icon.size,
                    backgroundColor: icon.color,
                    borderRadius: '50%',
                    border: '2px solid white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    color: 'white',
                    fontWeight: 'bold'
                  }}
                >
                  🚜
                </Box>
              </Marker>
            );
          })}

          {selectedTractor && (
            <Popup
              latitude={selectedTractor.latest_telemetry.latitude}
              longitude={selectedTractor.latest_telemetry.longitude}
              onClose={() => setSelectedTractor(null)}
              closeButton={true}
              closeOnClick={false}
              offsetTop={-10}
            >
              <Card sx={{ minWidth: 250 }}>
                <CardContent>
                  <Typography variant="h6" component="div">
                    {selectedTractor.name}
                  </Typography>
                  <Typography color="textSecondary" gutterBottom>
                    {selectedTractor.model} ({selectedTractor.year})
                  </Typography>
                  
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      Скорость: {selectedTractor.latest_telemetry.speed || 0} км/ч
                    </Typography>
                    <Typography variant="body2">
                      Обороты: {selectedTractor.latest_telemetry.engine_rpm || 0} об/м
                    </Typography>
                    <Typography variant="body2">
                      Топливо: {selectedTractor.latest_telemetry.fuel_level || 0}%
                    </Typography>
                    <Typography variant="body2">
                      Температура: {selectedTractor.latest_telemetry.engine_temp || 0}°C
                    </Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                      Обновлено: {new Date(selectedTractor.latest_telemetry.time).toLocaleString()}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Popup>
          )}
        </Map>
      )}
    </Box>
  );
};

export default TractorMap;