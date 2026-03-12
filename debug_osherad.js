
import https from 'node:https';

async function testOsherAdLogin() {
  console.log("Testing Osher Ad Login...");
  
  const loginData = 'user=Osherad';
  const loginOptions = {
    hostname: 'url.publishedprices.co.il',
    path: '/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': loginData.length,
      'User-Agent': 'Mozilla/5.0'
    },
    rejectUnauthorized: false
  };

  const loginReq = https.request(loginOptions, (res) => {
    console.log("Login Status:", res.statusCode);
    console.log("Login Headers:", JSON.stringify(res.headers, null, 2));
    
    let loginBody = '';
    res.on('data', chunk => loginBody += chunk);
    res.on('end', () => {
      console.log("Login Body Start:", loginBody.substring(0, 500));
      
      const cookies = res.headers['set-cookie'];
      const sessionCookie = cookies ? cookies.find(c => c.startsWith('cftpSID='))?.split(';')[0] : null;

      if (!sessionCookie) {
        console.error("FAILURE: No cftpSID cookie found.");
        return;
      }
      console.log("SUCCESS: Found session cookie:", sessionCookie);

      // 2. Fetch file list
      console.log("Fetching file list...");
      const listData = 'path=.&sub=false';
      const listOptions = {
        hostname: 'url.publishedprices.co.il',
        path: '/file/json/dir',
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': listData.length,
          'User-Agent': 'Mozilla/5.0'
        },
        rejectUnauthorized: false
      };

      const listReq = https.request(listOptions, (listRes) => {
        console.log("List Status:", listRes.statusCode);
        let body = '';
        listRes.on('data', chunk => body += chunk);
        listRes.on('end', () => {
          console.log("List Body Start:", body.substring(0, 500));
          try {
            const files = JSON.parse(body);
            console.log("SUCCESS: Parsed JSON. File count:", files.length);
          } catch (e) {
            console.error("FAILURE: Could not parse JSON. Error:", e.message);
          }
        });
      });
      listReq.write(listData);
      listReq.end();
    });
  });

  loginReq.on('error', e => console.error("Login Error:", e.message));
  loginReq.write(loginData);
  loginReq.end();
}

testOsherAdLogin();
