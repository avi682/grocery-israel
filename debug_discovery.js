
import https from 'node:https';

async function testDiscovery() {
  console.log("Testing Shufersal discovery...");
  https.get("https://prices.shufersal.co.il/", (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log("HTML length received:", data.length);
      const regex = /href="(https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/PriceFull7290027600007-001-[^"]+\.gz[^"]+)"/;
      const match = data.match(regex);
      if (match) {
        console.log("SUCCESS: Found URL:", match[1]);
      } else {
        console.log("FAILURE: Regex did not match. Portions of HTML:");
        console.log(data.substring(0, 1000));
        if (data.includes("PriceFull")) {
          console.log("HTML contains 'PriceFull' but no matching href.");
        } else {
          console.log("HTML does not contain 'PriceFull'. Might be JS rendered.");
        }
      }
    });
  }).on('error', (e) => console.error("Error:", e.message));
}

testDiscovery();
