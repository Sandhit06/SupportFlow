import { NextRequest, NextResponse } from "next/server";
import { hash } from "argon2";
import { Prisma } from "@prisma/client";
import { registrationSchema } from "../../../../../packages/contracts/src";
import { getEnv } from "../../../../../packages/config/src";
import { db } from "../../../../../packages/db/src";
import { rateLimit } from "../../../../../packages/core/src/rate-limit";
import { DomainError } from "../../../../../packages/core/src/policy";

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== new URL(getEnv().APP_URL).origin)
      return NextResponse.json(
        { message: "Request origin is not allowed." },
        { status: 403 },
      );
    const input = registrationSchema.safeParse(await request.json());
    if (!input.success)
      return NextResponse.json(
        { message: "Please check your name, email, and password." },
        { status: 400 },
      );
    await rateLimit("registration:global", 20, 3600);
    await rateLimit(`registration:${input.data.email}`, 3, 3600);
    const passwordHash = await hash(input.data.password);
    await db.user.create({
      data: { name: input.data.name, email: input.data.email, passwordHash },
    });
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError)
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return NextResponse.json(
        { message: "This email is unavailable. Try signing in." },
        { status: 409 },
      );
    return NextResponse.json(
      { message: "Registration is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
