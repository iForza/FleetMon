import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import Cookies from 'js-cookie';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user) {
      initializeSocket();
    } else {
      disconnectSocket();
    }

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, user]);

  const initializeSocket = () => {
    const token = Cookies.get('token');
    if (!token) return;

    const socketInstance = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000', {
      auth: {
        token: token
      },
      transports: ['websocket']
    });

    socketInstance.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnected(false);
    });

    setSocket(socketInstance);
  };

  const disconnectSocket = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
    }
  };

  const joinTractorRoom = (tractorId) => {
    if (socket && connected) {
      socket.emit('join_tractor', tractorId);
    }
  };

  const leaveTractorRoom = (tractorId) => {
    if (socket && connected) {
      socket.emit('leave_tractor', tractorId);
    }
  };

  const subscribeToTelemetry = (callback) => {
    if (socket) {
      socket.on('telemetry_update', callback);
      return () => socket.off('telemetry_update', callback);
    }
  };

  const subscribeToStatus = (callback) => {
    if (socket) {
      socket.on('status_update', callback);
      return () => socket.off('status_update', callback);
    }
  };

  const subscribeToDashboard = (callback) => {
    if (socket) {
      socket.on('dashboard_update', callback);
      return () => socket.off('dashboard_update', callback);
    }
  };

  const value = {
    socket,
    connected,
    joinTractorRoom,
    leaveTractorRoom,
    subscribeToTelemetry,
    subscribeToStatus,
    subscribeToDashboard
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};