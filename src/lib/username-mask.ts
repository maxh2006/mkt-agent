export function maskUsername(name: string): string {
  if (name.length <= 4) return name;
  return name.slice(0, 2) + "*".repeat(name.length - 4) + name.slice(-2);
}

const RANDOM_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateRandomUsername(): string {
  const length = 6 + Math.floor(Math.random() * 3); // 6, 7, or 8
  let result = "";
  for (let i = 0; i < length; i++) {
    result += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  }
  return result;
}
