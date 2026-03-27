module.exports = {
  apps: [{
    name: "lapi-dashboard",
    script: "server.js",
    cwd: "/home/dynamtek/lapi-dashboard",
    env: {
      LOCAL_SERVER: "el18",
      SSH_KEY_PATH: "/home/dynamtek/.ssh/labsisLAPI.pem",
      BIND_HOST: "127.0.0.1",
      PORT: "3090",
      PG_PASSWORD: "labsis-lapi",
      SITE_NAME: "LAPI",
      CLIENT_INFO: JSON.stringify({
        name: "Laboratorio LAPI",
        shortName: "LAPI",
        location: "Ciudad de Mexico",
        usersCount: 120,
        samplesPerDay: 800,
        labisVersion: "13.2",
        modules: ["Quimica", "Hematologia", "Inmunologia", "QC"],
        sla: "99.5%",
        deployDate: "2024-06-15",
        contractType: "Soporte Premium"
      }),
      SITE_TOPOLOGY: JSON.stringify({
        entryPoints: [
          { label: "Usuarios LAPI", type: "users", desc: "PCs / Navegadores" },
          { label: "Equipos Analiticos", type: "equipment", protocol: "TCP/IP", desc: "Quimica, Hemato, Inmuno" }
        ],
        database: {
          label: "RDS PostgreSQL",
          env: "Produccion",
          host: "labsis-lapi-db-01.cmtbpifn3sci.us-east-2.rds.amazonaws.com",
          port: 5432,
          dbName: "labsis",
          datasources: [
            { name: "labsisDatasource", pool: "10-60" },
            { name: "labsisResultsDatasource", pool: "10-100" },
            { name: "jdbc/ContactsDS", pool: "10-100" }
          ],
          qaNote: "QA apunta a esta misma BD para datos reales"
        },
        storage: { label: "S3 + NFS", bucket: "labsis-lapi-bucket", nfs: "/mnt/s3-labsis" }
      }),
      MONITOR_SERVERS: JSON.stringify({
        el18: {
          host: "18.224.139.66",
          name: "El 18",
          ip: "18.224.139.66",
          diskGB: 49,
          memGB: 32,
          heapGB: 12,
          appPort: 8080,
          sshUser: "dynamtek",
          role: "production",
          labsisCSV: "/tmp/labsis-monitor-ip-172-32-2-250.csv",
          apps: [
            { name: "JBoss 4.2.3", type: "jboss", port: 8080, heap: "12G", status: "active" },
            { name: "Nginx 1.18", type: "nginx", port: 80, status: "active" },
            { name: "PM2 6.0", type: "pm2", port: 3090, status: "active" },
            { name: "s3fs", type: "storage", mount: "/mnt/s3-labsis", status: "active" },
            { name: "NFS Server", type: "nfs", port: 2049, status: "active" },
            { name: "lapi-dashboard", type: "node", port: 3090, status: "active" }
          ]
        },
        el316: {
          host: "3.135.64.52",
          name: "El 3",
          ip: "3.135.64.52",
          diskGB: 49,
          memGB: 64,
          heapGB: 24,
          appPort: 8080,
          sshUser: "dynamtek",
          role: "production",
          labsisCSV: "/tmp/labsis-monitor-ip-172-32-2-166.csv",
          rdsCSV: "/tmp/rds-metrics.csv",
          slowLog: "/tmp/rds-slow-queries.log",
          locksLog: "/tmp/rds-locks.log",
          idleTxLog: "/tmp/rds-idle-in-tx.log",
          backupPath: "/home/dynamtek/labsis-backup",
          apps: [
            { name: "JBoss 4.2.3", type: "jboss", port: 8080, heap: "24G", status: "active" },
            { name: "Nginx 1.18", type: "nginx", port: 80, status: "active" },
            { name: "s3fs", type: "storage", mount: "/mnt/s3-labsis", status: "active" },
            { name: "NFS Server", type: "nfs", port: 2049, status: "active" }
          ],
          crons: [
            { name: "autodescartarGradillas", schedule: "Cada 12 horas" },
            { name: "dashboard_validacion", schedule: "Cada 20 minutos" }
          ]
        },
        qa: {
          host: "18.224.25.245",
          name: "QA",
          ip: "18.224.25.245",
          diskGB: 16,
          memGB: 8,
          heapGB: 2,
          appPort: 8081,
          sshUser: "dynamtek",
          role: "qa",
          labsisCSV: "/tmp/labsis-monitor-qa.csv",
          apps: [
            { name: "labsis3 (Spring Boot)", type: "springboot", port: 8081, heap: "1G", java: "Corretto 24", status: "active" },
            { name: "Kafka 3.9.0", type: "kafka", port: 9092, heap: "1G", status: "active" },
            { name: "JBoss 4.2.3", type: "jboss", port: 8080, heap: "2G", status: "prepared" },
            { name: "Nginx", type: "nginx", port: 80, domain: "labsis3-qa.labsis.com", status: "active" },
            { name: "s3fs", type: "storage", mount: "/mnt/s3-labsis", status: "active" },
            { name: "NFS Server", type: "nfs", port: 2049, status: "active" }
          ],
          nginx: {
            domain: "labsis3-qa.labsis.com",
            ssl: true,
            routes: { "/api/*": "localhost:8081", "/graphql": "localhost:8081", "/actuator/*": "localhost:8081" }
          }
        },
        srv4: {
          host: "18.188.208.144",
          name: "4to Server",
          ip: "18.188.208.144",
          diskGB: 16,
          memGB: 4,
          heapGB: 2,
          appPort: 8080,
          sshUser: "ubuntu",
          role: "spare",
          labsisCSV: "/tmp/labsis-monitor-srv4.csv",
          apps: [
            { name: "JBoss 4.2.3", type: "jboss", port: 8080, heap: "2G", status: "anomaly", note: "Running WITHOUT EAR" },
            { name: "s3fs", type: "storage", mount: "/mnt/s3-labsis", status: "active" }
          ],
          anomalies: ["JBoss ejecutandose SIN EAR deployment"]
        }
      }),
      PATH: "/home/dynamtek/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    },
    max_memory_restart: "150M",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
