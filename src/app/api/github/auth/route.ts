export const runtime = 'nodejs';

export async function GET() {
  return Response.json(
    { error: 'OAuth redirect login is no longer used. Use the Device Auth flow at /api/github/device/start instead.' },
    { status: 410 },
  );
}
