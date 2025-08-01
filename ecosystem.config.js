module.exports = {
  apps: [
    {
      name: 'fleetmon-backend',
      script: 'backend/src/server.js',
      cwd: '/opt/fleetmon',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_file: '.env.production',
      error_file: '/opt/fleetmon/logs/backend-error.log',
      out_file: '/opt/fleetmon/logs/backend-out.log',
      log_file: '/opt/fleetmon/logs/backend-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000
    },
    {
      name: 'fleetmon-frontend',
      script: 'serve',
      args: '-s frontend/build -l 3001',
      cwd: '/opt/fleetmon',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/opt/fleetmon/logs/frontend-error.log',
      out_file: '/opt/fleetmon/logs/frontend-out.log',
      log_file: '/opt/fleetmon/logs/frontend-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      restart_delay: 3000
    }
  ]
};