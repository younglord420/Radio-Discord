module.exports = {
  apps: [
    {
      name: "discord-radio",
      cwd: "/root/discord",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        LOG_PRETTY: "0",
      },
      time: true,
    },
  ],
};
