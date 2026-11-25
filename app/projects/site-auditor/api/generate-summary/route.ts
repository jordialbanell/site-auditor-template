import { NextRequest, NextResponse } from 'next/server';
import { isOwner } from '@/lib/owner';

export const maxDuration = 60;

// Costs money per call (Apify / Claude), so running audits is just for the owner; saved audits are public.
export async function POST(req: NextRequest) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Running audits is just for the owner. Open a saved audit instead.' }, { status: 401 });
  const { pages } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return NextResponse.json({ error: 'No pages provided' }, { status: 400 });
  }

  const desc = pages
    .map(
      (p: { url: string; analysis?: { pageType?: string; tone?: string[]; keyMessages?: string[]; summary?: string } }) =>
        `${p.url} | type:${p.analysis?.pageType} | tone:${p.analysis?.tone?.join(',')} | messages:${p.analysis?.keyMessages?.join('/')} | summary:${p.analysis?.summary}`
    )
    .join('\n');

  const prompt = `You are a senior brand strategist writing a brand audit for a rebrand pitch. Based on ${pages.length} pages analyzed, respond ONLY with a valid JSON object, no markdown, and no em dashes or en dashes anywhere:
{"companyName":"inferred name","overallTone":"2-3 sentences on brand voice","brandPersonality":["5-7 adjectives"],"targetAudience":"specific description","coreValueProp":"1-2 sentences","contentStrategy":"how they use content","strengthsObserved":["3-5 strengths"],"gapsOrWeaknesses":["3-5 gaps or weaknesses"],"architectureNotes":"how site is organized, is it logical?","messagingConsistency":"high/medium/low and why","rebrandOpportunities":["3-5 specific rebrand opportunities"],"competitivePositioning":"how they position vs competitors"}

Pages:\n${desc}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const d = await r.json();
    if (!r.ok) {
      console.error('[generate-summary] Anthropic error:', JSON.stringify(d));
      return NextResponse.json({ error: 'Anthropic API error', details: JSON.stringify(d) }, { status: 502 });
    }

    const txt = d.content?.[0]?.text || '{}';
    const summary = readJson(txt);
    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[generate-summary] Exception:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// The model's JSON, with any fence or stray text around it ignored, and no em or en dashes in the text.
function readJson(txt: string) {
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('No JSON in the reply');
  const undash = (v: unknown): unknown =>
    typeof v === 'string' ? v.replace(/\s*[\u2014\u2013]\s*/g, ', ') : Array.isArray(v) ? v.map(undash)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, undash(x)])) : v;
  return undash(JSON.parse(txt.slice(a, b + 1)));
}
