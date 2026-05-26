import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const isFileProtocol = window.location.protocol === 'file:';

export const app = isFileProtocol ? null : initializeApp(firebaseConfig);
export const db = app ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : null as any;
export const auth = app ? getAuth(app) : null as any;

export const signIn = async () => {
  if (!auth) {
    alert("Sign in is not supported when running locally from a file:// URL.");
    return;
  }
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Error signing in with Google:", error);
  }
};

