import { doc, getDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

type BetaSignupSource = 'website';

type SaveBetaSignupOptions = {
  source?: BetaSignupSource;
};

export async function saveBetaSignupEmail(
  email: string,
  options: SaveBetaSignupOptions = {},
) {
  const normalizedEmail = email.trim().toLowerCase();
  const signupRef = doc(db, 'betaSignups', encodeURIComponent(normalizedEmail));
  const existingSignup = await getDoc(signupRef);

  await setDoc(
    signupRef,
    {
      createdAt: existingSignup.exists() ? existingSignup.data().createdAt : serverTimestamp(),
      email: normalizedEmail,
      source: options.source ?? 'website',
      signupCount: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
