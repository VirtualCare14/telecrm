const http = require('http');
const loginData = JSON.stringify({ usernameOrEmail: 'admin@example.com', password: 'Admin123!' });
const loginOptions = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData),
  },
};

const loginReq = http.request(loginOptions, (loginRes) => {
  let body = '';
  loginRes.on('data', (chunk) => { body += chunk; });
  loginRes.on('end', () => {
    console.log('login status', loginRes.statusCode);
    console.log('login body', body);
    const cookies = loginRes.headers['set-cookie'];
    console.log('login cookies', cookies);
    if (loginRes.statusCode === 200 && cookies) {
      const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
      const dashOptions = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/dashboard/agent',
        method: 'GET',
        headers: {
          Cookie: cookieHeader,
        },
      };
      const dashReq = http.request(dashOptions, (dashRes) => {
        let body2 = '';
        dashRes.on('data', (chunk) => { body2 += chunk; });
        dashRes.on('end', () => {
          console.log('dashboard status', dashRes.statusCode);
          console.log('dashboard body', body2);
        });
      });
      dashReq.on('error', (err) => { console.error('dashboard request error', err); });
      dashReq.end();
    }
  });
});
loginReq.on('error', (err) => { console.error('login request error', err); });
loginReq.write(loginData);
loginReq.end();
