import express, { Request, Response } from "express";
import Task from "../models/Task";
import { authenticate, authorize } from "../middleware/auth";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

const getPeriodRange = (type: "daily" | "weekly" | "monthly") => {
  const now = new Date();
  const start = new Date(now);
  if (type === "daily") start.setHours(0, 0, 0, 0);
  else if (type === "weekly") start.setDate(now.getDate() - 7);
  else start.setMonth(now.getMonth() - 1);
  return { start, end: now };
};

const periodLabel = (type: "daily" | "weekly" | "monthly") => {
  const { start, end } = getPeriodRange(type);
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
};

// ─── MIS Summary ────────────────────────────────────────────────────────────

/**
 * GET /api/reports/mis?type=daily|weekly|monthly
 */
router.get(
  "/mis",
  authenticate,
  authorize(["Chairman"]),
  async (req: Request, res: Response) => {
    try {
      const type = (req.query.type as string) || "daily";
      const { start, end } = getPeriodRange(type as any);
      const now = new Date();

      const tasks = await Task.find({
        createdAt: { $gte: start, $lte: end },
      });

      const summary = {
        totalTasks: tasks.length,
        completed: tasks.filter((t) => t.status === "Completed").length,
        pending: tasks.filter((t) => t.status === "Pending").length,
        inProgress: tasks.filter((t) => t.status === "In Progress").length,
        delayed: tasks.filter((t) => {
          const deadline = new Date(t.deadline);
          return t.status !== "Completed" && deadline < now;
        }).length,
        period: periodLabel(type as any),
        generatedAt: new Date().toISOString(),
      };

      res.json({ summary });
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ─── MIS Export ─────────────────────────────────────────────────────────────

/**
 * GET /api/reports/mis/export?type=daily|weekly|monthly&format=pdf|excel
 */
router.get(
  "/mis/export",
  authenticate,
  authorize(["Chairman"]),
  async (req: Request, res: Response) => {
    try {
      const type = (req.query.type as string) || "daily";
      const format = (req.query.format as string) || "excel";
      const { start, end } = getPeriodRange(type as any);
      const now = new Date();

      const tasks = await Task.find({ createdAt: { $gte: start, $lte: end } })
        .populate("assignedTo", "name role department")
        .lean();

      if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("MIS Report");

        sheet.columns = [
          { header: "Title", key: "title", width: 30 },
          { header: "Assigned To", key: "assignedTo", width: 20 },
          { header: "Department", key: "department", width: 20 },
          { header: "Priority", key: "priority", width: 12 },
          { header: "Status", key: "status", width: 14 },
          { header: "Deadline", key: "deadline", width: 14 },
          { header: "Delayed", key: "delayed", width: 10 },
        ];

        tasks.forEach((t) => {
          const assignee = t.assignedTo as any;
          const isDelayed = t.status !== "Completed" && new Date(t.deadline) < now;
          sheet.addRow({
            title: t.title,
            assignedTo: assignee?.name || "—",
            department: assignee?.department || assignee?.role || "—",
            priority: t.priority,
            status: t.status,
            deadline: new Date(t.deadline).toLocaleDateString(),
            delayed: isDelayed ? "Yes" : "No",
          });
        });

        // Style header
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E40AF" },
        };
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="MIS_${type}_${new Date().toISOString().slice(0, 10)}.xlsx"`
        );
        await workbook.xlsx.write(res);
        res.end();
      } else {
        // PDF
        const doc = new PDFDocument({ margin: 40 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="MIS_${type}_${new Date().toISOString().slice(0, 10)}.pdf"`
        );
        doc.pipe(res);

        doc.fontSize(18).text(`MIS ${type.charAt(0).toUpperCase() + type.slice(1)} Report`, { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Period: ${periodLabel(type as any)}`, { align: "center" });
        doc.moveDown(1);

        // Summary box
        const completed = tasks.filter((t) => t.status === "Completed").length;
        const delayed = tasks.filter((t) => t.status !== "Completed" && new Date(t.deadline) < now).length;

        doc.fontSize(11).text(`Total Tasks: ${tasks.length}`);
        doc.text(`Completed: ${completed}`);
        doc.text(`Delayed: ${delayed}`);
        doc.moveDown(1);

        // Task list
        doc.fontSize(12).text("Task Details", { underline: true });
        doc.moveDown(0.5);
        tasks.forEach((t, i) => {
          const assignee = t.assignedTo as any;
          doc.fontSize(10).text(
            `${i + 1}. ${t.title} | ${assignee?.name || "—"} | ${t.status} | Deadline: ${new Date(t.deadline).toLocaleDateString()}`
          );
        });

        doc.end();
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Export failed" });
    }
  }
);

// ─── Performance Analytics ──────────────────────────────────────────────────

/**
 * GET /api/reports/performance
 */
router.get(
  "/performance",
  authenticate,
  authorize(["Chairman"]),
  async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const allTasks = await Task.find().populate("assignedTo", "role department").lean();

      // Group by department/role
      const deptMap: Record<string, { total: number; completed: number; delayed: number }> = {};

      allTasks.forEach((t) => {
        const assignee = t.assignedTo as any;
        const dept = assignee?.department || assignee?.role || "Unknown";
        if (!deptMap[dept]) deptMap[dept] = { total: 0, completed: 0, delayed: 0 };
        deptMap[dept].total++;
        if (t.status === "Completed") deptMap[dept].completed++;
        if (t.status !== "Completed" && new Date(t.deadline) < now) deptMap[dept].delayed++;
      });

      const departmentStats = Object.entries(deptMap).map(([department, d]) => ({
        department,
        ...d,
        efficiency: d.total > 0 ? (d.completed / d.total) * 100 : 0,
        delayRate: d.total > 0 ? (d.delayed / d.total) * 100 : 0,
      }));

      // Monthly comparison — last 6 months
      const monthlyComparison = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        const monthTasks = allTasks.filter((t) => {
          const created = new Date(t.createdAt as any);
          return created >= monthStart && created <= monthEnd;
        });
        monthlyComparison.push({
          month: monthStart.toLocaleString("default", { month: "short", year: "numeric" }),
          completed: monthTasks.filter((t) => t.status === "Completed").length,
          delayed: monthTasks.filter(
            (t) => t.status !== "Completed" && new Date(t.deadline) < now
          ).length,
        });
      }

      res.json({ departmentStats, monthlyComparison });
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
