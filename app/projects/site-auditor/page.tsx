'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    d3: any;
    jspdf: any;
    html2canvas: (el: HTMLElement, opts?: any) => Promise<HTMLCanvasElement>;
  }
}

interface PageContent {
  title: string;
  h1s: string[];
  h2s: string[];
  metaDesc: string;
  bodyText: string;
  imgs: number;
  navLinks: string[];
  ctaTexts: string[];
}

interface PageAnalysis {
  pageType?: string;
  tone?: string[];
  topics?: string[];
  keyMessages?: string[];
  ctas?: string[];
  audienceSignals?: string;
  contentDensity?: string;
  summary?: string;
}

interface CrawlPage {
  url: string;
  content: PageContent;
  analysis: PageAnalysis;
}

interface BrandSummary {
  companyName?: string;
  overallTone?: string;
  brandPersonality?: string[];
  targetAudience?: string;
  coreValueProp?: string;
  contentStrategy?: string;
  strengthsObserved?: string[];
  gapsOrWeaknesses?: string[];
  architectureNotes?: string;
  messagingConsistency?: string;
  rebrandOpportunities?: string[];
  competitivePositioning?: string;
}

interface LogEntry {
  msg: string;
  type: string;
}

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

const typeBadgeColors: Record<string, string> = {
  homepage: 'background:#EBF3FD;color:#1A4F8A',
  about: 'background:#EBF3FD;color:#1A4F8A',
  team: 'background:#EBF3FD;color:#1A4F8A',
  services: 'background:#FDF3E3;color:#7A4D0C',
  product: 'background:#FDF3E3;color:#7A4D0C',
  pricing: 'background:#FDF3E3;color:#7A4D0C',
  blog: 'background:#EBF5E8;color:#1D6B2E',
  'case-study': 'background:#EBF5E8;color:#1D6B2E',
  careers: 'background:#EBF5E8;color:#1D6B2E',
  contact: 'background:#F1EFE8;color:#3D3C38',
  other: 'background:#F1EFE8;color:#3D3C38',
};

function cssStringToStyle(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  css.split(';').forEach((pair) => {
    const [key, val] = pair.split(':').map((s) => s.trim());
    if (key && val) {
      const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      style[camel] = val;
    }
  });
  return style;
}

const typeNodeColors: Record<string, string> = {
  homepage: '#1A1916', about: '#4A6FA5', team: '#4A6FA5',
  services: '#B8860B', product: '#B8860B', pricing: '#B8860B',
  blog: '#2E8B57', 'case-study': '#2E8B57', careers: '#2E8B57',
  contact: '#7A7A7A', other: '#9C9A94',
};

const typeNodeLabels: [string, string][] = [
  ['Homepage / About', '#1A1916'],
  ['Services / Product', '#B8860B'],
  ['Blog / Content', '#2E8B57'],
  ['Other', '#9C9A94'],
];

