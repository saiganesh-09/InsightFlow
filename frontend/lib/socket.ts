"use client";

import { io, type Socket } from "socket.io-client";
import { getAccessToken, WS_URL } from "./api";
import type { LiveEvent } from "./types";

let socket: Socket | null = null;
let currentProject: string | null = null;
const listeners = new Set<(e: LiveEvent) => void>();

/**
 * Subscribe to a project's realtime event stream.
 * Authenticates the socket with the current JWT and joins the project room
 * (the backend verifies membership server-side).
 */
export function subscribeProject(projectId: string, onEvent: (e: LiveEvent) => void): () => void {
  listeners.add(onEvent);

  if (!socket) {
    socket = io(WS_URL, {
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ["websocket", "polling"],
    });
    socket.on("event", (e: LiveEvent) => {
      for (const l of listeners) l(e);
    });
  }

  const join = () => {
    if (currentProject === projectId) return;
    if (currentProject) socket!.emit("unsubscribe:project", currentProject);
    socket!.emit("subscribe:project", projectId, (ok: boolean) => {
      if (ok) currentProject = projectId;
    });
  };

  if (socket.connected) join();
  else socket.once("connect", join);
  socket.on("connect", () => {
    // rejoin after reconnect
    const p = currentProject;
    currentProject = null;
    if (p) join();
  });

  return () => {
    listeners.delete(onEvent);
    if (listeners.size === 0 && socket) {
      if (currentProject) socket.emit("unsubscribe:project", currentProject);
      currentProject = null;
    }
  };
}
