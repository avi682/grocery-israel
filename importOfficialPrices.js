/**
 * importOfficialPrices.js (Refined: 3,500 limit + Multiple Chains)
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

async function seedFallbackData() {
  console.log("Seeding fallback Master Catalog data for all chains...");
  const batch = writeBatch(db);
  const fallbackProducts = [
    { barcode: "7290000042405", name: "חלב תנובה 3% ליטר", brand: "תנובה", prices: { "שופרסל": 6.20, "ויקטורי": 5.90, "רמי לוי": 5.80, "אושר עד": 5.70, "יוחננוף": 5.80, "יש חסד": 5.75 } },
    { barcode: "7290000066319", name: "גבינת עמק פרוסה 200 גרם", brand: "תנובה", prices: { "שופרסל": 15.90, "ויקטורי": 14.50, "רמי לוי": 14.90, "אושר עד": 13.90, "יוחננוף": 14.20, "יש חסד": 13.90 } },
    { barcode: "7280000000001", name: "קוקה קולה 1.5 ליטר", brand: "החברה המרכזית", prices: { "שופרסל": 8.50, "ויקטורי": 7.50, "רמי לוי": 7.20, "אושר עד": 6.90, "יוחננוף": 7.10, "יש חסד": 6.90 } }
  ];

  fallbackProducts.forEach(p => {
    const docRef = doc(db, 'master_catalog', p.barcode);
    batch.set(docRef, {
      name: p.name,
      brand: p.brand,
      updated_at: new Date(),
      prices: p.prices
    }, { merge: true });
  });

  await batch.commit();
}

async function processChainData(chainId, url) {
  if (!url || url.includes("...")) return 0;
  console.log(`Processing ${chainId}...`);
  
  return new Promise((resolve) => {
    const request = https.get(url, (res) => {
      if (res.statusCode !== 200) return resolve(0);

      const gunzip = zlib.createGunzip();
      res.pipe(gunzip);

      let xmlData = '';
      gunzip.on('data', (chunk) => xmlData += chunk.toString());
      gunzip.on('end', async () => {
        const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
        let match;
        const updates = [];
        let count = 0;
        
        while ((match = itemRegex.exec(xmlData)) !== null && count < ITEM_LIMIT_PER_RUN) {
          const itemXml = match[1];
          const name = cleanStr(itemXml.match(/<ItemName>(.*?)<\/ItemName>/)?.[1]);
          const price = parseFloat(itemXml.match(/<ItemPrice>(.*?)<\/ItemPrice>/)?.[1]);
          const barcode = itemXml.match(/<ItemCode>(.*?)<\/ItemCode>/)?.[1];
          const brand = cleanStr(itemXml.match(/<ManufacturerName>(.*?)<\/ManufacturerName>/)?.[1]);
          
          if (name && price && barcode) {
            updates.push({ barcode, name, price, brand, chainId });
            count++;
          }
        }

        const batch = writeBatch(db);
        for (const item of updates) {
          const docRef = doc(db, 'master_catalog', item.barcode);
          batch.set(docRef, {
            name: item.name,
            brand: item.brand,
            updated_at: new Date(),
            [`prices.${item.chainId}`]: item.price
          }, { merge: true });
        }
        await batch.commit();
        resolve(count);
      });
    });

    request.on('error', () => resolve(0));
    request.setTimeout(10000, () => { request.destroy(); resolve(0); });
  });
}

async function main() {
  const chains = [
    { id: 'שופרסל', url: "https://pricesprodpublic.blob.core.windows.net/pricefull/PriceFull7290027600007-001-202603120300.gz?sv=2014-02-14&sr=b&sig=I6HYFmajs9GbdNCPqChZnINUPT213d1V4Go5J6CFSOQ%3D&se=2026-03-12T21%3A20%3A49Z&sp=r" },
    { id: 'רמי לוי', url: "https://url.retail.publishedprices.co.il/file/d/PriceFull7290058140886-006-202603121800.gz" },
    { id: 'אושר עד', url: "..." },
    { id: 'יוחננוף', url: "..." },
    { id: 'יש חסד', url: "..." }
  ];

  for (const chain of chains) {
    const imported = await processChainData(chain.id, chain.url);
    if (imported > 0) console.log(`Imported ${imported} items for ${chain.id}`);
  }

  await seedFallbackData();
  console.log("Sync complete.");
  process.exit(0);
}

main();
