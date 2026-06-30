module.exports = {
  apps: [
    {
      name: "chat-backend",
      script: "./app.js",
      instances: 2,           // 2 threads as requested
      exec_mode: "cluster",   // Cluster mode balances load across CPUs
      max_memory_restart: "400M", // Strict memory limit for 1GB RAM machines (400M per instance)
      node_args: "--max-old-space-size=400", // V8 Engine heap limit
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
