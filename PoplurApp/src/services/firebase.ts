import { getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAaTASNEBqtyiTjK-3DfzzH3ktfe6aZ9-g',
  authDomain: 'poplur2025.firebaseapp.com',
  projectId: 'poplur2025',
  storageBucket: 'poplur2025.firebasestorage.app',
  messagingSenderId: '440480901104',
  appId: '1:440480901104:web:b3d37126d37b35da8c1f35',
  measurementId: 'G-G9MN8MVQJ6',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
