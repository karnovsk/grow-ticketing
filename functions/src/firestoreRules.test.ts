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

  test('authenticated users cannot write tickets directly', async () => {
    const authedDb = testEnv.authenticatedContext('staff-1').firestore();
    await assertFails(authedDb.collection('tickets').doc('t2').set({ status: 'issued' }));
  });
});
