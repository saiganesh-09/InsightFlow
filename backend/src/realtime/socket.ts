import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { config } from "../config.js";
import { verifyAccessToken } from "../middleware/authenticate.js";
import { bus, BUS_EVENT_INGESTED, type IngestedEventPayload } from "../lib/bus.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/**
 * Realtime gateway.
 *
 * Flow: event ingestion → bus.emit → Socket.IO room `project:{id}`.
 * Clients authenticate the socket with their JWT access token and may only
 * subscribe to projects they own or belong to (verified against the DB).
 */
export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.FRONTEND_URL, credentials: true },
    path: "/socket.io",
  });

  // JWT auth on the socket handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = verifyAccessToken(token);
      (socket.data as { userId: string }).userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket.data as { userId: string }).userId;

    socket.on("subscribe:project", async (projectId: string, ack?: (ok: boolean) => void) => {
      try {
        if (typeof projectId !== "string" || projectId.length > 64) {
          ack?.(false);
          return;
        }
        // Authorize: owner or member
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
          ack?.(false);
          return;
        }
        if (project.ownerId !== userId) {
          const member = await prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId, userId } },
          });
          if (!member) {
            ack?.(false);
            return;
          }
        }
        await socket.join(`project:${projectId}`);
        ack?.(true);
        logger.debug(`Socket ${socket.id} subscribed to project:${projectId}`);
      } catch {
        ack?.(false);
      }
    });

    socket.on("unsubscribe:project", (projectId: string) => {
      void socket.leave(`project:${projectId}`);
    });
  });

  // Fan out ingested events to subscribers of that project
  bus.on(BUS_EVENT_INGESTED, (payload: IngestedEventPayload) => {
    io.to(`project:${payload.projectId}`).emit("event", payload);
  });

  logger.info("Socket.IO realtime gateway initialized");
  return io;
}
