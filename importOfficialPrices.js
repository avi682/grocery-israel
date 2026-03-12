/**
 * importOfficialPrices.js (Phase 5: Fully Autonomous Crawler)
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
 * Fetches the Shufersal portal and finds the latest PriceFull link for store 001.
 */
async function discoverShufersalUrl() {
  console.log("Discovering latest Shufersal URL...");
  return new Promise((resolve) => {
    https.get("https://prices.shufersal.co.il/", (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        // Regex to find a PriceFull link for store 001 (usually ends in .gz with security tokens)
        const regex = /href="(https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/PriceFull7290027600007-001-[^"]+\.gz[^"]+)"/;
        const match = data.match(regex);
        if (match) {
          console.log("Found Shufersal URL:", match[1]);
          resolve(match[1]);
        } else {
          console.warn("Could not find Shufersal URL on portal.");
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
 * Robust processing of a single chain file.
 */
async function processChainData(chainId, url) {
  if (!url) return 0;
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

        // Shuffle the results to get a random mix each day
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
    request.setTimeout(15000, () => { request.destroy(); resolve(0); });
  });
}

async function main() {
  try {
    const shufersalUrl = await discoverShufersalUrl();
    
    const chains = [
      { id: 'שופרסל', url: shufersalUrl },
      // Rami Levy and others can be added with their own discovery helpers
    ];

    for (const chain of chains) {
      const imported = await processChainData(chain.id, chain.url);
      console.log(`Finished ${chain.id}: Imported ${imported} items.`);
    }

    console.log("Autonomous sync complete.");
    process.exit(0);
  } catch (err) {
    console.error("Critical error in main:", err);
    process.exit(1);
  }
}

main();
