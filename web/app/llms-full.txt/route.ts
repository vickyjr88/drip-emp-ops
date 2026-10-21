import { buildLlmsTxt, llmsResponse } from '../lib/llms';

export const dynamic = 'force-dynamic';

// The same briefing plus every FAQ answer in full.
export async function GET() {
  return llmsResponse(await buildLlmsTxt({ full: true }));
}
