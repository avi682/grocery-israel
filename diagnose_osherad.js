
import https from 'node:https';

async function diagnoseOsherAd() {
  console.log("Diagnosing Osher Ad Login Page...");
  const hostname = 'url.publishedprices.co.il';
  const options = {
    hostname,
    path: '/login',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    rejectUnauthorized: false
  };

  https.get(options, (res) => {
    console.log("Status Code:", res.statusCode);
    console.log("Headers:", JSON.stringify(res.headers, null, 2));
    
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
      console.log("HTML Start (500 chars):", html.substring(0, 500));
      const csrfMatch = html.match(/name="csrftoken" value="([^"]+)"/);
      console.log("CSRF Match:", csrfMatch ? csrfMatch[0] : "NOT FOUND");
      
      // Check if it's the 'Request Rejected' page
      if (html.includes("Request Rejected")) {
        console.error("DIAGNOSIS: Server is rejecting the request (WAF/Bot protection).");
      }
    });
  }).on('error', e => console.error("Error:", e.message));
}

diagnoseOsherAd();
