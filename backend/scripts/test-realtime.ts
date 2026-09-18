/* Live realtime verification: login → connect socket → subscribe → ingest → expect event */
import { io } from "socket.io-client";

const API = "http://localhost:4000";
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "demo@insightflow.dev", password: "Demo123!" }),
});
const { accessToken } = (await loginRes.json()) as { accessToken: string };
console.log("logged in");

const socket = io(API, { auth: { token: accessToken }, transports: ["websocket"] });
await new Promise((r) => socket.on("connect", r));
console.log("socket connected");

const ok = await new Promise<boolean>((r) =>
  socket.emit("subscribe:project", "demo-project", (v: boolean) => r(v))
);
console.log("subscribed:", ok);
if (!ok) process.exit(1);

const got = new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), 8000);
  socket.on("event", (e) => {
    clearTimeout(t);
    resolve(e);
  });
});

// ingest after subscribing
await fetch(`${API}/api/events`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": "if_live_ca9b46e06a9e70a28061a62a2ba38b5e91a7fe56f561d669",
  },
  body: JSON.stringify({
    event: "BUTTON_CLICK",
    userId: "rt_user",
    sessionId: "rt_session",
    page: "/realtime-test",
    properties: { button: "cta" },
  }),
});
console.log("event ingested, waiting for realtime push…");

const evt = (await got) as { name?: string; page?: string; userId?: string } | null;
if (evt) {
  console.log("REALTIME EVENT RECEIVED:", JSON.stringify(evt));
  socket.close();
  process.exit(0);
} else {
  console.log("TIMEOUT — no realtime event received");
  socket.close();
  process.exit(1);
}
