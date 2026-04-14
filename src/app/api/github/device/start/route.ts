import { requestDeviceCode } from '@/libs/GitHub';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const data = await requestDeviceCode();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
