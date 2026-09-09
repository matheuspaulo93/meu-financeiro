/** remove chaves com valor undefined, pois o Firestore rejeita undefined em addDoc/updateDoc */
export function stripUndefined<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }
  return result;
}
