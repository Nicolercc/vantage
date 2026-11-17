import { Router, type IRouter, type Request } from "express";
import { readyBrief } from "../brief/brief-for";
import { TRENDING_WINDOW_MS } from "../brief/trending";
import type { TrendingService } from "../brief/trending-service";
import type { BriefState } from "../lib/brief-state";
import { sendError } from "../lib/errors";

const router: IRouter = Router();

const service = (req: Request) => req.app.locals["trending"] as TrendingService;
const briefState = (req: Request) => req.app.locals["briefs"] as BriefState;

/**
 * The home page's "Today" topics. A topic carries a brief id only when a
 * reader asking for it now would be served without waiting (the same lookup
 * the brief routes make) and that brief is about a conflict or crisis.
 */
router.get("/trending", async (req, res) => {
  try {
    const snapshot = service(req).current();
    const topics = await Promise.all(
      (snapshot?.topics ?? []).map(async (t) => {
        const brief = await readyBrief(briefState(req), t.label);
        const usable = brief && (brief as { inScope?: boolean }).inScope !== false;
        return {
          label: t.label,
          country: t.country,
          outletCount: t.outletCount,
          newestAt: t.newestAt,
          headline: t.headline,
          briefId: usable ? brief.id : null,
        };
      }),
    );
    // Short: a topic can become ready at any moment.
    res.set("Cache-Control", "public, max-age=60");
    res.json({
      updatedAt: snapshot?.updatedAt ?? null,
      windowHours: TRENDING_WINDOW_MS / 3_600_000,
      outletCount: snapshot?.outletCount ?? 0,
      topics,
    });
  } catch (err) {
    sendError(req, res, err);
  }
});

export default router;
