import { Router, type IRouter } from "express";
import healthRouter from "./health";
import intelligenceRouter, { briefsRouter } from "./intelligence";
import opsRouter from "./ops";
import trendingRouter from "./trending";

const router: IRouter = Router();

router.use(healthRouter);
router.use(opsRouter);
router.use(trendingRouter);
router.use("/intelligence", intelligenceRouter);
router.use("/briefs", briefsRouter);

export default router;
