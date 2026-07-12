export async function readStoredJson(key) {
  try {
    const result = await window.storage.get(key);
    return result ? JSON.parse(result.value) : null;
  } catch {
    return null;
  }
}

export async function persist(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value));
  } catch {
    // Storage is optional in the prototype host.
  }
}
