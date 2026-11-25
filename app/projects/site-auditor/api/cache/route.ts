import { NextRequest, NextResponse } from 'next/server';
import { sharedDb } from '@/lib/shared-db';
import { isOwner } from '@/lib/owner';

// Fetched page HTML, kept for a week so re-auditing a site doesn't pay Apify again.
const T = 'site_auditor_page_cache';
const WEEK = 7 * 24 * 3600 * 1000;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ cached: false });
  const { data } = await sharedDb().from(T).select('html, fetched_at').eq('url', url).maybeSingle();
  if (!data || Date.parse(data.fetched_at) < Date.now() - WEEK) return NextResponse.json({ cached: false });
  return NextResponse.json({ cached: true, html: data.html });
}

export async function POST(req: NextRequest) {
  if (!(await isOwner())) return NextResponse.json({ ok: false }, { status: 401 });
  const { url, html } = await req.json();
  if (!url || !html || typeof html !== 'string') return NextResponse.json({ ok: false }, { status: 400 });
  await sharedDb().from(T).upsert({ url, html: html.slice(0, 2_000_000), fetched_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
