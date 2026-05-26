import { useEffect, useState } from 'react';
import { db, auth, signIn } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, setDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';

export interface ScoreEntry {
  id?: string;
  userId: string;
  displayName: string;
  score: number;
  maxHeight: number;
  updatedAt?: any;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function useLeaderboard() {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: ScoreEntry[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as ScoreEntry);
      });
      setScores(data);
      setLoading(false);
    }, (error) => {
       handleFirestoreError(error, OperationType.GET, 'leaderboard');
    });

    return () => unsubscribe();
  }, []);

  const submitScore = async (displayName: string, score: number, maxHeight: number) => {
    if (!auth || !db || !auth.currentUser || !auth.currentUser.emailVerified) return;
    
    const docRef = doc(db, 'leaderboard', auth.currentUser.uid);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const currentScore = docSnap.data().score;
            if (score <= currentScore) return; // Only update if higher
            
            await setDoc(docRef, {
                userId: auth.currentUser.uid,
                displayName: displayName || 'Anonymous',
                score: score,
                maxHeight: maxHeight,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } else {
             await setDoc(docRef, {
                userId: auth.currentUser.uid,
                displayName: displayName || 'Anonymous',
                score: score,
                maxHeight: maxHeight,
                updatedAt: serverTimestamp()
             });
        }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `leaderboard/${auth.currentUser.uid}`);
    }
  };

  return { scores, submitScore, loading };
}
