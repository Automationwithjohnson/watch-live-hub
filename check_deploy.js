const https = require('https');

function checkDeploy() {
  const options = {
    hostname: 'api.render.com',
    path: '/v1/services/srv-das6jfnpn0mc73f1pe2g/deploys/dep-das6jfvpn0mc73f1pf3g',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer rnd_wBpllZiGw63cd5I58SoOq2FHO4Dk',
      'Accept': 'application/json'
    }
  };

  https.get(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log('DEPLOY STATUS:', json.status, '| COMMIT:', json.commit?.id?.substring(0,7));
      } catch (e) {
        console.log('RAW:', data);
      }
    });
  });
}

checkDeploy();
