/**
 * Utility to scrape price data from chp.co.il via a CORS proxy.
 */

const CORS_PROXY = "https://api.allorigins.win/raw?url=";

/**
 * Fetches and parses prices for a specific barcode from chp.co.il
 * @param {string} barcode The product barcode
 * @param {string} city The city name (default: "פתח תקווה")
 * @returns {Promise<Array>} List of price objects
 */
export async function fetchChpPrices(barcode, city = "פתח תקווה") {
  if (!barcode) return [];
  
  try {
    const targetUrl = `https://chp.co.il/${encodeURIComponent(city)}/0/0/מוצר/${barcode}`;
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(targetUrl)}`;
    
    console.log(`Fetching prices for ${barcode} in ${city}...`);
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from CHP: ${response.statusText}`);
    }
    
    const htmlText = await response.text();
    
    // Environment-agnostic HTML parsing
    let doc;
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      doc = parser.parseFromString(htmlText, 'text/html');
    } else {
      // Node.js environment fallback
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM(htmlText);
      doc = dom.window.document;
    }
    
    const rows = doc.querySelectorAll('#results-table tbody tr');
    
    if (!rows || rows.length === 0) {
      console.log(`No prices found for barcode ${barcode}`);
      return [];
    }
    
    const prices = Array.from(rows).map(row => {
      // Structure based on chp_scraping_summary.md:
      // Col 1: Name of the network (chain)
      // Col 2: Branch name
      // Col 5: Regular price
      // .btn-discount: contains discount info
      
      const chainName = row.cells[0]?.innerText?.trim() || "Unknown";
      const branchName = row.cells[1]?.innerText?.trim() || "Unknown";
      
      // Price is usually in the 5th column (index 4)
      let priceText = row.cells[4]?.innerText?.trim() || "0";
      // Remove currency symbol and parse
      let price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
      
      const discountBtn = row.querySelector('.btn-discount');
      let discountPrice = null;
      let dealDescription = null;
      
      if (discountBtn) {
        discountPrice = parseFloat(discountBtn.innerText.trim().replace(/[^\d.]/g, '')) || null;
        dealDescription = discountBtn.getAttribute('data-discount-desc') || null;
      }
      
      return {
        chain_id: chainName, // Using name as ID for now since we don't have mapping
        branch: branchName,
        price: discountPrice || price, // Prefer discount price if available
        originalPrice: price,
        deal: dealDescription,
        barcode: barcode
      };
    }).filter(p => p.price > 0); // Ignore stores where price is 0
    
    return prices;
  } catch (error) {
    console.error(`Scraping error for ${barcode}:`, error);
    return [];
  }
}

/**
 * Searches for product suggestions on chp.co.il
 * @param {string} term The search term
 * @returns {Promise<Array>} List of product suggestions with barcodes
 */
export async function searchChp(term) {
  if (!term || term.length < 2) return [];
  
  try {
    // Using the autocomplete API discovered by research
    const targetUrl = `https://chp.co.il/autocompletion/product_extended?term=${encodeURIComponent(term)}`;
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(targetUrl)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) return [];
    
    const data = await response.json();
    
    // The API returns an array of objects. We need to extract the barcode.
    // Based on research: id field is CHAINID_BARCODE or barcode is in parts.manufacturer_and_barcode
    return data.map(item => {
      let barcode = "";
      if (item.id && item.id.includes('_')) {
        barcode = item.id.split('_')[1];
      }
      
      let brandInfo = item.parts?.manufacturer_and_barcode || "";
      // Clean up brand info: "יצרן/מותג: תנובה, ברקוד: 123" -> "תנובה"
      let brand = brandInfo.split(',')[0].replace('יצרן/מותג:', '').trim();
      
      return {
        id: barcode || item.id,
        barcode: barcode || item.id,
        name: item.value || item.label,
        brand: brand,
        price: 0
      };
    }).filter(i => i.barcode);
  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
}
