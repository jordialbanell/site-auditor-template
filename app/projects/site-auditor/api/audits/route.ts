import { NextRequest, NextResponse } from 'next/server';
import { sharedDb } from '@/lib/shared-db';
import { isOwner } from '@/lib/owner';

// Saved audits live in the shared database (site_auditor_audits): the list and each audit are public,
// saving is just for the owner. (They used to sit in Upstash Redis for 30 days.)
const T = 'site_auditor_audits';

interface AuditMeta {
  id: string;
  url: string;
  companyName: string;
  auditor: string;
  date: string;
  pageCount: number;
  typeCount: number;
  topTone: string;
}

// GET - list all audits, or load a specific audit by ?id=
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const { data, error } = await sharedDb().from(T).select('data, meta').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Failed to load audit' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    return NextResponse.json({ ...(data.data as object), meta: data.meta });
  }
  const { data, error } = await sharedDb().from(T).select('meta').order('created_at', { ascending: false }).limit(200);
  if (error) return NextResponse.json({ audits: [] });
  return NextResponse.json({ audits: (data ?? []).map((r) => r.meta as AuditMeta) });
}

// POST - save a completed audit
export async function POST(req: NextRequest) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Only the owner can save audits.' }, { status: 401 });
  const body = await req.json();
  const { url, auditor, crawlData, brandSummary, linkGraph } = body;
  if (!url || !crawlData) return NextResponse.json({ error: 'url and crawlData required' }, { status: 400 });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pages = Object.values(crawlData) as Array<{ analysis?: { pageType?: string; tone?: string[] } }>;
  const types = new Set(pages.map((p) => p.analysis?.pageType).filter(Boolean));
  const toneCount: Record<string, number> = {};
  pages.forEach((p) => (p.analysis?.tone || []).forEach((t) => { toneCount[t] = (toneCount[t] || 0) + 1; }));
  const topTone = Object.entries(toneCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

  const meta: AuditMeta = {
    id,
    url,
    companyName: brandSummary?.companyName || new URL(url).hostname,
    auditor: auditor || 'Unknown',
    date: new Date().toISOString(),
    pageCount: pages.length,
    typeCount: types.size,
    topTone,
  };
  const { error } = await sharedDb().from(T).insert({ id, url, meta, data: { crawlData, brandSummary, linkGraph } });
  if (error) return NextResponse.json({ error: 'Failed to save audit' }, { status: 500 });
  return NextResponse.json({ ok: true, id, meta });
}

// DELETE ?id= - remove a saved audit (the owner only)
export async function DELETE(req: NextRequest) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Only the owner can delete audits.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await sharedDb().from(T).delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to delete audit' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
