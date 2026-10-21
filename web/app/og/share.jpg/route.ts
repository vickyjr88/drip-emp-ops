import type { NextRequest } from 'next/server';
import { ogImageResponse } from '../../lib/og-image';

export const dynamic = 'force-dynamic';

// /og/share.jpg?src=<image address>: the picture recomposed to a small 1200x630 JPEG for link previews.
export async function GET(request: NextRequest) {
  return ogImageResponse(request.nextUrl.searchParams.get('src'));
}
