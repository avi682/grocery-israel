import Fuse from 'fuse.js';

/**
 * Perform a fuzzy search against a list of products.
 * @param {Array} products - Array of product objects from Firestore.
 * @param {string} query - The search string.
 * @returns {Array} - Filtered and ranked products.
 */
export const performFuzzySearch = (products, query) => {
  if (!query) return [];
  
  const options = {
    keys: ['name', 'category', 'brand'],
    threshold: 0.4,
    includeScore: true,
  };

  const fuse = new Fuse(products, options);
  return fuse.search(query).map(result => result.item);
};

/**
 * Calculate the total price per supermarket chain for the items in the cart.
 * @param {Array} cart - Array of items in the user's grocery list.
 * @param {Array} allPrices - Array of all prices from `supermarket_prices` collection.
 * @returns {Object} - An object containing totals per chain and missing item alerts.
 */
export const calculatePriceComparison = (cart, allPrices) => {
  if (!cart.length || !allPrices.length) return [];

  // 1. Group unique products by barcode OR name for matching
  const uniqueProducts = [];
  const barcodeSeen = new Set();
  const namesSeen = new Set();

  allPrices.forEach(p => {
    if (p.barcode && !barcodeSeen.has(p.barcode)) {
      uniqueProducts.push({ name: p.name, barcode: p.barcode });
      barcodeSeen.add(p.barcode);
    } else if (!p.barcode && !namesSeen.has(p.name)) {
      uniqueProducts.push({ name: p.name, barcode: null });
      namesSeen.add(p.name);
    }
  });

  // 2. Setup Fuse for name fallback
  const fuse = new Fuse(uniqueProducts, { 
    keys: [
      { name: 'name', weight: 0.7 },
      { name: 'brand', weight: 0.3 }
    ], 
    threshold: 0.35 
  });

  // 3. Match each cart item
  const cartWithMatches = cart.map(item => {
    // Priority 1: Match by exact barcode
    if (item.barcode) {
      const barcodeMatch = uniqueProducts.find(up => up.barcode === item.barcode);
      if (barcodeMatch) return { ...item, matchedBarcode: item.barcode, matchedName: barcodeMatch.name };
    }

    // Priority 2: Match by fuzzy name
    const searchResult = fuse.search(item.name);
    if (searchResult.length > 0) {
      return { 
        ...item, 
        matchedBarcode: searchResult[0].item.barcode,
        matchedName: searchResult[0].item.name 
      };
    }

    return { ...item, matchedBarcode: null, matchedName: null };
  });

  // 4. Calculate totals per chain
  const chainIds = [...new Set(allPrices.map(p => p.chain_id))];
  
  const comparisonResults = chainIds.map(chainId => {
    let total = 0;
    const missingItems = [];
    
    cartWithMatches.forEach(cartItem => {
      // Find the price using the BEST match found
      const priceEntry = allPrices.find(p => 
        p.chain_id === chainId && 
        (cartItem.matchedBarcode ? p.barcode === cartItem.matchedBarcode : p.name === cartItem.matchedName)
      );
      
      if (priceEntry) {
        total += priceEntry.price * (cartItem.quantity || 1);
      } else {
        missingItems.push(cartItem.name);
      }
    });

    return {
      chainId,
      total: total.toFixed(2),
      missingItems,
      itemCount: cart.length - missingItems.length
    };
  });

  return comparisonResults.sort((a, b) => parseFloat(a.total) - parseFloat(b.total));
};
