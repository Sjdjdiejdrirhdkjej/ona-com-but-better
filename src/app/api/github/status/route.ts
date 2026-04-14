import { getGitHubConfig, getGitHubToken, getGitHubViewer } from '@/libs/GitHub';

export const runtime = 'nodejs';

export async function GET() {
  const config = getGitHubConfig();
  const token = await getGitHubToken();

  if (!config.configured) {
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
