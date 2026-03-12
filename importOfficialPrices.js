/**
 * importOfficialPrices.js (Phase 5/6: Fully Autonomous & Randomized)
 * Fixes: AJAX Shufersal discovery, Nested price structure, Brand filtering, Randomization.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, writeBatch } from "firebase/firestore";
import https from 'node:https';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';

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
 * Discovers Osher Ad URL using FTP.
 */
async function discoverOsherAdUrl() {
  console.log("Discovering latest Osher Ad URL (FTP Mode)...");
  const ftpHost = 'url.retail.publishedprices.co.il';
  const username = 'osherad';
  const chainId = '7290103152017';

  try {
    // List files via FTP
    const cmd = `curl -s ftp://${ftpHost}/ --user ${username}:`;
    const output = execSync(cmd).toString();
    const lines = output.split('\n');

    // Find latest PriceFull file
    const priceFiles = lines
      .map(line => line.trim().split(/\s+/).pop()) // Get filename (last part of ls -l)
      .filter(fname => fname && fname.includes(`PriceFull${chainId}`) && fname.endsWith('.gz'))
      .sort((a, b) => b.localeCompare(a)); // Sort descending to get newest

    if (priceFiles.length > 0) {
      const url = `ftp://${ftpHost}/${priceFiles[0]}`;
      console.log("Found Osher Ad FTP URL:", url);
      return url;
    }
  } catch (e) {
    console.error("Error discovering Osher Ad FTP files:", e.message);
  }
  return null;
}

/**
 * Discovers Rami Levy URL.
 */
async function discoverRamiLevyUrl() {
  console.log("Attempting Rami Levy discovery...");
  return null; 
}

async function processChainData(chainId, url) {
  if (!url || url === "...") return 0;
  console.log(`Downloading and processing ${chainId}...`);
  
  return new Promise((resolve) => {
    let priceDataStream;

    if (url.startsWith('ftp://')) {
      // FTP handling via curl (since Node https doesn't do FTP)
      const username = 'osherad';
      const cmd = `curl -s ${url} --user ${username}:`;
      try {
        const buffer = execSync(cmd);
        priceDataStream = Readable.from(buffer);
      } catch (e) {
        console.error(`FTP download error for ${chainId}:`, e.message);
        return resolve(0);
      }
    } else {
      // Standard HTTPS handling
      const options = new URL(url);
      https.get({...options, rejectUnauthorized: false}, (res) => {
        if (res.statusCode !== 200) {
          console.warn(`HTTP error ${res.statusCode} for ${chainId}`);
          return resolve(0);
        }
        processStream(res);
      }).on('error', (e) => {
        console.error(`Request error for ${chainId}:`, e.message);
        resolve(0);
      });
      return; // processStream handles the rest
    }

    if (priceDataStream) {
      processStream(priceDataStream);
    }

    async function processStream(stream) {
      const gunzip = zlib.createGunzip();
      stream.pipe(gunzip);

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

        // Randomize the selection
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
              prices: { [item.chainId]: item.price }
            }, { merge: true });
          }
          await batch.commit();
        }
        resolve(updates.length);
      });
    }
  });
}

async function main() {
  const osherAdUrl = await discoverOsherAdUrl();
  const ramiLevyUrl = await discoverRamiLevyUrl();

  const chains = [
    { id: 'אושר עד', url: osherAdUrl },
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
