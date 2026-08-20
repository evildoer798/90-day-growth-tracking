import { compare } from "bcryptjs";

const DUMMY_PASSWORD_HASH =
  "$2b$12$yWEcGYNOfhB7S0J7Uj1Z0uEOftviSBEw2II.wBk5uXyVQnI23YXvK";
const SUPPORTED_PASSWORD_HASH = /^\$2[ab]\$12\$[./A-Za-z0-9]{53}$/;

export interface PasswordHashSelection {
  hash: string;
  usesStoredHash: boolean;
}

type ComparePassword = (password: string, hash: string) => Promise<boolean>;

export function selectPasswordHashForVerification(
  storedHash: string | null | undefined,
): PasswordHashSelection {
  if (storedHash && SUPPORTED_PASSWORD_HASH.test(storedHash)) {
    return { hash: storedHash, usesStoredHash: true };
  }

  return { hash: DUMMY_PASSWORD_HASH, usesStoredHash: false };
}

export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
  comparePassword: ComparePassword = compare,
): Promise<boolean> {
  const selectedHash = selectPasswordHashForVerification(storedHash);

  try {
    const passwordMatches = await comparePassword(password, selectedHash.hash);
    return selectedHash.usesStoredHash && passwordMatches;
  } catch {
    if (selectedHash.usesStoredHash) {
      const dummyHash = selectPasswordHashForVerification(undefined).hash;
      await comparePassword(password, dummyHash).catch(() => false);
    }
    return false;
  }
}
