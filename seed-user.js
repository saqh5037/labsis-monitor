#!/usr/bin/env node
// Crear usuario: node seed-user.js <username> <password> <role>
// Ejemplo: node seed-user.js admin miPassword123 admin

const { Storage } = require('./lib/storage');
const { Auth } = require('./lib/auth');

const [,, username, password, role = 'readonly'] = process.argv;

if (!username || !password) {
  console.log('Uso: node seed-user.js <username> <password> [admin|readonly]');
  console.log('Ejemplo: node seed-user.js samuel miClave123 admin');
  process.exit(1);
}

(async () => {
  const storage = new Storage();
  storage.init();
  const auth = new Auth(storage);

  try {
    const user = await auth.createUser(username, password, role);
    console.log(`Usuario creado: ${user.username} (${user.role})`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    storage.close();
  }
})();
