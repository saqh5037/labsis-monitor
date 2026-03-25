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
        loadBalancer: { label: "Nginx / ALB", host: "labsis.lapi.gob.mx" },
        database: { label: "RDS PostgreSQL", host: "rds.us-east-2.amazonaws.com" },
        storage: { label: "S3 Backups", bucket: "labsis-backup-lapi" }
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
          labsisCSV: "/tmp/labsis-monitor-ip-172-32-2-250.csv"
        },
        el316: {
          host: "3.135.64.52",
          name: "El 3",
          ip: "3.135.64.52",
          diskGB: 49,
          memGB: 64,
          heapGB: 24,
          appPort: 8080,
          labsisCSV: "/tmp/labsis-monitor-ip-172-32-2-166.csv",
          rdsCSV: "/tmp/rds-metrics.csv",
          slowLog: "/tmp/rds-slow-queries.log",
          locksLog: "/tmp/rds-locks.log",
          idleTxLog: "/tmp/rds-idle-in-tx.log",
          backupPath: "/home/dynamtek/labsis-backup"
        }
      }),
      PATH: "/home/dynamtek/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    },
    max_memory_restart: "150M",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
