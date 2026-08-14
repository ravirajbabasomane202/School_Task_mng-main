import express, { Request, Response } from "express";
import Task from "../models/Task";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

/**
 * GET /api/tasks/escalated
 * Chairman: list all tasks with escalationLevel > 0
 */
router.get(
  "/escalated",
  authenticate,
  authorize(["Chairman"]),
  async (req: Request, res: Response) => {
    try {
      const tasks = await Task.find({ escalationLevel: { $gt: 0 } })
        .populate("assignedTo", "name role department")
        .sort({ escalationLevel: -1, deadline: 1 });
      res.json({ tasks });
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
