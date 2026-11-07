const config = require('./config');
const { openDb } = require('./db');
const { createApp } = require('./app');
const { ensureDemoAccount } = require('./demo');

const db = openDb();
ensureDemoAccount(db, config.demo);
const server = createApp(db).listen(config.port, () => {
  console.log(`BelajarKuy berjalan di http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
