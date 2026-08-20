import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "Content-Type": "application/json; charset=utf-8",
};

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;

    return Response.json(
      { status: "ok", database: "connected" },
      { status: 200, headers: responseHeaders },
    );
  } catch {
    return Response.json(
      { status: "unhealthy", database: "unavailable" },
      { status: 503, headers: responseHeaders },
    );
  }
}
