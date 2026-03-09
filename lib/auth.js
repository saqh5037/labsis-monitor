// Autenticación con HMAC tokens y bcryptjs

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 horas

class Auth {
  constructor(storage) {
    this.storage = storage;
  }

  async createUser(username, password, role = 'readonly') {
    if (!username || !password) throw new Error('Username y password son requeridos');
    if (!['admin', 'readonly'].includes(role)) throw new Error('Rol debe ser admin o readonly');
    if (password.length < 6) throw new Error('Password debe tener al menos 6 caracteres');

    const existing = this.storage.getUser(username);
    if (existing) throw new Error(`Usuario "${username}" ya existe`);

    const hash = await bcrypt.hash(password, 10);
    this.storage.insertUser(username, hash, role);
    console.log(`[Auth] Usuario "${username}" creado con rol "${role}"`);
    return { username, role };
  }

  async validateLogin(username, password) {
    const user = this.storage.getUser(username);
    if (!user) return null;

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;

    this.storage.updateLastLogin(username);
    const token = this._generateToken({ username: user.username, role: user.role });
    return { token, user: { username: user.username, role: user.role } };
  }

  _generateToken(payload) {
    const data = {
      ...payload,
      exp: Date.now() + TOKEN_EXPIRY_MS,
      iat: Date.now(),
    };
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [encoded, signature] = parts;
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(encoded)
      .digest('base64url');

    if (signature !== expected) return null;

    try {
      const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
      if (data.exp < Date.now()) return null;
      return { username: data.username, role: data.role };
    } catch {
      return null;
    }
  }

  async seedAdmin() {
    const users = this.storage.listUsers();
    if (users.length === 0) {
      await this.createUser('admin', 'admin123', 'admin');
      console.log('[Auth] Usuario admin creado por defecto (admin/admin123)');
    }
  }

  async changePassword(username, newPassword) {
    if (!newPassword || newPassword.length < 6) throw new Error('Password debe tener al menos 6 caracteres');
    const hash = await bcrypt.hash(newPassword, 10);
    this.storage.updatePassword(username, hash);
  }

  listUsers() {
    return this.storage.listUsers();
  }
}

module.exports = { Auth };
