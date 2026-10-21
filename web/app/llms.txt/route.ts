import { buildLlmsTxt, llmsResponse } from '../lib/llms';

export const dynamic = 'force-dynamic';

// A short briefing about the shop for AI assistants: facts, categories, guides and where the answers are.
export async function GET() {
  return llmsResponse(await buildLlmsTxt({ full: false }));
}
