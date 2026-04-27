export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  console.log("TEST ROUTE HIT");
  return Response.json({ ok: true });
}
