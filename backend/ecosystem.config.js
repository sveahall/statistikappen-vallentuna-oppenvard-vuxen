module.exports = {
  apps: [
    {
      name: 'vallentuna-oppenvard-vuxen-backend',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
