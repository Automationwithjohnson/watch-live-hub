const https = require('https');

const payload = JSON.stringify({
  type: 'web_service',
  name: 'clickablecard',
  ownerId: 'tea-dann0eijnfac73961tm0',
  repo: 'https://github.com/Automationwithjohnson/CLICKABLECARD',
  branch: 'main',
  autoDeploy: 'yes',
  serviceDetails: {
    env: 'node',
    plan: 'free',
    region: 'frankfurt',
    envSpecificDetails: {
      buildCommand: 'npm install',
      startCommand: 'node server.js'
    },
    envVars: [
      { key: 'NODE_VERSION', value: '20' }
    ]
  }
});

const req = https.request({
  hostname: 'api.render.com',
  path: '/v1/services',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer rnd_wBpllZiGw63cd5I58SoOq2FHO4Dk',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('RESPONSE:', data);
  });
});

req.on('error', e => console.error('Error:', e));
req.write(payload);
req.end();
