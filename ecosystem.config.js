// PM2 process config for MKT Agent
// Usage:
//   pm2 start ecosystem.config.js          — start
//   pm2 restart mkt-agent                  — restart
//   pm2 reload mkt-agent                   — zero-downtime reload
//   pm2 stop mkt-agent                     — stop
//   pm2 logs mkt-agent                     — tail logs
//   pm2 save && pm2 startup                — persist across reboots

module.exports = {
  apps: [
    {
      name: "mkt-agent",

      // Run `next start` via the locally installed binary
      script: "node_modules/.bin/next",
      args: "start -p 3000",

      // Absolute path to the app directory on the server
      cwd: "/opt/mkt-agent",

      // Single instance — scale to cluster mode later if needed
      instances: 1,
      exec_mode: "fork",

      autorestart: true,
      watch: false,

      // Restart if memory exceeds 512 MB
      max_memory_restart: "512M",

      // Environment is loaded from .env in the cwd by Next.js automatically.
      // Only set overrides here that are not in the .env file.
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },

      // Log file locations
      out_file: "/var/log/mkt-agent/out.log",
      error_file: "/var/log/mkt-agent/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
