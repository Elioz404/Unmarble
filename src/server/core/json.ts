/** Parses stored JSON without ever throwing; corrupt data reads as absent. */
export const readJson = (raw: string | undefined | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
