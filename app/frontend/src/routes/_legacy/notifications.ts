import express, { Request, Response } from "express";
import Notification from "../models/Notification";
import { authenticate } from "../middleware/auth";

const router = express.Router();

/** GET /api/notifications — current user's notifications, newest first */
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      read: false,
    });

    res.json({ notifications, unreadCount });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

/** PUT /api/notifications/read-all — mark all as read for current user */
router.put("/read-all", authenticate, async (req: Request, res: Response) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.json({ message: "All notifications marked as read" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

/** PUT /api/notifications/:id/read — mark single notification as read */
router.put("/:id/read", authenticate, async (req: Request, res: Response) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { read: true } }
    );
    res.json({ message: "Notification marked as read" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
