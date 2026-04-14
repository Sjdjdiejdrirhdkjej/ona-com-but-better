import { getGitHubToken, getGitHubViewer, isGitHubConfigured } from '@/libs/GitHub';

export const runtime = 'nodejs';

export async function GET() {
  const configured = isGitHubConfigured();
  const token = await getGitHubToken();

  if (!configured) {
    return Response.json({ configured: false, connected: false });
  }

  if (!token) {
    return Response.json({ configured: true, connected: false });
  }

  try {
    const user = await getGitHubViewer(token);
    return Response.json({ configured: true, connected: true, user });
  } catch (error) {
    return Response.json({ configured: true, connected: false, error: (error as Error).message }, { status: 401 });
  }
}
