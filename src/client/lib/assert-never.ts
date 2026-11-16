/** Ends an exhaustive `switch`: the compiler rejects the call once any case is left unhandled. */
export const assertNever = (value: never): never => {
  throw new Error(`Unhandled case: ${String(value)}`);
};
