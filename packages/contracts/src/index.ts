import { z } from "zod";
export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
});
export const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  clientMessageId: z.uuid(),
  internal: z.boolean().default(false),
});
export const organizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(50),
  origin: z
    .url()
    .refine(
      (v) =>
        new URL(v).origin === v &&
        (v.startsWith("https://") ||
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)),
      "Use an exact HTTPS origin (localhost allowed)",
    ),
});
export const articleSchema = z.object({
  title: z.string().trim().min(3).max(150),
  body: z.string().trim().min(10).max(30000),
  published: z.boolean(),
});
export const ticketSchema = z.object({
  subject: z.string().trim().min(3).max(150),
  conversationId: z.uuid(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});
export const ticketUpdateSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
});
export type Role = "OWNER" | "ADMIN" | "AGENT" | "VIEWER";
export type Actor = { organizationId: string; userId: string; role: Role };
