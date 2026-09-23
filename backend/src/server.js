const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const http = require('http');
const app = require('./app');

const DEFAULT_PORT = Number(process.env.PORT) || 5000;

function startServer(port) {
  const server = http.createServer(app);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const fallbackPort = port + 1;
      console.warn(`Port ${port} is already in use. Retrying on port ${fallbackPort}...`);
      startServer(fallbackPort);
      return;
    }

    console.error('Server failed to start:', error);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer(DEFAULT_PORT);