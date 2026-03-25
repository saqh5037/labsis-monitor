const { NodeSSH } = require('node-ssh');
const fs = require('fs').promises;
const { parseLabsisCSV, parseRdsCSV, computeRdsDeltas, computeLabsisDeltas } = require('./parser');

const PEM_PATH = process.env.SSH_KEY_PATH || '/Users/samuelquiroz/Desktop/certificados/labsisLAPI.pem';
const SSH_USER = process.env.SSH_USER || 'dynamtek';
const LOCAL_MODE = process.env.LOCAL_SERVER || ''; // 'el18' si corre EN El 18, 'all' si todo es local

// Servidores configurables via env o defaults LAPI
const DEFAULT_SERVERS = {
  el18: {
    host: '18.224.139.66',
    name: 'El 18',
    labsisCSV: '/tmp/labsis-monitor-ip-172-32-2-250.csv',
  },
  el316: {
    host: '3.135.64.52',
    name: 'El 3',
    labsisCSV: '/tmp/labsis-monitor-ip-172-32-2-166.csv',
    rdsCSV: '/tmp/rds-metrics.csv',
    slowLog: '/tmp/rds-slow-queries.log',
    locksLog: '/tmp/rds-locks.log',
    idleTxLog: '/tmp/rds-idle-in-tx.log',
  },
};
const SERVERS = process.env.MONITOR_SERVERS
  ? JSON.parse(process.env.MONITOR_SERVERS)
  : DEFAULT_SERVERS;

class DataFetcher {
  constructor() {
    this.connections = {};
    this.store = {
      rds: [],
      logs: { slow: '', locks: '', idleTx: '' },
      lastUpdate: null,
      errors: {},
      serverInfo: {},
    };
    // Inicializar store para cada servidor configurado
    for (const id of Object.keys(SERVERS)) {
      this.store[id] = [];
    }
  }

