module.exports = {
  apps: [{
    name: "labsis-monitor-chontalpa",
    script: "server.js",
    cwd: "/home/dynamtek/labsis-monitor",
    env: {
      LOCAL_SERVER: "qa1",
      SSH_KEY_PATH: "/home/dynamtek/.ssh/id_rsa",
      SSH_USER: "dynamtek",
      BIND_HOST: "0.0.0.0",
      PORT: "3090",
      PG_HOST: "10.216.144.3",
      PG_PORT: "5432",
      PG_DB: "labsis",
      PG_USER: "labsis",
      PG_PASSWORD: "labsis",
      PG_SSL: "false",
      SITE_NAME: "Chontalpa QA",
      CLIENT_INFO: JSON.stringify({
        name: "Laboratorio Chontalpa — QA",
        shortName: "Chontalpa QA",
        location: "Tabasco",
        usersCount: 250,
        samplesPerDay: 1200,
        labisVersion: "13.2",
        modules: ["Quimica", "Hematologia", "Inmunologia", "Microbiologia", "QC"]
      }),
      SITE_TOPOLOGY: JSON.stringify({
        loadBalancer: { label: "GCP Load Balancer" },
        database: { label: "Cloud SQL PostgreSQL", host: "10.216.144.3" }
      }),
      MONITOR_SERVERS: JSON.stringify({
        qa1: {
          host: "10.128.0.6",
          name: "QA1",
          ip: "34.59.253.153",
          diskGB: 10,
          memGB: 16,
          heapGB: 10,
          appPort: 8080,
          jbossPath: "/home/dynamtek/jboss-4.2.3.GA/bin/run.sh",
          labsisCSV: "/tmp/labsis-monitor-vm-labsisqa1.csv",
          rdsCSV: "/tmp/rds-metrics.csv",
          slowLog: "/tmp/rds-slow-queries.log",
          locksLog: "/tmp/rds-locks.log",
          idleTxLog: "/tmp/rds-idle-in-tx.log",
        },
        qa2: {
          host: "10.128.0.4",
          name: "QA2",
          ip: "34.172.222.164",
          diskGB: 10,
          memGB: 16,
          heapGB: 10,
          appPort: 8080,
          jbossPath: "/home/dynamtek/jboss-4.2.3.GA/bin/run.sh",
          labsisCSV: "/tmp/labsis-monitor-vm-labsisqa2.csv",
        }
      }),
      SERVER_NAME_MAP: JSON.stringify({
        "10.128.0.6": "QA1",
        "10.128.0.4": "QA2"
      }),
      PATH: "/home/dynamtek/.nvm/versions/node/v22.22.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    },
    max_memory_restart: "150M",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
