/**
 * Daily Update Script for Master Catalog
 * This script iterates over all products in the master_catalog and updates their prices from CHP.
 * Can be run via local terminal or scheduled task.
 */

// Import necessary Firebase and Scraper modules
// Note: This script is intended to be run with Node.js
import { db } from './firebaseConfig.js';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { fetchChpPrices } from './chpScraper.js';

async function performDailyUpdate() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Starting daily update for ${today}...`);
    
    try {
        const querySnapshot = await getDocs(collection(db, 'master_catalog'));
        const products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        console.log(`Found ${products.length} products to update.`);
        
        for (const product of products) {
            // Check if already updated today to avoid redundant work
            if (product.last_updated === today) {
                console.log(`Skipping ${product.id} - already updated today.`);
                continue;
            }
            
            console.log(`Updating prices for ${product.id} (${product.name})...`);
            
            // Scrape CHP (using default city for global update, or specific if needed)
            const newPrices = await fetchChpPrices(product.id, "פתח תקווה");
            
            if (newPrices.length > 0) {
                const productRef = doc(db, 'master_catalog', product.id);
                await setDoc(productRef, {
                    last_updated: today,
                    prices: newPrices.map(p => ({
                        chain_id: p.chain_id,
                        price: p.price,
                        branch: p.branch,
                        deal: p.deal,
                        name: product.name
                    }))
                }, { merge: true });
                console.log(`Successfully updated ${product.id}`);
            } else {
                console.log(`No prices found for ${product.id}, skipping Firestore update.`);
            }
            
            // Add a small delay to respect CHP's servers and satisfy rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log("Daily update completed successfully.");
    } catch (error) {
        console.error("Daily update failed:", error);
    }
}

performDailyUpdate();