  async connect(serverId) {
    const server = SERVERS[serverId];
    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host: server.host,
        username: SSH_USER,
        privateKeyPath: PEM_PATH,
        readyTimeout: 10000,
        keepaliveInterval: 30000,
      });
      this.connections[serverId] = ssh;
      this.store.errors[serverId] = null;
      console.log(`[SSH] Conectado a ${server.name} (${server.host})`);
      return true;
    } catch (err) {
      this.store.errors[serverId] = err.message;
      console.error(`[SSH] Error conectando a ${server.name}: ${err.message}`);
      return false;
    }
  }

  async ensureConnection(serverId) {
    const ssh = this.connections[serverId];
    if (ssh && ssh.isConnected()) return true;
    return this.connect(serverId);
  }

  async execCommand(serverId, command) {
    const connected = await this.ensureConnection(serverId);
    if (!connected) return null;
    try {
      const result = await this.connections[serverId].execCommand(command, { execOptions: { timeout: 15000 } });
      return result.stdout;
    } catch (err) {
      this.store.errors[serverId] = err.message;
      console.error(`[SSH] Error ejecutando comando en ${serverId}: ${err.message}`);
      // Invalidate connection
      this.connections[serverId] = null;
      return null;
    }
  }

  async readLocal(filePath, maxLines) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      if (lines.length <= 1) return null;
      const header = lines[0];
      const tail = lines.slice(Math.max(1, lines.length - maxLines));
      return header + '\n' + tail.join('\n');
    } catch (err) {
      console.error(`[Local] Error leyendo ${filePath}: ${err.message}`);
      return null;
    }
  }

  isLocal(serverId) {
    return LOCAL_MODE === 'all' || LOCAL_MODE === serverId;
  }

  async readCSV(serverId, csvPath, maxLines) {
    if (this.isLocal(serverId)) {
      return this.readLocal(csvPath, maxLines);
    }
    return this.execCommand(serverId, `head -1 ${csvPath} && tail -n ${maxLines} ${csvPath}`);
  }

  async readLog(serverId, logPath, maxLines) {
    if (this.isLocal(serverId)) {
      return this.readLocal(logPath, maxLines);
    }
    return this.execCommand(serverId, `tail -n ${maxLines} ${logPath} 2>/dev/null || echo ""`);
  }

  async fetchAll(full = false) {
    const maxLines = full ? 288 : 3; // 24h o últimas 3 líneas
    const tasks = [];

    // Fetch labsis CSV de ambos servidores
    for (const [id, server] of Object.entries(SERVERS)) {
      tasks.push(
        this.readCSV(id, server.labsisCSV, maxLines)
          .then(data => {
            if (data) {
              const raw = parseLabsisCSV(data);
              const rows = computeLabsisDeltas(raw);
              if (full) {
                this.store[id] = rows;
              } else {
                for (const row of rows) {
                  const exists = this.store[id].some(r => r.timestamp === row.timestamp);
                  if (!exists) this.store[id].push(row);
                }
                if (this.store[id].length > 300) {
                  this.store[id] = this.store[id].slice(-288);
                }
              }
            }
          })
      );
    }

    // Fetch RDS CSV — buscar el servidor que tiene rdsCSV configurado
    const rdsServer = Object.entries(SERVERS).find(([, s]) => s.rdsCSV);
    if (rdsServer) {
      const [rdsId, rdsConf] = rdsServer;
      tasks.push(
        this.readCSV(rdsId, rdsConf.rdsCSV, maxLines)
          .then(data => {
            if (data) {
              const raw = parseRdsCSV(data);
              const rows = computeRdsDeltas(raw);
              if (full) {
                this.store.rds = rows;
              } else {
                for (const row of rows) {
                  const exists = this.store.rds.some(r => r.timestamp === row.timestamp);
                  if (!exists) this.store.rds.push(row);
                }
                if (this.store.rds.length > 300) {
                  this.store.rds = this.store.rds.slice(-288);
                }
              }
            }
          })
      );

      // Fetch logs del mismo servidor que tiene RDS
      if (rdsConf.slowLog) {
        tasks.push(
          this.readLog(rdsId, rdsConf.slowLog, 60)
            .then(data => { if (data !== null) this.store.logs.slow = data; })
        );
      }
      if (rdsConf.locksLog) {
        tasks.push(
          this.readLog(rdsId, rdsConf.locksLog, 40)
            .then(data => { if (data !== null) this.store.logs.locks = data; })
        );
      }
      if (rdsConf.idleTxLog) {
        tasks.push(
          this.readLog(rdsId, rdsConf.idleTxLog, 40)
            .then(data => { if (data !== null) this.store.logs.idleTx = data; })
        );
      }
    }

    await Promise.allSettled(tasks);
    this.store.lastUpdate = new Date().toISOString();
    return this.store;
  }

  getData() {
    return this.store;
  }

  async disconnect() {
    for (const [id, ssh] of Object.entries(this.connections)) {
      if (ssh && ssh.isConnected()) {
        ssh.dispose();
        console.log(`[SSH] Desconectado de ${id}`);
      }
    }
  }

  async fetchServerInfo(serverId) {
    const commands = {
      os: 'cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'',
      kernel: 'uname -r',
      java: 'java -version 2>&1 | head -1',
      cpuModel: 'lscpu 2>/dev/null | grep "Model name" | sed "s/Model name:\\s*//"',
      cpuCores: 'nproc',
      uptime: 'uptime -p 2>/dev/null || uptime',
      services: 'systemctl list-units --type=service --state=running --no-legend 2>/dev/null | grep -E "jboss|wildfly|postgres|nginx|node|pm2|docker" | awk "{print \\$1}" || echo ""',
    };

    const info = {};

    if (this.isLocal(serverId)) {
      const { execSync } = require('child_process');
      for (const [key, cmd] of Object.entries(commands)) {
        try {
          info[key] = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
        } catch (e) {
          info[key] = 'N/A';
        }
      }
    } else {
      for (const [key, cmd] of Object.entries(commands)) {
        const result = await this.execCommand(serverId, cmd);
        info[key] = result ? result.trim() : 'N/A';
      }
    }

    this.store.serverInfo[serverId] = {
      ...info,
      lastFetched: new Date().toISOString(),
    };

    console.log(`[ServerInfo] ${serverId}: OS=${info.os}, Java=${info.java}, Cores=${info.cpuCores}`);
    return info;
  }

  async fetchAllServerInfo() {
    const tasks = Object.keys(SERVERS).map(id =>
      this.fetchServerInfo(id).catch(err => {
        console.error(`[ServerInfo] Error en ${id}: ${err.message}`);
        this.store.serverInfo[id] = { error: err.message, lastFetched: new Date().toISOString() };
      })
    );
    await Promise.allSettled(tasks);
    return this.store.serverInfo;
  }
}

module.exports = { DataFetcher };
