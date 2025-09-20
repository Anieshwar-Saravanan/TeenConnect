const { io } = require('socket.io-client');

const hosts = ['http://127.0.0.1:5001', 'http://localhost:5001'];

async function test(host) {
  return new Promise((resolve) => {
    console.log('\nTesting host:', host);
    const socket = io(host, {
      transports: ['websocket','polling'],
      reconnectionAttempts: 3,
      timeout: 5000,
    });

    socket.on('connect', () => {
      console.log('Connected to', host, 'id=', socket.id);
      socket.disconnect();
      resolve();
    });

    socket.on('connect_error', (err) => {
      console.log('connect_error for', host, err && err.message ? err.message : err);
      resolve();
    });

    socket.on('error', (err) => {
      console.log('error for', host, err);
      resolve();
    });

    setTimeout(() => {
      console.log('Timeout for', host);
      socket.close();
      resolve();
    }, 8000);
  });
}

(async function main(){
  for (const h of hosts) {
    await test(h);
  }
  console.log('\nDone');
})();
