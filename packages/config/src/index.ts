import "dotenv/config";
import { z } from "zod";
export const environmentSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://"),
  REDIS_URL: z.url(),
  AUTH_SECRET: z.string().min(32),
  VISITOR_JWT_SECRET: z.string().min(32),
  APP_URL: z.url().default("http://localhost:3000"),
  REALTIME_URL: z.url().default("http://localhost:3001"),
  AI_MODE: z.literal("mock").default("mock"),
});
export function getEnv() {
  return environmentSchema.parse(process.env);
}
