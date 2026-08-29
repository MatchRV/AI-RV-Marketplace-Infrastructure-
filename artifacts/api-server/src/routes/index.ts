import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import listingsRouter from "./listings";
import outfitterRouter from "./outfitter";
import matchReportRouter from "./match-report";
import searchRouter from "./search";
import analyticsRouter from "./analytics";
import userRouter from "./user";
import siteRouter from "./site";
import tripsRouter from "./trips";
import leadsRouter from "./leads";
import importRouter from "./import";
import generateDescriptionRouter from "./generate-description";
import agentRouter from "./agent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(userRouter);
router.use(listingsRouter);
router.use(outfitterRouter);
router.use(matchReportRouter);
router.use(searchRouter);
router.use(analyticsRouter);
router.use(siteRouter);
router.use(tripsRouter);
router.use(leadsRouter);
router.use(importRouter);
router.use(generateDescriptionRouter);
router.use(agentRouter);

export default router;
