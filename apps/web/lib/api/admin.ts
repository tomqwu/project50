import { prisma } from "@project50/db";
import { notFound } from "./http";

/** A user as shown in the admin user list. */
export interface AdminUser {
  id: string;
  handle: string;
  displayName: string;
  isAdmin: boolean;
}

/** A moderation report as shown in the admin review list. */
export interface AdminReport {
  id: string;
  reporterId: string;
  reporterHandle: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: Date;
}

/**
 * Load the user and assert they are an admin. Throws a 404 HttpError
 * (ADMIN_FORBIDDEN) when the user is missing or not an admin — the dashboard
 * is hidden from non-admins, so a forbidden user is indistinguishable from a
 * non-existent route.
 */
export async function requireAdmin(uid: string) {
  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user || !user.isAdmin) notFound("ADMIN_FORBIDDEN");
  return user;
}

/** List all users with the fields the admin dashboard displays, newest first. */
export async function listUsers(): Promise<AdminUser[]> {
  return prisma.user.findMany({
    select: { id: true, handle: true, displayName: true, isAdmin: true },
    orderBy: { createdAt: "desc" },
  });
}

/** List the most recent moderation reports for review, newest first. */
export async function listReports(limit = 100): Promise<AdminReport[]> {
  const reports = await prisma.report.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: { reporter: { select: { handle: true } } },
  });
  return reports.map((r) => ({
    id: r.id,
    reporterId: r.reporterId,
    reporterHandle: r.reporter.handle,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    createdAt: r.createdAt,
  }));
}
