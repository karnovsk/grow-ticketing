import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-grow-ticketing-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe('firestore.rules for tickets', () => {
  test('unauthenticated users cannot read tickets', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthedDb.collection('tickets').doc('t1').get());
  });

  test('authenticated users can read tickets', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('tickets').doc('t1').set({ status: 'issued' });
    });
    const authedDb = testEnv.authenticatedContext('staff-1').firestore();
    await assertSucceeds(authedDb.collection('tickets').doc('t1').get());
  });

  test('archived tickets are not readable, even by staff', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('ticketsArchive').doc('t1').set({ status: 'validated' });
    });
    const authedDb = testEnv.authenticatedContext('staff-1').firestore();
    await assertFails(authedDb.collection('ticketsArchive').doc('t1').get());
  });

  test('authenticated users cannot write tickets directly', async () => {
    const authedDb = testEnv.authenticatedContext('staff-1').firestore();
    await assertFails(authedDb.collection('tickets').doc('t2').set({ status: 'issued' }));
  });
});

describe('firestore.rules for dailySales', () => {
  test('authenticated users can read daily totals', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('dailySales').doc('2026-10-22').set({ tickets: 1, revenue: 90 });
    });
    const authedDb = testEnv.authenticatedContext('staff-1').firestore();
    await assertSucceeds(authedDb.collection('dailySales').doc('2026-10-22').get());
  });

  test('unauthenticated users cannot read daily totals', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthedDb.collection('dailySales').doc('2026-10-22').get());
  });

  test('nobody can write daily totals from the client', async () => {
    const authedDb = testEnv.authenticatedContext('staff-1').firestore();
    await assertFails(authedDb.collection('dailySales').doc('2026-10-22').set({ tickets: 999 }));
  });
});
