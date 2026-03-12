
import https from 'node:https';

async function testOsherAdLogin() {
  console.log("Testing Osher Ad Login with password field...");
  
  // Try adding password field even if empty
  const loginData = 'user=Osherad&password=';
  const loginOptions = {
    hostname: 'url.publishedprices.co.il',
    path: '/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': loginData.length,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Origin': 'https://url.publishedprices.co.il',
      'Referer': 'https://url.publishedprices.co.il/login'
    },
    rejectUnauthorized: false
  };

  const loginReq = https.request(loginOptions, (res) => {
    console.log("Login Status:", res.statusCode);
    const cookies = res.headers['set-cookie'];
    console.log("Login Cookies:", cookies);
    
    let loginBody = '';
    res.on('data', chunk => loginBody += chunk);
    res.on('end', () => {
      // Find session cookie
      const sessionCookie = cookies ? cookies.find(c => c.startsWith('cftpSID='))?.split(';')[0] : null;

      if (!sessionCookie) {
        console.error("FAILURE: No cftpSID cookie found.");
        return;
      }
      console.log("SUCCESS: Found session cookie:", sessionCookie);

      // Fetch file list
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
        let body = '';
        listRes.on('data', chunk => body += chunk);
        listRes.on('end', () => {
          if (body.trim().startsWith('<')) {
            console.error("FAILURE: Received HTML instead of JSON. Body start:", body.substring(0, 200));
          } else {
            console.log("SUCCESS: Received likely JSON. Body start:", body.substring(0, 200));
          }
        });
      });
      listReq.write(listData);
      listReq.end();
    });
  });

  loginReq.write(loginData);
  loginReq.end();
}

testOsherAdLogin();
