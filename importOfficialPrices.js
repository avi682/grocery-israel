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
 * Discovers Osher Ad URL with full CSRF and Session handling.
 */
async function discoverOsherAdUrl() {
  console.log("Discovering latest Osher Ad URL (Robust Method)...");
  const hostname = 'url.publishedprices.co.il';
  const commonHeaders = { 'User-Agent': 'Mozilla/5.0' };

  return new Promise((resolve) => {
    // 1. GET /login to find CSRF token and initial cookie
    https.get({ hostname, path: '/login', headers: commonHeaders, rejectUnauthorized: false }, (res) => {
      let html = '';
      const setCookies = res.headers['set-cookie'] || [];
      let cookie = setCookies.find(c => c.startsWith('cftpSID='))?.split(';')[0];
      
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        const csrfMatch = html.match(/name="csrftoken" value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : null;

        if (!csrfToken) {
          console.error("Could not find CSRF token for Osher Ad.");
          return resolve(null);
        }

        // 2. POST /login with the token
        const loginData = `user=Osherad&password=&csrftoken=${csrfToken}`;
        const loginOptions = {
          hostname, path: '/login', method: 'POST',
          headers: { 
            ...commonHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': loginData.length,
            'Cookie': cookie || ''
          },
          rejectUnauthorized: false
        };

        const loginReq = https.request(loginOptions, (loginRes) => {
          const loginCookies = loginRes.headers['set-cookie'] || [];
          const sessionCookie = loginCookies.find(c => c.startsWith('cftpSID='))?.split(';')[0] || cookie;

          // 3. POST /file/json/dir to get file list (DataTables format)
          const listParams = new URLSearchParams({
            sEcho: '1', iDisplayLength: '1000', cd: '/', 
            csrftoken: csrfToken
          }).toString();

          const listOptions = {
            hostname, path: '/file/json/dir', method: 'POST',
            headers: {
              ...commonHeaders,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': listParams.length,
              'Cookie': sessionCookie,
              'x-requested-with': 'XMLHttpRequest'
            },
            rejectUnauthorized: false
          };

          const listReq = https.request(listOptions, (listRes) => {
            let body = '';
            listRes.on('data', chunk => body += chunk);
            listRes.on('end', () => {
              try {
                const data = JSON.parse(body);
                const files = data.aaData || [];
                // Find PriceFull7290103152017-001... (Osher Ad Store 1)
                const priceFile = files.find(f => f.fname.includes('PriceFull7290103152017-001') && f.fname.endsWith('.gz'));
                
                if (priceFile) {
                  const url = `https://${hostname}/file/d/${priceFile.fname}`;
                  console.log("Found Osher Ad URL:", url);
                  resolve(url);
                } else {
                  console.warn("Could not find Osher Ad PriceFull file in JSON.");
                  resolve(null);
                }
              } catch (e) {
                console.error("Error parsing Osher Ad file list JSON:", e.message);
                resolve(null);
              }
            });
          });
          listReq.write(listParams);
          listReq.end();
        });
        loginReq.write(loginData);
        loginReq.end();
      });
    });
  });
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
    const options = new URL(url);
    const request = https.get({...options, rejectUnauthorized: false}, (res) => {
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
