import { Redis } from "ioredis";
import { getEnv } from "../../config/src";
import { DomainError } from "./policy";
let client: Redis | undefined;
export function redis() {
  return (client ??= new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  }));
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const count = (await redis().eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
    1,
    `limit:${key}`,
    seconds,
  )) as number;
  if (count > limit)
    throw new DomainError(
      "RATE_LIMITED",
      429,
      "Too many requests. Please try again shortly.",
    );
}
