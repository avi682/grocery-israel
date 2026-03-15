// Test script for CHP scraper
// Note: This needs to be run in an environment with DOMParser or a polyfill.
// Since it's for Node.js debugging here, I'll use jsdom if available or just check the fetch.

// Test searching by name
async function testSearchByName(name) {
  const city = "פתח תקווה";
  // The search URL pattern found by browser subagent
  const targetUrl = `https://chp.co.il/${encodeURIComponent(city)}/0/0/${encodeURIComponent(name)}/0`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
  
  console.log(`Testing search for name: ${name}`);
  console.log(`URL: ${proxyUrl}`);
  
  try {
    const response = await fetch(proxyUrl);
    const htmlText = await response.text();
    
    const dom = new JSDOM(htmlText);
    const doc = dom.window.document;
    
    // Check if we are on a results page or a product page
    const rows = doc.querySelectorAll('#results-table tbody tr');
    console.log(`Found ${rows.length} rows`);
    
    if (rows.length > 0) {
      const prices = Array.from(rows).map(row => ({
        chain: row.cells[0]?.textContent?.trim(),
        price: row.cells[4]?.textContent?.trim()
      }));
      console.log("Found prices:", prices.slice(0, 3));
    } else {
      console.log("No prices found. Page content snippet:", htmlText.substring(0, 500));
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testSearchByName("חלב");
