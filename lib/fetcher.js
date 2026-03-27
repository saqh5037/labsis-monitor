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
        username: server.sshUser || SSH_USER,
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

  async fetchAppInventory(serverId) {
    const server = SERVERS[serverId];
    const commands = {
      jboss: "ps aux | grep '[j]boss\\|[r]un.sh.*jboss' | head -1",
      jbossEar: "ls /home/*/jboss-*/server/default/deploy/*.ear 2>/dev/null | head -1",
      jbossHeap: "ps aux | grep '[j]boss' | grep -o '\\-Xmx[^ ]*' | head -1",
      springboot: "ps aux | grep '[s]pring\\|[b]oot\\|[l]absis3.*jar' | head -1",
      kafka: "ps aux | grep '[k]afka' | head -1",
      nginx: "nginx -v 2>&1; systemctl is-active nginx 2>/dev/null || echo inactive",
      pm2: "pm2 jlist 2>/dev/null || echo 'not installed'",
      s3fs: "mount | grep s3fs || echo 'not mounted'",
      nfs: "exportfs 2>/dev/null | head -5 || echo 'not configured'",
      crontab: "crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$' || echo 'none'",
      ports: "ss -tlnp 2>/dev/null | grep LISTEN | awk '{print $4}' | sort -u",
    };

    const inventory = {};
    for (const [key, cmd] of Object.entries(commands)) {
      const result = await this.execCommand(serverId, cmd);
      inventory[key] = result ? result.trim() : null;
    }

    const apps = [];

    // JBoss detection
    if (inventory.jboss && inventory.jboss.length > 5) {
      const hasEar = inventory.jbossEar && inventory.jbossEar.includes('.ear');
      const pid = inventory.jboss.match(/\S+\s+(\d+)/)?.[1];
      apps.push({
        name: 'JBoss 4.2.3', type: 'jboss', port: 8080, pid,
        heap: inventory.jbossHeap || 'unknown',
        status: hasEar ? 'active' : 'anomaly',
        note: hasEar ? '' : 'Running WITHOUT EAR',
      });
    }

    // Spring Boot detection
    if (inventory.springboot && inventory.springboot.length > 5) {
      const pid = inventory.springboot.match(/\S+\s+(\d+)/)?.[1];
      apps.push({ name: 'labsis3 (Spring Boot)', type: 'springboot', port: 8081, pid, status: 'active' });
    }

    // Kafka detection
    if (inventory.kafka && inventory.kafka.length > 5) {
      const pid = inventory.kafka.match(/\S+\s+(\d+)/)?.[1];
      apps.push({ name: 'Kafka', type: 'kafka', port: 9092, pid, status: 'active' });
    }

    // Nginx detection
    if (inventory.nginx && !inventory.nginx.includes('inactive') && !inventory.nginx.includes('not found')) {
      const version = inventory.nginx.match(/nginx\/(\S+)/)?.[1] || '';
      apps.push({ name: `Nginx${version ? ' ' + version : ''}`, type: 'nginx', port: 80, status: 'active' });
    }

    // PM2 detection
    if (inventory.pm2 && inventory.pm2 !== 'not installed') {
      try {
        const procs = JSON.parse(inventory.pm2);
        if (Array.isArray(procs) && procs.length > 0) {
          procs.forEach(p => {
            apps.push({
              name: `PM2: ${p.name}`, type: 'pm2', port: p.pm2_env?.PORT || null,
              pid: p.pid, status: p.pm2_env?.status === 'online' ? 'active' : 'stopped',
            });
          });
        }
      } catch (e) { /* not JSON — older PM2 */ }
    }

    // s3fs detection
    if (inventory.s3fs && !inventory.s3fs.includes('not mounted')) {
      const mount = inventory.s3fs.match(/on\s+(\S+)/)?.[1] || '/mnt/s3-labsis';
      apps.push({ name: 's3fs', type: 'storage', mount, status: 'active' });
    }

    // NFS detection
    if (inventory.nfs && !inventory.nfs.includes('not configured') && inventory.nfs.trim().length > 0) {
      apps.push({ name: 'NFS Server', type: 'nfs', port: 2049, status: 'active' });
    }

    if (!this.store.appInventory) this.store.appInventory = {};
    this.store.appInventory[serverId] = {
      apps,
      crontab: inventory.crontab !== 'none' ? inventory.crontab : null,
      ports: inventory.ports,
      lastFetched: new Date().toISOString(),
    };

    console.log(`[AppInventory] ${serverId}: ${apps.length} app(s) detected`);
    return apps;
  }

  async fetchAllAppInventory() {
    const tasks = Object.keys(SERVERS).map(id =>
      this.fetchAppInventory(id).catch(err => {
        console.error(`[AppInventory] Error en ${id}: ${err.message}`);
        if (!this.store.appInventory) this.store.appInventory = {};
        this.store.appInventory[id] = { apps: [], error: err.message, lastFetched: new Date().toISOString() };
      })
    );
    await Promise.allSettled(tasks);
    return this.store.appInventory;
  }

  // DEPRECATED: TCP counting replaced by PostgreSQL queries (fetchActiveSessions/fetchActiveEquipment in pg-queries.js)
  // Kept as fallback — counts Nginx→JBoss TCP connections, NOT real users
  async fetchSessionInfoLegacy() {
    if (!this.store.sessions) this.store.sessions = {};

    let totalBrowser = 0;
    let totalEquipment = 0;

    for (const [id, server] of Object.entries(SERVERS)) {
      const role = server.role || 'production';
      if (role !== 'production') continue; // only count prod sessions

      try {
        // TCP connections to app port (browsers + equipment)
        const appPort = server.appPort || 8080;
        const tcpRaw = await this.execCommand(id,
          `ss -tn state established 2>/dev/null | grep ':${appPort}' | wc -l`);
        const tcpCount = parseInt(tcpRaw) || 0;

        // Unique IPs on app port
        const ipsRaw = await this.execCommand(id,
          `ss -tn state established 2>/dev/null | grep ':${appPort}' | awk '{print $5}' | rev | cut -d: -f2- | rev | sort -u | wc -l`);
        const uniqueIps = parseInt(ipsRaw) || 0;

        // Unique IPs from Nginx access log (last 10 min)
        const nginxIpsRaw = await this.execCommand(id,
          `awk -v d="$(date -d '10 minutes ago' '+%d/%b/%Y:%H:%M' 2>/dev/null || date -v-10M '+%d/%b/%Y:%H:%M' 2>/dev/null)" 'BEGIN{if(d=="")exit} $4 >= "["d' /var/log/nginx/access.log 2>/dev/null | awk '{print $1}' | sort -u | wc -l`);
        const nginxUniqueIps = parseInt(nginxIpsRaw) || 0;

        // Equipment connections (HL7/ASTM ports or specific patterns)
        const equipRaw = await this.execCommand(id,
          `ss -tn state established 2>/dev/null | grep -E ':(2575|11011|8082|4059)' | wc -l`);
        const equipCount = parseInt(equipRaw) || 0;

        // HTTPS connections
        const httpsRaw = await this.execCommand(id,
          `ss -tn state established 2>/dev/null | grep ':443' | wc -l`);
        const httpsCount = parseInt(httpsRaw) || 0;

        const serverSessions = {
          tcpAppPort: tcpCount,
          uniqueIps,
          nginxUniqueIps: nginxUniqueIps,
          httpsConns: httpsCount,
          equipmentConns: equipCount,
          browserEstimate: Math.max(uniqueIps, nginxUniqueIps),
        };

        this.store.sessions[id] = serverSessions;
        totalBrowser += serverSessions.browserEstimate;
        totalEquipment += equipCount;

      } catch (err) {
        console.error(`[Sessions] Error en ${id}: ${err.message}`);
      }
    }

    // Aggregate totals
    this.store.sessions._totals = {
      browsers: totalBrowser,
      equipment: totalEquipment,
      lastFetched: new Date().toISOString(),
    };

    console.log(`[Sessions] browsers:${totalBrowser} equipment:${totalEquipment}`);
    return this.store.sessions;
  }
}

module.exports = { DataFetcher };
