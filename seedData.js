import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBk9ROP8GqFL11AriHa7znd_5uJqGfbmIc",
  authDomain: "groceryisrael.firebaseapp.com",
  projectId: "groceryisrael",
  storageBucket: "groceryisrael.firebasestorage.app",
  messagingSenderId: "617507304416",
  appId: "1:617507304416:web:4254ad88222bb482ac7185"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const products = [
  { name: "חלב תנובה 3%", brand: "תנובה", category: "חלב ומוצריו", prices: { "שופרסל": 6.20, "ויקטורי": 5.90, "רמי לוי": 5.80 } },
  { name: "לחם אחיד פרוס", brand: "אנג'ל", category: "מאפים", prices: { "שופרסל": 7.10, "ויקטורי": 6.90, "רמי לוי": 6.90 } },
  { name: "ביצים L 12 יחידות", brand: "כללי", category: "ביצים", prices: { "שופרסל": 13.50, "ויקטורי": 13.20, "רמי לוי": 12.90 } },
  { name: "גבינה צהובה עמק 200 גרם", brand: "תנובה", category: "חלב ומוצריו", prices: { "שופרסל": 14.90, "ויקטורי": 13.90, "רמי לוי": 13.50 } },
  { name: "קוקה קולה 1.5 ליטר", brand: "קוקה קולה", category: "משקאות", prices: { "שופרסל": 8.50, "ויקטורי": 7.50, "רמי לוי": 6.90 } },
  { name: "אורז פרסי 1 ק\"ג", brand: "סוגת", category: "קטניות", prices: { "שופרסל": 9.90, "ויקטורי": 8.90, "רמי לוי": 8.50 } },
];

async function seed() {
  console.log("Seeding data...");
  const colRef = collection(db, 'supermarket_prices');
  
  // Clear existing if any (optional, but good for clean state)
  const snapshot = await getDocs(colRef);
  for (const docSnap of snapshot.docs) {
    await deleteDoc(doc(db, 'supermarket_prices', docSnap.id));
  }

  for (const p of products) {
    for (const [chainId, price] of Object.entries(p.prices)) {
      await addDoc(colRef, {
        name: p.name,
        brand: p.brand,
        category: p.category,
        chain_id: chainId,
        price: price,
        updated_at: new Date()
      });
    }
  }
  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
