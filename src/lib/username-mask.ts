export function maskUsername(name: string): string {
  if (name.length <= 4) return name;
  return name.slice(0, 2) + "*".repeat(name.length - 4) + name.slice(-2);
}
