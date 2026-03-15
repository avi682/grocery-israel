/**
 * importOfficialPrices.js (Phase 5/6: Fully Autonomous & Randomized)
 * Fixes: AJAX Shufersal discovery, Nested price structure, Brand filtering, Randomization.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, writeBatch } from "firebase/firestore";
import { XMLParser } from "fast-xml-parser";
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

const parser = new XMLParser();
const ITEM_LIMIT_PER_RUN = 3500;
const cleanStr = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
};

const CHAINS = {
  OSHER_AD: { id: 'אושר עד', chainId: '7290103152017', username: 'osherad' },
  RAMI_LEVY: { id: 'רמי לוי', chainId: '7290058140886', username: 'RamiLevi' },
  SHUFERSAL: { id: 'שופרסל', chainId: '7290027600007', portal: 'https://prices.shufersal.co.il' }
};


/**
 * Discovers URL for FTP-based retailers (Osher Ad, Rami Levy).
 */
async function discoverFtpUrl(chain) {
  console.log(`Discovering latest ${chain.id} URL (FTP Mode)...`);
  const ftpHost = 'url.retail.publishedprices.co.il';

  try {
    const cmd = `curl -s ftp://${ftpHost}/ --user ${chain.username}:`;
    const output = execSync(cmd).toString();
    const lines = output.split('\n');

    const priceFiles = lines
      .map(line => line.trim().split(/\s+/).pop())
      .filter(fname => fname && fname.toLowerCase().includes('pricefull') && fname.toLowerCase().includes(chain.chainId) && fname.endsWith('.gz'))
      .sort((a, b) => b.localeCompare(a));

    if (priceFiles.length > 0) {
      const url = `ftp://${ftpHost}/${priceFiles[0]}`;
      console.log(`Found ${chain.id} FTP URL:`, url);
      return url;
    }
  } catch (e) {
    console.error(`Error discovering ${chain.id} FTP files:`, e.message);
  }
  return null;
}

/**
 * Discovers Shufersal URL using their web portal.
 */
async function discoverShufersalUrl() {
  console.log("Discovering latest Shufersal URL...");
  // Using the AJAX URL found to work better with Shufersal's WebGrid
  const updateUrl = `${CHAINS.SHUFERSAL.portal}/FileObject/UpdateCategory?catID=2&__swhg=${Date.now()}`;
  
  return new Promise((resolve) => {
    https.get(updateUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Shufersal returns an HTML fragment with links on Azure Blob Storage
        const match = data.match(/href="(https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/PriceFull7290027600007-413-.*?\.gz.*?)"/);
        if (match) {
          const url = match[1].replace(/&amp;/g, '&');
          console.log("Found Shufersal URL:", url);
          resolve(url);
        } else {
          // Fallback to a more generic match if branch 413 is not found
          const genericMatch = data.match(/href="(https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/pricefull\/PriceFull7290027600007-.*?\.gz.*?)"/);
          if (genericMatch) {
            const url = genericMatch[1].replace(/&amp;/g, '&');
            console.log("Found Shufersal URL (Generic):", url);
            resolve(url);
          } else {
            console.warn("Could not find Shufersal price file in AJAX response.");
            resolve(null);
          }
        }
      });
    }).on('error', (e) => {
      console.error("Shufersal discovery error:", e.message);
      resolve(null);
    });
  });
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

      let buffer = [];
      gunzip.on('data', (chunk) => buffer.push(chunk));
      gunzip.on('end', async () => {
        const xmlData = Buffer.concat(buffer).toString();
        const jsonObj = parser.parse(xmlData);
        
        // The structure is typically <Root><Items><Item>...</Item></Items></Root>
        // Depending on the chain, Root might be 'Root', 'Prices', etc.
        const rootKey = Object.keys(jsonObj)[0];
        const itemsWrapper = jsonObj[rootKey]?.Items || jsonObj[rootKey];
        const items = itemsWrapper?.Item || [];
        
        const allValidItems = (Array.isArray(items) ? items : [items])
          .map(item => ({
            barcode: item.ItemCode?.toString(),
            name: cleanStr(item.ItemName),
            price: parseFloat(item.ItemPrice),
            brand: cleanStr(item.ManufacturerName),
            chainId
          }))
          .filter(item => item.name && item.price > 0 && item.barcode && item.brand && item.brand !== '---');

        console.log(`Parsed ${allValidItems.length} valid items from ${chainId}`);

        // Randomize the selection
        for (let i = allValidItems.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allValidItems[i], allValidItems[j]] = [allValidItems[j], allValidItems[i]];
        }

        const updates = allValidItems.slice(0, ITEM_LIMIT_PER_RUN);
        if (updates.length > 0) {
          console.log(`Uploading ${updates.length} items to Firestore...`);
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
  const osherAdUrl = await discoverFtpUrl(CHAINS.OSHER_AD);
  const ramiLevyUrl = await discoverFtpUrl(CHAINS.RAMI_LEVY);
  const shufersalUrl = await discoverShufersalUrl();

  const chains = [
    { id: CHAINS.OSHER_AD.id, url: osherAdUrl },
    { id: CHAINS.RAMI_LEVY.id, url: ramiLevyUrl },
    { id: CHAINS.SHUFERSAL.id, url: shufersalUrl },
  ];

  for (const chain of chains) {
    if (chain.url) {
      try {
        const imported = await processChainData(chain.id, chain.url);
        console.log(`Finished ${chain.id}: Imported ${imported} items.`);
      } catch (e) {
        console.error(`Failed to process ${chain.id}:`, e.message);
      }
    } else {
      console.warn(`Skipping ${chain.id}: No valid URL discovered.`);
    }
  }

  console.log("Autonomous sync complete.");
  process.exit(0);
}

main();
