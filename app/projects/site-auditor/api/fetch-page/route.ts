import { NextRequest, NextResponse } from 'next/server';
import { isOwner } from '@/lib/owner';

const APIFY_BASE = 'https://api.apify.com/v2';
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 60000;

export const maxDuration = 60;

// Costs money per call (Apify / Claude), so running audits is just for the owner; saved audits are public.
export async function POST(req: NextRequest) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Running audits is just for the owner. Open a saved audit instead.' }, { status: 401 });
  const { url } = await req.json();
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  // Most sites send their content in the HTML, so read the page directly first (free and quick).
  // Apify's headless browser is only the fallback, for pages that build everything in JavaScript.
  const direct = await fetchDirect(url);
  if (direct) return NextResponse.json({ html: direct, via: 'direct' });

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'APIFY_API_TOKEN not configured' }, { status: 500 });
  }

  try {
    // Start the cheerio-scraper actor run
    console.log(`[fetch-page] Starting Apify run for: ${url}`);
    const startRes = await fetch(
      `${APIFY_BASE}/acts/apify~web-scraper/runs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          startUrls: [{ url }],
          maxPagesPerCrawl: 1,
          maxCrawlingDepth: 0,
          pageFunction: `async function pageFunction(context) {
    return { html: document.documentElement.outerHTML };
  }`,
        }),
      }
    );

    const startBody = await startRes.json();
    console.log(`[fetch-page] Start response (${startRes.status}):`, JSON.stringify(startBody));

    if (!startRes.ok) {
      const msg = startBody?.error?.type === 'full-permission-actor-not-approved'
        ? 'This page builds its content in JavaScript, and the Apify web scraper needs its permissions approved in the Apify console before it can read it.'
        : 'Failed to start Apify run';
      return NextResponse.json(
        { error: msg, details: JSON.stringify(startBody) },
        { status: 502 }
      );
    }

    const runId = startBody.data?.id;
    if (!runId) {
      return NextResponse.json(
        { error: 'No run ID returned from Apify', details: JSON.stringify(startBody) },
        { status: 502 }
      );
    }

    console.log(`[fetch-page] Run started: ${runId}`);

    // Poll until the run finishes (60s timeout)
    const deadline = Date.now() + POLL_TIMEOUT;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const pollUrl = `${APIFY_BASE}/acts/apify~web-scraper/runs/${runId}`;
      const statusRes = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const statusBody = await statusRes.json();
      const status = statusBody.data?.status;
      console.log(`[fetch-page] Poll ${runId}: status=${status}`);

      if (!statusRes.ok) {
        console.log(`[fetch-page] Poll error (${statusRes.status}):`, JSON.stringify(statusBody));
        continue;
      }

      if (status === 'SUCCEEDED') {
        const datasetId = statusBody.data?.defaultDatasetId;
        console.log(`[fetch-page] Run succeeded, fetching dataset: ${datasetId}`);

        const itemsRes = await fetch(
          `${APIFY_BASE}/datasets/${datasetId}/items`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const items = await itemsRes.json();
        console.log(`[fetch-page] Dataset returned ${items.length} items`);

        if (items.length > 0) {
          console.log(`[fetch-page] Item keys:`, Object.keys(items[0]));
          const html = items[0].html || items[0].body || items[0].content || items[0].text;
          if (html) {
            return NextResponse.json({ html });
          }
          console.log(`[fetch-page] No known HTML field found. Full item:`, JSON.stringify(items[0]).slice(0, 2000));
        }
        return NextResponse.json(
          { error: 'No HTML in dataset results', details: JSON.stringify(items.slice(0, 1)).slice(0, 2000) },
          { status: 502 }
        );
      }

      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        console.log(`[fetch-page] Run ${status}:`, JSON.stringify(statusBody.data));
        return NextResponse.json(
          { error: `Apify run ${status.toLowerCase()}`, details: JSON.stringify(statusBody.data) },
          { status: 502 }
        );
      }
    }

    console.log(`[fetch-page] Polling timed out after ${POLL_TIMEOUT}ms`);
    return NextResponse.json({ error: 'Apify run timed out after 60s' }, { status: 504 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[fetch-page] Exception:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchDirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiteAuditor/1.0; +https://your-site.com/projects/site-auditor)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return null;
    const html = await res.text();
    // An empty app shell (a div and some scripts) has no readable text and no links: leave it to the browser fallback.
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const links = (html.match(/<a\s[^>]*href=/gi) || []).length;
    return text.length > 200 || links >= 3 ? html : null;
  } catch {
    return null;
  }
}
