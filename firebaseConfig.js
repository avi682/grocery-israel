import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBk9ROP8GqFL11AriHa7znd_5uJqGfbmIc",
  authDomain: "groceryisrael.firebaseapp.com",
  projectId: "groceryisrael",
  storageBucket: "groceryisrael.firebasestorage.app",
  messagingSenderId: "617507304416",
  appId: "1:617507304416:web:4254ad88222bb482ac7185"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
