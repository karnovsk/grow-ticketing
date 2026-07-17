export async function clearFirestoreEmulator(projectId: string): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}
