import type { IntelligenceBrief } from '@workspace/api-client-react';
import type { ConflictAnalysis, MapEvent, MapEventType, TimelineEventType } from './types';

const PARTY_COLORS = ['#3B78D4', '#4A9B8B', '#C2536A', '#E07B39', '#9B7BC8', '#888888'];
const PERSPECTIVE_COLORS = ['#3B78D4', '#C2536A', '#E07B39', '#9B7BC8', '#4A9B8B'];

function toMapEventType(type: string): MapEventType {
  if (type === 'negotiation') return 'talks';
  if (type === 'humanitarian' || type === 'political') return 'city';
  return 'strike';
}

function toTimelineType(type: string): TimelineEventType {
  if (type === 'strike' || type === 'escalation' || type === 'negotiation') {
    return type as TimelineEventType;
  }
  return 'escalation';
}

/** A place is plotted only when both coordinates are known. */
function hasCoords<T extends { lat: number | null; lng: number | null }>(
  p: T,
): p is T & { lat: number; lng: number } {
  return typeof p.lat === 'number' && typeof p.lng === 'number';
}

/** The most parties shown; the server keeps the same limit for new briefs. */
const MAX_PARTIES = 6;

/**
 * Each party once, at most MAX_PARTIES. Briefs saved before the server
 * removed repeats can list the same few names dozens of times.
 */
export function uniqueParties(actors: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const actor of actors) {
    const name = actor.replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length === MAX_PARTIES) break;
  }
  return out;
}

export function adaptBrief(brief: IntelligenceBrief): ConflictAnalysis {
  const news = brief.sources.filter((s) => s.kind === 'news');

  const mapEvents: MapEvent[] = [];
  if (hasCoords(brief.location)) {
    mapEvents.push({
      lat: brief.location.lat,
      lng: brief.location.lng,
      type: 'strike',
      name: brief.location.city,
      desc: brief.headline,
    });
  }
  for (const e of brief.relatedEvents) {
    if (!hasCoords(e)) continue;
    mapEvents.push({
      lat: e.lat,
      lng: e.lng,
      type: toMapEventType(e.type),
      name: e.title.split(' ').slice(0, 2).join(' '),
      desc: e.description,
    });
  }

  return {
    title: brief.headline,
    location: [brief.location.city, brief.location.country].filter(Boolean).join(', '),
    region: [brief.location.region, brief.location.city].filter(Boolean).join(' · '),
    publishedAt: brief.generatedAt,
    summary: brief.summary,
    keyQuestion: brief.keyQuestion,
    escalationLevel: brief.escalationRisk,
    escalationTag: brief.escalationReason,
    coverage: {
      articles: news.length,
      outlets: new Set(news.map((s) => s.publisher)).size,
      countries: new Set(news.map((s) => s.country).filter(Boolean)).size,
    },
    parties: uniqueParties(brief.actors).map((name, i) => ({
      name,
      color: PARTY_COLORS[i % PARTY_COLORS.length],
    })),
    timeline: brief.relatedEvents.map((e, i) => ({
      date: e.date,
      type: i === brief.relatedEvents.length - 1 ? 'now' : toTimelineType(e.type),
      title: e.title,
      subtitle: e.description,
      detail: e.description,
      lat: e.lat,
      lng: e.lng,
    })),
    perspectives: brief.perspectives.map((p, i) => ({
      label: p.alignment.replace(' ', '\u00A0'),
      actor: p.actor,
      color: PERSPECTIVE_COLORS[i % PERSPECTIVE_COLORS.length],
      quote: p.framing,
      interest: p.interests,
    })),
    mapEvents,
    historicalContext: brief.historicalContext,
    credit:
      brief.sources.length > 0
        ? 'Generated with Claude (Anthropic) from the sources listed below'
        : 'Generated with Claude (Anthropic) from background knowledge; no sources were retrieved',
  };
}
