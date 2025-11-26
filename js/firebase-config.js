// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDI0fUdOj9fLT92VEBQCs0rGPWm0cgIEhQ",
  authDomain: "speedjong-285c0.firebaseapp.com",
  projectId: "speedjong-285c0",
  storageBucket: "speedjong-285c0.firebasestorage.app",
  messagingSenderId: "282851961282",
  appId: "1:282851961282:web:942a04667587d5ee320e5b",
  measurementId: "G-GYKFD28ZLH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, analytics, db, auth };

