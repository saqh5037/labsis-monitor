// Cliente HTTP para el middle-agent en Windows
const http = require('http');
const https = require('https');

class MiddleAgentClient {
  constructor(baseUrl, authToken) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.isConnected = false;
    this.lastCheck = null;
  }

  async request(path, method = 'POST', body = null) {
    const url = new URL(path, this.baseUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method,
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    };

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          this.isConnected = true;
          this.lastCheck = new Date();
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });

      req.on('timeout', () => {
        this.isConnected = false;
        req.destroy();
        reject(new Error('Middle Agent no responde (timeout)'));
      });

      req.on('error', (err) => {
        this.isConnected = false;
        reject(new Error(`Middle Agent no disponible: ${err.message}`));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async healthCheck() {
    try {
      const url = new URL('/health', this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      return new Promise((resolve) => {
        const req = client.get(url.href, { timeout: 5000 }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            this.isConnected = true;
            this.lastCheck = new Date();
            try { resolve(JSON.parse(data)); } catch { resolve({ status: 'ok' }); }
          });
        });
        req.on('error', () => { this.isConnected = false; resolve(null); });
        req.on('timeout', () => { this.isConnected = false; req.destroy(); resolve(null); });
      });
    } catch {
      this.isConnected = false;
      return null;
    }
  }
}

module.exports = { MiddleAgentClient };
