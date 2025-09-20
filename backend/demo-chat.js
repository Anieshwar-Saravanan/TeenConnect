const { io } = require('socket.io-client');

const SERVER = 'http://127.0.0.1:5001';
const ISSUE_ID = 1; // change to an existing issue id in your DB

function makeClient(name, role) {
  const socket = io(SERVER, { transports: ['websocket','polling'] });

  socket.on('connect', () => {
    console.log(`${name} connected (id=${socket.id})`);
    socket.emit('authenticate', { userId: name, role });
    socket.emit('join_issue', { issueId: ISSUE_ID });
  });

  socket.on('issue_messages', (msgs) => {
    console.log(`${name} received ${msgs.length} existing messages`);
  });

  socket.on('new_message', (msg) => {
    console.log(`${name} NEW_MESSAGE from ${msg.senderId}: ${msg.text}`);
  });

  socket.on('connect_error', (err) => {
    console.error(`${name} connect_error:`, err && err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log(`${name} disconnected:`, reason);
  });

  return socket;
}

(async function main(){
  const teen = makeClient('teen_sim', 'teen');
  const mentor = makeClient('mentor_sim', 'mentor');

  // after a short delay, send a message from teen then mentor
  setTimeout(() => {
    console.log('teen_sim sending a message...');
    teen.emit('send_message', { issueId: ISSUE_ID, senderId: 'teen_sim', senderRole: 'teen', text: 'Hi mentor, I need help.' });
  }, 2000);

  setTimeout(() => {
    console.log('mentor_sim sending a message...');
    mentor.emit('send_message', { issueId: ISSUE_ID, senderId: 'mentor_sim', senderRole: 'mentor', text: 'Hi! I can help. Tell me more.' });
  }, 5000);

  // close after some time
  setTimeout(() => {
    teen.close();
    mentor.close();
    console.log('Demo finished.');
  }, 12000);
})();
