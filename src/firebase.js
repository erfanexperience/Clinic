import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyABuGB5EEXKz3py4KNpKReaNm-XrCm2PPc",
  authDomain: "clinical-trials-fa04b.firebaseapp.com",
  databaseURL: "https://clinical-trials-fa04b-default-rtdb.firebaseio.com",
  projectId: "clinical-trials-fa04b",
  storageBucket: "clinical-trials-fa04b.firebasestorage.app",
  messagingSenderId: "1054305105431",
  appId: "1:1054305105431:web:1b3a982fce1cfab02f0e52"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
