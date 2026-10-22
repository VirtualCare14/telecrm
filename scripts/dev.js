const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function main() {
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';

  const port5000Available = await isPortAvailable(5000);
  let backend = null;

  if (port5000Available) {
    console.log('📡 Starting Backend (Express API on port 5000)...');
    backend = spawn(npmCmd, ['run', 'dev'], {
      cwd: path.resolve(__dirname, '../backend'),
      stdio: 'inherit',
      shell: true,
    });
  } else {
    console.log('✅ Backend API is already running on http://localhost:5000');
  }

  console.log('🎨 Starting Frontend (Vite on http://localhost:5173 / 5174)...');
  const frontend = spawn(npmCmd, ['run', 'dev'], {
    cwd: path.resolve(__dirname, '../frontend'),
    stdio: 'inherit',
    shell: true,
  });

  const cleanup = () => {
    if (backend) {
      try { backend.kill(); } catch (e) {}
    }
    if (frontend) {
      try { frontend.kill(); } catch (e) {}
    }
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(console.error);
