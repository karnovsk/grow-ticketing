import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-grow-ticketing' });
}

export const db = admin.firestore();
