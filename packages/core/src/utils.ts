export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function daysSince(dateStr: string, now: number = Date.now()): number {
  return (now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}
