
import https from 'node:https';
import fs from 'node:fs';

async function diagnoseOsherAdFull() {
  console.log("Downloading full Osher Ad Login Page...");
  const hostname = 'url.publishedprices.co.il';
  const options = {
    hostname,
    path: '/login',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    rejectUnauthorized: false
  };

  https.get(options, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
      fs.writeFileSync('login.html', html);
      console.log("HTML saved to login.html. Length:", html.length);
      
      const tokens = html.match(/token/gi);
      console.log("Occurrences of 'token':", tokens ? tokens.length : 0);
      
      const hiddenInputs = html.match(/<input type="hidden"[^>]+>/g);
      console.log("Hidden inputs:", hiddenInputs);
    });
  }).on('error', e => console.error("Error:", e.message));
}

diagnoseOsherAdFull();
