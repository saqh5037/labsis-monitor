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
      PATH: "/home/dynamtek/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    },
    max_memory_restart: "150M",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
