
import https from 'node:https';

async function testAjaxDiscovery() {
  console.log("Testing Shufersal AJAX discovery...");
  const options = {
    hostname: 'prices.shufersal.co.il',
    path: '/FileObject/UpdateCategory?catID=2&storeId=1',
    headers: { 'x-requested-with': 'XMLHttpRequest' }
  };
  
  https.get(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log("Response length:", data.length);
      const regex = /href="(https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/PriceFull[^"]+\.gz[^"]+)"/;
      const match = data.match(regex);
      if (match) {
        console.log("SUCCESS: Found URL:", match[1]);
      } else {
        console.log("FAILURE: Regex did not match AJAX response.");
        console.log("Start of response:", data.substring(0, 500));
      }
    });
  }).on('error', (e) => console.error("Error:", e.message));
}

testAjaxDiscovery();
