module.exports = {
  apps: [
    {
      name: "galoz-iot",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "server.ts",
      interpreter: "node",
      cwd: "C:\\Users\\User\\Desktop\\Galoz_Iot_12042026",
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
