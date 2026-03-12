/**
 * clearCatalog.js
 * Utility to clear the master_catalog collection so we can re-import with the correct structure.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc, writeBatch } from "firebase/firestore";

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

async function clearCollection(collectionName) {
  console.log(`Clearing collection: ${collectionName}...`);
  const querySnapshot = await getDocs(collection(db, collectionName));
  const batch = writeBatch(db);
  
  let count = 0;
  querySnapshot.forEach((document) => {
    batch.delete(doc(db, collectionName, document.id));
    count++;
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Successfully deleted ${count} documents from ${collectionName}.`);
  } else {
    console.log("No documents found to delete.");
  }
}

async function main() {
  try {
    await clearCollection('master_catalog');
    console.log("Cleanup complete.");
    process.exit(0);
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1);
  }
}

main();
