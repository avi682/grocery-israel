/**
 * importOfficialPrices.js (Phase 5/6: Fully Autonomous & Randomized)
 * Fixes: AJAX Shufersal discovery, Nested price structure, Brand filtering, Randomization.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, writeBatch } from "firebase/firestore";
import https from 'node:https';
import zlib from 'node:zlib';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBk9ROP8GqFL11AriHa7znd_5uJqGfbmIc",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "groceryisrael.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "groceryisrael",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "groceryisrael.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "617507304416",
  appId: process.env.FIREBASE_APP_ID || "1:617507304416:web:4254ad88222bb482ac7185"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ITEM_LIMIT_PER_RUN = 3500;
const cleanStr = (str) => str ? str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : '';

/**
 * Discovers Shufersal URL using the AJAX endpoint.
 */
async function discoverShufersalUrl() {
  console.log("Discovering latest Shufersal URL via AJAX...");
  return new Promise((resolve) => {
    const options = {
      hostname: 'prices.shufersal.co.il',
      path: '/FileObject/UpdateCategory?catID=2&storeId=1', // PriceFull for Store 1
      headers: { 'x-requested-with': 'XMLHttpRequest' }
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const regex = /href="(https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/PriceFull[^"]+\.gz[^"]+)"/;
        const match = data.match(regex);
        if (match) {
          console.log("Found Shufersal URL:", match[1]);
          resolve(match[1]);
        } else {
          console.warn("Could not find Shufersal URL in AJAX response.");
          resolve(null);
        }
      });
    }).on('error', (e) => {
      console.error("Shufersal discovery error:", e.message);
      resolve(null);
    });
  });
}

/**
 * Discovers Rami Levy URL.
 * Note: Rami Levy portals often require a session cookie. 
 * We try to fetch the public file list index if available.
 */
async function discoverRamiLevyUrl() {
  console.log("Attempting Rami Levy discovery...");
  // Rami Levy usually lists files at a predictable path if authenticated.
  // For now, we return a known pattern or null if we can't automate the session easily.
  return null; 
}

async function processChainData(chainId, url) {
  if (!url || url === "...") return 0;
  console.log(`Downloading and processing ${chainId}...`);
  
  return new Promise((resolve) => {
    const request = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        console.warn(`HTTP error ${res.statusCode} for ${chainId}`);
        return resolve(0);
      }

      const gunzip = zlib.createGunzip();
      res.pipe(gunzip);

      let xmlData = '';
      gunzip.on('data', (chunk) => xmlData += chunk.toString());
      gunzip.on('end', async () => {
        const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
        let match;
        const allValidItems = [];
        
        while ((match = itemRegex.exec(xmlData)) !== null) {
          const itemXml = match[1];
          const name = cleanStr(itemXml.match(/<ItemName>(.*?)<\/ItemName>/)?.[1]);
          const price = parseFloat(itemXml.match(/<ItemPrice>(.*?)<\/ItemPrice>/)?.[1]);
          const barcode = itemXml.match(/<ItemCode>(.*?)<\/ItemCode>/)?.[1];
          const brand = cleanStr(itemXml.match(/<ManufacturerName>(.*?)<\/ManufacturerName>/)?.[1]);
          
          if (name && price > 0 && barcode && brand && brand !== '---') {
            allValidItems.push({ barcode, name, price, brand, chainId });
          }
        }

        // Randomize the selection to grow the database over time
        for (let i = allValidItems.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allValidItems[i], allValidItems[j]] = [allValidItems[j], allValidItems[i]];
        }

        const updates = allValidItems.slice(0, ITEM_LIMIT_PER_RUN);
        if (updates.length > 0) {
          const batch = writeBatch(db);
          for (const item of updates) {
            const docRef = doc(db, 'master_catalog', item.barcode);
            batch.set(docRef, {
              name: item.name,
              brand: item.brand,
              updated_at: new Date(),
              prices: {
                [item.chainId]: item.price
              }
            }, { merge: true });
          }
          await batch.commit();
        }
        resolve(updates.length);
      });
    });

    request.on('error', (e) => {
      console.error(`Request error for ${chainId}:`, e.message);
      resolve(0);
    });
    request.setTimeout(30000, () => { request.destroy(); resolve(0); });
  });
}

async function main() {
  const shufersalUrl = await discoverShufersalUrl();
  const ramiLevyUrl = await discoverRamiLevyUrl();

  const chains = [
    { id: 'שופרסל', url: shufersalUrl },
    { id: 'רמי לוי', url: ramiLevyUrl },
  ];

  for (const chain of chains) {
    if (chain.url) {
      const imported = await processChainData(chain.id, chain.url);
      console.log(`Finished ${chain.id}: Imported ${imported} items.`);
    } else {
      console.warn(`Skipping ${chain.id}: No valid URL discovered.`);
    }
  }

  console.log("Autonomous sync complete.");
  process.exit(0);
}

main();