export default function Home() {
  const [urlInput, setUrlInput] = useState('');
  const [auditorName, setAuditorName] = useState('');
  const [depth, setDepth] = useState(30);
  const [optNav, setOptNav] = useState(true);
  const [optFooter, setOptFooter] = useState(true);
  const [optSubdomains, setOptSubdomains] = useState(false);

  const [crawlData, setCrawlData] = useState<Record<string, CrawlPage>>({});
  const [activePageUrl, setActivePageUrl] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'summary' | 'sitemap' | 'flow'>('summary');
  const [brandSummary, setBrandSummary] = useState<BrandSummary | null>(null);

  const [pastAudits, setPastAudits] = useState<AuditMeta[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'new' | 'past'>('new');

  const [linkGraph, setLinkGraph] = useState<Record<string, string[]>>({});
  const linkGraphRef = useRef<Record<string, string[]>>({});
  const flowRef = useRef<HTMLDivElement>(null);
  const d3ZoomRef = useRef<any>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progressText, setProgressText] = useState('Initializing...');
  const [progressCount, setProgressCount] = useState('0 / 0');
  const [progressPct, setProgressPct] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showStop, setShowStop] = useState(false);
  const [btnText, setBtnText] = useState('Analyze site');

  const shouldStopRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const crawlDataRef = useRef<Record<string, CrawlPage>>({});
  const baseUrlRef = useRef('');
  const baseDomainRef = useRef('');
  const logAreaRef = useRef<HTMLDivElement>(null);

  // Load auditor name from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('auditorName');
    if (saved) setAuditorName(saved);
  }, []);

  useEffect(() => {
    if (auditorName) localStorage.setItem('auditorName', auditorName);
  }, [auditorName]);

  // Load past audits on mount
  useEffect(() => {
    fetch('/projects/site-auditor/api/audits')
      .then((r) => r.json())
      .then((d) => setPastAudits(d.audits || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (logAreaRef.current) {
      logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight;
    }
  }, [logs]);

  const log = useCallback((msg: string, type = '') => {
    setLogs((prev) => [...prev, { msg, type }]);
  }, []);

  // ─── Data fetching functions ──────────────────────────────

  async function fetchPage(url: string, signal?: AbortSignal): Promise<{ html: string; source: 'cache' | 'apify' | '' }> {
    try {
      const cacheRes = await fetch(`/projects/site-auditor/api/cache?url=${encodeURIComponent(url)}`, { signal });
      const cacheData = await cacheRes.json();
      if (cacheData.cached && cacheData.html) return { html: cacheData.html, source: 'cache' };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { html: '', source: '' };
    }
    try {
      const r = await fetch('/projects/site-auditor/api/fetch-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal,
      });
      const d = await r.json();
      const html = d.html || '';
      if (!html && d.error) log(`${url}: ${d.error}`, 'err');
      if (html) {
        fetch('/projects/site-auditor/api/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, html }),
        }).catch(() => {});
      }
      return { html, source: html ? 'apify' : '' };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { html: '', source: '' };
      return { html: '', source: '' };
    }
  }

  function parseLinks(html: string, pageUrl: string): string[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = new Set<string>();
    doc.querySelectorAll('a[href]').forEach((a) => {
      try {
        const href = new URL(a.getAttribute('href')!, pageUrl);
        const sameHost = href.hostname === baseDomainRef.current;
        const subOk = optSubdomains && href.hostname.endsWith('.' + baseDomainRef.current);
        if (sameHost || subOk) {
          const clean = href.origin + (href.pathname.replace(/\/$/, '') || '/');
          if (!/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|css|js|ico|woff|ttf|mp4|mp3)$/i.test(clean)) {
            links.add(clean);
          }
        }
      } catch { /* skip */ }
    });
    return [...links];
  }

  function extractContent(html: string): PageContent {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      title: doc.querySelector('title')?.textContent?.trim() || '',
      h1s: [...doc.querySelectorAll('h1')].map((h) => h.textContent!.trim()).filter(Boolean),
      h2s: [...doc.querySelectorAll('h2')].map((h) => h.textContent!.trim()).filter(Boolean).slice(0, 10),
      metaDesc: doc.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      bodyText: (doc.body?.innerText || doc.body?.textContent || '').replace(/\s+/g, ' ').slice(0, 3000),
      imgs: doc.querySelectorAll('img').length,
      navLinks: [...doc.querySelectorAll('nav a')].map((a) => a.textContent!.trim()).filter(Boolean).slice(0, 10),
      ctaTexts: [...doc.querySelectorAll('button, a[class*="btn"], a[class*="cta"], a[class*="button"]')]
        .map((a) => a.textContent!.trim()).filter((t) => t.length > 1 && t.length < 60).slice(0, 8),
    };
  }

  async function analyzePage(url: string, c: PageContent): Promise<PageAnalysis> {
    try {
      const r = await fetch('/projects/site-auditor/api/analyze-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title: c.title, h1s: c.h1s, h2s: c.h2s, metaDesc: c.metaDesc, navLinks: c.navLinks, ctaTexts: c.ctaTexts, bodyText: c.bodyText }),
      });
      return await r.json();
    } catch {
      return { pageType: 'other', tone: [], topics: [], keyMessages: [], ctas: [], audienceSignals: '', contentDensity: 'moderate', summary: 'Could not analyze this page.' };
    }
  }

  async function generateBrandSummary(data: Record<string, CrawlPage>): Promise<BrandSummary | null> {
    const pages = Object.values(data).map((p) => ({ url: p.url, analysis: p.analysis }));
    try {
      const r = await fetch('/projects/site-auditor/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages }),
      });
      const d = await r.json();
      if (d.error) return null;
      return d;
    } catch { return null; }
  }

  // ─── Crawl loop ───────────────────────────────────────────

  async function startCrawl() {
    const raw = urlInput.trim();
    if (!raw) return;
    // Crawling and analysis cost money per page, so only the owner can run new audits
    const who = await fetch('/projects/api/owner').then((r) => r.json()).catch(() => ({ owner: false }));
    if (!who.owner) {
      setShowProgress(true); setLogs([]);
      log('New audits are just for the owner.', 'err');
      return;
    }
    let start = raw.startsWith('http') ? raw : 'https://' + raw;
    start = start.replace(/\/$/, '');

    try {
      const p = new URL(start);
      baseDomainRef.current = p.hostname;
      baseUrlRef.current = p.origin;
      // Same shape as the links the crawler finds, so the home page isn't crawled twice ("x.com" and "x.com/").
      start = p.origin + (p.pathname.replace(/\/$/, '') || '/');
    } catch { alert('Invalid URL'); return; }

    const maxPages = depth;
    const newCrawlData: Record<string, CrawlPage> = {};
    crawlDataRef.current = newCrawlData;
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;
    const queue = [start];
    const visited = new Set<string>();
    shouldStopRef.current = false;
    const newLinkGraph: Record<string, string[]> = {};
    linkGraphRef.current = newLinkGraph;

    setCrawlData({}); setLinkGraph({}); setActivePageUrl(null); setBrandSummary(null);
    setIsRunning(true); setShowStop(true); setShowProgress(true); setLogs([]); setBtnText('Analyzing...');
    log('Crawling ' + baseDomainRef.current, 'info');

    let processed = 0;
    while (queue.length > 0 && visited.size < maxPages && !shouldStopRef.current) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      const path = url.replace(baseUrlRef.current, '') || '/';
      setProgressText(path);
      setProgressCount(`${processed} / ${Math.min(maxPages, processed + queue.length + 1)}`);
      setProgressPct(Math.min(maxPages, processed + queue.length + 1) > 0 ? Math.round((processed / Math.min(maxPages, processed + queue.length + 1)) * 100) : 0);
      log('Fetching: ' + path);

      const result = await fetchPage(url, signal);
      if (shouldStopRef.current) break;
      if (!result.html) { log('Failed: ' + path, 'err'); continue; }
      const html = result.html;

      log(`Got page (${Math.round(html.length / 1024)}kb)${result.source === 'cache' ? ' [cached]' : ''}`, 'info');
      const content = extractContent(html);
      log('Analyzing: ' + (content.title || path));

      const analysis = await analyzePage(url, content);
      if (shouldStopRef.current) break;
      newCrawlData[url] = { url, content, analysis };
      crawlDataRef.current = { ...newCrawlData };
      processed++;

      const childLinks = parseLinks(html, url);
      newLinkGraph[url] = childLinks.filter((l) => !visited.has(l) || newCrawlData[l]);
      linkGraphRef.current = { ...newLinkGraph };
      childLinks.forEach((link) => { if (!visited.has(link) && !queue.includes(link)) queue.push(link); });

      log('Done ' + (content.title || path) + ' [' + (analysis.pageType || '?') + ']', 'ok');
      setCrawlData({ ...newCrawlData }); setLinkGraph({ ...newLinkGraph });
    }

    log('Generating brand report...', 'info');
    setProgressText('Generating brand report...');
    setProgressCount(`${processed} / ${processed}`); setProgressPct(100);
    const summary = await generateBrandSummary(newCrawlData);
    setBrandSummary(summary);
    if (!summary) {
      log('The brand report did not come back, so this audit was not saved. Run it again.', 'err');
      setProgressText('Brand report failed, not saved');
      setIsRunning(false); setShowStop(false); setBtnText('Re-analyze');
      setCurrentView('summary');
      return;
    }

    if (Object.keys(newCrawlData).length > 0) {
      log('Saving audit...', 'info');
      try {
        const saveRes = await fetch('/projects/site-auditor/api/audits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: start, auditor: auditorName || 'Unknown', crawlData: newCrawlData, brandSummary: summary, linkGraph: newLinkGraph }),
        });
        const saveData = await saveRes.json();
        if (saveData.meta) setPastAudits((prev) => [saveData.meta, ...prev]);
        log('Audit saved', 'ok');
      } catch { log('Failed to save audit', 'err'); }
    }

    setProgressText(`Complete - ${processed} pages`);
    setIsRunning(false); setShowStop(false); setBtnText('Re-analyze');
    setCurrentView('summary');
  }

  function stopCrawl() {
    shouldStopRef.current = true;
    abortControllerRef.current?.abort();
    log('Stopping crawl...', 'info');
  }

  async function loadAudit(id: string) {
    setLoadingAudit(true);
    try {
      const r = await fetch(`/projects/site-auditor/api/audits?id=${id}`);
      const data = await r.json();
      if (data.error) { setLoadingAudit(false); return; }
      setCrawlData(data.crawlData || {}); setBrandSummary(data.brandSummary || null);
      setLinkGraph(data.linkGraph || {}); crawlDataRef.current = data.crawlData || {};
      linkGraphRef.current = data.linkGraph || {};
      const urls = Object.keys(data.crawlData || {});
      if (urls.length > 0) {
        try { const u = new URL(urls[0]); baseUrlRef.current = u.origin; baseDomainRef.current = u.hostname; } catch {}
      }
      setActivePageUrl(null);
      setCurrentView('summary');
    } catch {}
    setLoadingAudit(false);
  }

  function selectPage(url: string) {
    setActivePageUrl(url);
  }

  function closeDetail() {
    setActivePageUrl(null);
  }

  // ─── Derived values ───────────────────────────────────────

  const pages = Object.values(crawlData);
  const typeSet = new Set(pages.map((p) => p.analysis?.pageType).filter(Boolean));
  const toneCount: Record<string, number> = {};
  pages.forEach((p) => (p.analysis?.tone || []).forEach((t) => { toneCount[t] = (toneCount[t] || 0) + 1; }));
  const topTone = Object.entries(toneCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '\u2014';

  const activePage = activePageUrl ? crawlData[activePageUrl] : null;
  const ap = activePage?.analysis || ({} as PageAnalysis);
  const ac = activePage?.content || ({} as PageContent);
  const activePath = activePageUrl ? activePageUrl.replace(baseUrlRef.current, '') || '/' : '/';
  const activeType = ap.pageType || 'other';
  const activeTypeStyle = cssStringToStyle(typeBadgeColors[activeType] || typeBadgeColors.other);
  const headings = [...(ac.h1s || []).map((h) => ['H1', h] as const), ...(ac.h2s || []).slice(0, 6).map((h) => ['H2', h] as const)];

  const summaryPages = pages.length;
  const summaryTypes = typeSet.size;

  // ─── D3 Flow chart ────────────────────────────────────────

  useEffect(() => {
    if (currentView !== 'flow' || pages.length === 0 || !flowRef.current) return;
    const d3 = window.d3;
    if (!d3) return;

    const container = flowRef.current;
    container.innerHTML = '';

    interface TreeNode { url: string; children: TreeNode[] }
    const baseUrl = baseUrlRef.current;
    const firstUrl = pages[0]?.url;
    const crawledUrls = new Set(pages.map((p) => p.url));

    // Collect all discovered (but not crawled) URLs from link graph
    const allDiscovered = new Set<string>();
    Object.values(linkGraph).forEach((links) => links.forEach((l) => { if (!crawledUrls.has(l)) allDiscovered.add(l); }));

    function buildTree(rootUrl: string, visited: Set<string>): TreeNode {
      visited.add(rootUrl);
      // Include both crawled and discovered children
      const childUrls = (linkGraph[rootUrl] || []).filter((u) => (crawledUrls.has(u) || allDiscovered.has(u)) && !visited.has(u));
      return { url: rootUrl, children: childUrls.map((u) => buildTree(u, visited)) };
    }
    const tree = buildTree(firstUrl, new Set());
    const inTree = new Set<string>();
    function collectUrls(node: TreeNode) { inTree.add(node.url); node.children.forEach(collectUrls); }
    collectUrls(tree);
    // Add orphan crawled pages
    pages.forEach((p) => { if (!inTree.has(p.url)) tree.children.push({ url: p.url, children: [] }); });

    const nodeW = 150, nodeH = 48;
    const root = d3.hierarchy(tree, (d: TreeNode) => d.children);
    const treeLayout = d3.tree().nodeSize([nodeW + 24, nodeH + 70]);
    treeLayout(root);

    // Bounds
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    root.each((d: any) => { xMin = Math.min(xMin, d.x); xMax = Math.max(xMax, d.x); yMin = Math.min(yMin, d.y); yMax = Math.max(yMax, d.y); });

    const treeW = (xMax - xMin) + nodeW + 80;
    const treeH = (yMax - yMin) + nodeH + 80;
    const cw = container.clientWidth;
    const ch = container.clientHeight || 500;

    const svg = d3.select(container).append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block');

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.15, 2])
      .on('zoom', (event: any) => g.attr('transform', event.transform));
    svg.call(zoom);
    d3ZoomRef.current = { svg, zoom };

    const g = svg.append('g');

    // Draw links
    g.selectAll('.flow-link').data(root.links()).enter().append('path')
      .attr('d', (d: any) => {
        const sx = d.source.x + nodeW / 2, sy = d.source.y + nodeH;
        const tx = d.target.x + nodeW / 2, ty = d.target.y;
        const my = (sy + ty) / 2;
        return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
      })
      .attr('fill', 'none').attr('stroke', '#D0CEC8').attr('stroke-width', 1.5);

    // Draw nodes
    const nodes = g.selectAll('.flow-node').data(root.descendants()).enter().append('g')
      .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (_: any, d: any) => { if (crawledUrls.has(d.data.url)) { setActivePageUrl(d.data.url); setCurrentView('sitemap'); } });

    nodes.append('rect').attr('width', nodeW).attr('height', nodeH).attr('rx', 8)
      .attr('fill', (d: any) => crawledUrls.has(d.data.url) ? '#FFFFFF' : '#F8F7F5')
      .attr('stroke', (d: any) => {
        if (!crawledUrls.has(d.data.url)) return '#C8C6C0';
        const t = crawlData[d.data.url]?.analysis?.pageType || 'other';
        return typeNodeColors[t] || typeNodeColors.other;
      })
      .attr('stroke-width', (d: any) => crawledUrls.has(d.data.url) ? 2 : 1.5)
      .attr('stroke-dasharray', (d: any) => crawledUrls.has(d.data.url) ? 'none' : '4,3');

    // Color bar only for crawled nodes
    nodes.filter((d: any) => crawledUrls.has(d.data.url))
      .append('rect').attr('width', nodeW).attr('height', 4).attr('rx', 2)
      .attr('fill', (d: any) => { const t = crawlData[d.data.url]?.analysis?.pageType || 'other'; return typeNodeColors[t] || typeNodeColors.other; });

    // Path label (all nodes)
    nodes.append('text').attr('x', 10).attr('y', (d: any) => crawledUrls.has(d.data.url) ? 20 : 26).attr('font-size', '9px')
      .attr('font-family', "'DM Mono', monospace").attr('font-weight', '500')
      .attr('fill', (d: any) => crawledUrls.has(d.data.url) ? '#1A1916' : '#9C9A94')
      .text((d: any) => { const p = d.data.url.replace(baseUrl, '') || '/'; return p.length > 20 ? p.slice(0, 18) + '..' : p; });

    // Title label (crawled only)
    nodes.filter((d: any) => crawledUrls.has(d.data.url))
      .append('text').attr('x', 10).attr('y', 35).attr('font-size', '9px')
      .attr('font-family', "'DM Sans', sans-serif").attr('fill', '#6B6860')
      .text((d: any) => { const t = crawlData[d.data.url]?.content?.title || ''; return t.length > 20 ? t.slice(0, 18) + '..' : t; });

    // Fit to viewport
    const scale = Math.min(cw / treeW, ch / treeH, 1) * 0.9;
    const tx = cw / 2 - ((xMin + xMax) / 2 + nodeW / 2) * scale;
    const ty = 30 * scale;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));

  }, [currentView, pages, linkGraph, crawlData]);

  function zoomFlow(action: 'in' | 'out' | 'reset') {
    const ref = d3ZoomRef.current;
    if (!ref) return;
    const d3 = window.d3;
    const { svg, zoom } = ref;
    if (action === 'in') svg.transition().duration(300).call(zoom.scaleBy, 1.4);
    else if (action === 'out') svg.transition().duration(300).call(zoom.scaleBy, 0.7);
    else {
      // Re-trigger the fit
      const container = flowRef.current;
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight || 500;
      // Reset to initial
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(cw / 2, 20).scale(0.5));
    }
  }

  // ─── PDF export ───────────────────────────────────────────

  async function exportPdf() {
    console.log('[exportPdf] called');
    if (!brandSummary) { console.error('[exportPdf] no brandSummary available'); return; }
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = 210, margin = 20, cw = pw - margin * 2;
    let y = margin;

    const addText = (text: string, size: number, color: [number, number, number], weight: string, maxW?: number) => {
      doc.setFontSize(size); doc.setTextColor(...color);
      doc.setFont('helvetica', weight === 'bold' ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text || '\u2014', maxW || cw);
      if (y + lines.length * (size * 0.4) > 275) { addFooter(); doc.addPage(); y = margin; }
      doc.text(lines, margin, y); y += lines.length * (size * 0.45) + 2;
    };
    const addSection = (title: string, content: string | string[] | undefined) => {
      if (y > 250) { addFooter(); doc.addPage(); y = margin; }
      y += 4; addText(title.toUpperCase(), 9, [156, 154, 148], 'bold'); y -= 1;
      if (Array.isArray(content)) (content || []).forEach((item) => addText('  \u2022  ' + item, 10, [107, 104, 96], 'normal'));
      else addText(content || '\u2014', 10, [107, 104, 96], 'normal');
      y += 2;
    };
    const addFooter = () => { doc.setFontSize(8); doc.setTextColor(156, 154, 148); doc.setFont('helvetica', 'normal'); doc.text('Hei by TOPPAN NEXT', pw / 2, 290, { align: 'center' }); };

    addText('Brand Audit', 24, [26, 25, 22], 'bold'); y += 2;
    addText(brandSummary.companyName || 'Company', 18, [26, 25, 22], 'bold'); y += 4;
    addText(brandSummary.overallTone || '', 11, [107, 104, 96], 'normal'); y += 6;
    addText(`${summaryPages} pages analyzed  |  ${summaryTypes} page types  |  ${brandSummary.messagingConsistency?.split(' ')[0] || '\u2014'} message consistency`, 10, [107, 104, 96], 'normal');
    y += 4; doc.setDrawColor(229, 227, 222); doc.line(margin, y, pw - margin, y); y += 8;

    addSection('Target Audience', brandSummary.targetAudience);
    addSection('Core Value Proposition', brandSummary.coreValueProp);
    addSection('Brand Personality', brandSummary.brandPersonality);
    addSection('Messaging Consistency', brandSummary.messagingConsistency);
    addSection('Content Strategy', brandSummary.contentStrategy);
    addSection('Site Architecture', brandSummary.architectureNotes);
    addSection('Competitive Positioning', brandSummary.competitivePositioning);
    addSection('Strengths Observed', brandSummary.strengthsObserved);
    addSection('Gaps & Weaknesses', brandSummary.gapsOrWeaknesses);
    addSection('Rebrand Opportunities', brandSummary.rebrandOpportunities);
    addFooter();

    const filename = (brandSummary.companyName || 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    doc.save(`${filename}-brand-audit.pdf`);
  }

  // ─── Render helpers ───────────────────────────────────────

  function renderSummaryCard(title: string, content: string | string[] | undefined, cls: string, type: 'text' | 'tags' | 'list') {
    return (
      <div className={`summary-card ${cls}`} key={title}>
        <h3>{title}</h3>
        {type === 'text' && <p>{content as string}</p>}
        {type === 'tags' && <div className="tag-wrap">{((content as string[]) || []).map((t, i) => <span className="tag" key={i}>{t}</span>)}</div>}
        {type === 'list' && <ul className={`list-items ${cls}`}>{((content as string[]) || []).map((item, i) => <li key={i}>{item}</li>)}</ul>}
      </div>
    );
  }

  function renderTagsOrDash(items: string[] | undefined, cls: string) {
    if (!items || items.length === 0) return <span style={{ fontSize: 12, color: 'var(--text3)' }}>{'\u2014'}</span>;
    return items.map((t, i) => <span key={i} className={`tag ${cls}`}>{t}</span>);
  }

  // ─── JSX ──────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* ─── Sidebar ─── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-mark">
              <svg viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" rx="1"/><rect x="8" y="1" width="5" height="5" rx="1"/><rect x="1" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/></svg>
            </div>
            <span>Site Auditor</span>
          </div>
          <div className="sidebar-tagline">Architecture &amp; brand analysis</div>
        </div>

        {/* Sidebar tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {(['new', 'past'] as const).map((tab) => (
            <button key={tab} onClick={() => setSidebarTab(tab)} style={{
              flex: 1, padding: '11px 0', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              border: 'none', cursor: 'pointer', letterSpacing: '0.02em',
              background: sidebarTab === tab ? 'var(--surface)' : 'var(--surface2)',
              color: sidebarTab === tab ? 'var(--text)' : 'var(--text3)',
              borderBottom: sidebarTab === tab ? '2px solid var(--text)' : '2px solid transparent',
              transition: 'color 0.15s',
            }}>
              {tab === 'new' ? 'New Audit' : 'Past Audits'}
            </button>
          ))}
        </div>

        {/* New Audit tab content */}
        {sidebarTab === 'new' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="sidebar-section">
              <label>Website URL</label>
              <input type="url" placeholder="https://company.com" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
            </div>
            <div className="sidebar-section">
              <label>Your name</label>
              <input type="text" placeholder="e.g. the owner" value={auditorName} onChange={(e) => setAuditorName(e.target.value)} />
            </div>
            <div className="sidebar-section">
              <label>Crawl depth</label>
              <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
                <option value={5}>Up to 5 pages</option>
                <option value={10}>Up to 10 pages</option>
                <option value={15}>Up to 15 pages</option>
                <option value={30}>Up to 30 pages</option>
                <option value={50}>Up to 50 pages</option>
                <option value={100}>Up to 100 pages</option>
              </select>
            </div>
            <div className="sidebar-section">
              <label>Options</label>
              <label className="checkbox-row"><input type="checkbox" checked={optNav} onChange={(e) => setOptNav(e.target.checked)} /><span>Follow nav links</span></label>
              <label className="checkbox-row"><input type="checkbox" checked={optFooter} onChange={(e) => setOptFooter(e.target.checked)} /><span>Follow footer links</span></label>
              <label className="checkbox-row"><input type="checkbox" checked={optSubdomains} onChange={(e) => setOptSubdomains(e.target.checked)} /><span>Include subdomains</span></label>
            </div>
            <div className="sidebar-section">
              <button className="btn-analyze" disabled={isRunning} onClick={startCrawl}>
                <span>{btnText}</span>
                {isRunning && <div className="spinner" />}
              </button>
              {showStop && <button className="btn-stop" onClick={stopCrawl}>&#x25A0; Stop crawl</button>}
            </div>
            {showProgress && (
              <div className="progress-section" style={{ display: 'block' }}>
                <div className="progress-header"><span>{progressText}</span><span>{progressCount}</span></div>
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: progressPct + '%' }} /></div>
                <div className="log-area" ref={logAreaRef}>
                  {logs.map((l, i) => <div key={i} className={`log-line ${l.type}`}>{l.msg}</div>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Past Audits tab content */}
        {sidebarTab === 'past' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingAudit && (
              <div style={{ padding: '24px 20px', color: 'var(--text3)', fontSize: 12, textAlign: 'center' }}>Loading audit...</div>
            )}
            {pastAudits.length === 0 && !loadingAudit && (
              <div style={{ padding: '24px 20px', color: 'var(--text3)', fontSize: 12, lineHeight: 1.6 }}>
                No past audits yet. Run your first crawl to see it here.
              </div>
            )}
            {pastAudits.map((audit) => (
              <div key={audit.id} onClick={() => loadAudit(audit.id)}
                style={{ padding: '12px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{audit.companyName}</div>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--blue-text)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{audit.url}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)' }}>
                  <span><strong style={{ color: 'var(--text)', fontWeight: 600 }}>{audit.pageCount}</strong> pages</span>
                  <span>{audit.auditor}</span>
                  <span>{new Date(audit.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ─── Main ─── */}
      <main className="main">
        <div className="topbar">
          <div className="topbar-tabs">
            {(['summary', 'sitemap', 'flow'] as const).map((view) => (
              <div key={view} className={`topbar-tab ${currentView === view ? 'active' : ''}`} onClick={() => setCurrentView(view)}>
                {{ summary: 'Brand report', sitemap: 'Sitemap', flow: 'Flow view' }[view]}
              </div>
            ))}
          </div>
          {pages.length > 0 && (
            <div className="topbar-meta">
              <div className="metric-pill"><strong>{pages.length}</strong> pages</div>
              <div className="metric-pill"><strong>{typeSet.size}</strong> types</div>
              <div className="metric-pill"><strong style={{ fontWeight: 400, fontStyle: 'italic', color: 'var(--text2)' }}>{topTone}</strong></div>
            </div>
          )}
        </div>

        <div className="content-area">
          {/* Empty state */}
          {pages.length === 0 && currentView !== 'summary' && (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/>
                </svg>
              </div>
              <p>Enter a URL in the sidebar to begin</p>
              <span>The analyzer will crawl each page, study its content,<br/>tone and structure, then generate a full brand report.</span>
            </div>
          )}

          {/* ─── Sitemap: grid + detail panel ─── */}
          {currentView === 'sitemap' && pages.length > 0 && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Card list */}
              <div style={{ width: activePage ? 260 : '100%', flexShrink: 0, transition: 'width 0.2s' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pages.map((page) => {
                    const path = page.url.replace(baseUrlRef.current, '') || '/';
                    const type = page.analysis?.pageType || 'other';
                    return (
                      <div key={page.url} className={`page-tile ${page.url === activePageUrl ? 'active' : ''}`} onClick={() => selectPage(page.url)}>
                        <div className="pt-path">{path}</div>
                        {!activePage && <div className="pt-title">{page.content.title || '\u2014'}</div>}
                        <div className="pt-badges">
                          <span className={`badge badge-type-${type}`}>{type}</span>
                          {!activePage && (page.analysis?.tone || []).slice(0, 2).map((t, i) => <span key={i} className="badge badge-tone">{t}</span>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detail panel */}
              {activePage && (
                <div style={{ flex: '1 1 auto', minWidth: 0, position: 'relative', alignSelf: 'flex-start' }}>
                  <button onClick={closeDetail} style={{ position: 'absolute', top: 14, right: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 16, color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }} title="Close">&times;</button>

                  {/* Header */}
                  <div className="page-detail-header" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                    <div className="pd-type" style={{ ...activeTypeStyle, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center' }}>{activeType}</div>
                    <h2>{ac.title || activePath}</h2>
                    <div className="pd-url">{activePageUrl}</div>
                  </div>

                  {/* Detail cards in standard grid */}
                  <div className="detail-grid">
                    <div className="detail-card full">
                      <div className="dc-label"><div className="dc-label-dot"/>Summary</div>
                      <div className="dc-text">{ap.summary || '\u2014'}</div>
                    </div>
                    <div className="detail-card">
                      <div className="dc-label"><div className="dc-label-dot"/>Tone of voice</div>
                      <div className="tag-wrap">{renderTagsOrDash(ap.tone, 'tone')}</div>
                    </div>
                    <div className="detail-card">
                      <div className="dc-label"><div className="dc-label-dot"/>Audience signal</div>
                      <div className="dc-text">{ap.audienceSignals || '\u2014'}</div>
                    </div>
                    <div className="detail-card">
                      <div className="dc-label"><div className="dc-label-dot"/>Key messages</div>
                      <div className="tag-wrap">{renderTagsOrDash(ap.keyMessages, 'message')}</div>
                    </div>
                    <div className="detail-card">
                      <div className="dc-label"><div className="dc-label-dot"/>Topics</div>
                      <div className="tag-wrap">{renderTagsOrDash(ap.topics, 'topic')}</div>
                    </div>
                    <div className="detail-card">
                      <div className="dc-label"><div className="dc-label-dot"/>Calls to action</div>
                      <div className="tag-wrap">{renderTagsOrDash(ap.ctas, 'cta')}</div>
                    </div>
                    <div className="detail-card">
                      <div className="dc-label"><div className="dc-label-dot"/>Page headings</div>
                      <ul className="h-list">
                        {headings.length > 0
                          ? headings.map(([lvl, txt], i) => <li key={i}><span className="h-marker">{lvl}</span>{txt}</li>)
                          : <li style={{ color: 'var(--text3)' }}>No headings found</li>}
                      </ul>
                    </div>
                    <div className="detail-card">
                      <div className="stats-row" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
                        <div className="stat-item"><strong>{ac.imgs ?? 0}</strong>Images</div>
                        <div className="stat-item"><strong>{ac.h1s?.length || 0}</strong>H1s</div>
                        <div className="stat-item"><strong>{ac.h2s?.length || 0}</strong>H2s</div>
                        <div className="stat-item"><strong style={{ fontSize: 13, fontWeight: 500 }}>{ap.contentDensity || '\u2014'}</strong>Density</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Flow view ─── */}
          {currentView === 'flow' && pages.length > 0 && (
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: 'var(--text3)', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  {typeNodeLabels.map(([label, borderColor]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, border: `2px solid ${borderColor}`, background: 'white' }} />
                      {label}
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, border: '1.5px dashed #C8C6C0', background: '#F8F7F5' }} />
                    Discovered, not crawled
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['in', 'out', 'reset'] as const).map((action) => (
                    <button key={action} onClick={() => zoomFlow(action)} style={{
                      padding: '4px 10px', fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
                      border: '1px solid var(--border2)', borderRadius: 5, cursor: 'pointer',
                      background: 'var(--surface)', color: 'var(--text2)',
                    }}>
                      {action === 'in' ? '+' : action === 'out' ? '\u2013' : 'Fit'}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={flowRef} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12,
                height: 'calc(100vh - 160px)', overflow: 'hidden',
              }} />
            </div>
          )}

          {/* ─── Brand report ─── */}
          {currentView === 'summary' && (
            <div>
              {!brandSummary && pages.length > 0 && (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{isRunning ? 'Generating brand report...' : 'The brand report did not come back. Run the audit again.'}</div>
              )}
              {brandSummary && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button onClick={exportPdf} style={{ padding: '8px 16px', fontSize: 12, fontFamily: 'inherit', fontWeight: 500, border: '1px solid var(--border2)', borderRadius: 6, cursor: 'pointer', background: 'var(--text)', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9v2.5a1 1 0 001 1h6a1 1 0 001-1V9M7 1.5v8M4.5 7L7 9.5 9.5 7"/></svg>
                      Export PDF
                    </button>
                  </div>
                  <div className="summary-masthead">
                    <div className="sm-eyebrow">Brand audit</div>
                    <h2>{brandSummary.companyName || 'Company'}</h2>
                    <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{brandSummary.overallTone || '\u2014'}</p>
                    <div className="sm-metrics">
                      <div className="sm-metric"><strong>{summaryPages}</strong> pages analyzed</div>
                      <div className="sm-metric"><strong>{summaryTypes}</strong> page types</div>
                      <div className="sm-metric"><strong>{brandSummary.messagingConsistency?.split(' ')[0] || '\u2014'}</strong> message consistency</div>
                    </div>
                  </div>
                  <div className="summary-grid">
                    {renderSummaryCard('Target audience', brandSummary.targetAudience, '', 'text')}
                    {renderSummaryCard('Core value proposition', brandSummary.coreValueProp, '', 'text')}
                    {renderSummaryCard('Brand personality', brandSummary.brandPersonality, '', 'tags')}
                    {renderSummaryCard('Messaging consistency', brandSummary.messagingConsistency, '', 'text')}
                    {renderSummaryCard('Content strategy', brandSummary.contentStrategy, 'full', 'text')}
                    {renderSummaryCard('Site architecture', brandSummary.architectureNotes, 'full', 'text')}
                    {renderSummaryCard('Competitive positioning', brandSummary.competitivePositioning, 'full', 'text')}
                    {renderSummaryCard('Strengths observed', brandSummary.strengthsObserved, 'strengths', 'list')}
                    {renderSummaryCard('Gaps and weaknesses', brandSummary.gapsOrWeaknesses, 'gaps', 'list')}
                    {renderSummaryCard('Rebrand opportunities', brandSummary.rebrandOpportunities, 'opps', 'list')}
                  </div>
                </>
              )}
              {!brandSummary && pages.length === 0 && (
                <div className="empty-state"><p>Run a crawl first to generate a brand report</p></div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
