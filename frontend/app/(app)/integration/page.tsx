"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api, API_URL } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";
import { Card } from "@/components/Charts";
import { ConfirmModal, Modal } from "@/components/Modal";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/States";
import type { ApiKeyMasked } from "@/lib/types";

export default function IntegrationPage() {
  const { currentProject } = useAuth();
  const pid = currentProject?.id;
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [rotateId, setRotateId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const keys = useQuery({
    queryKey: ["api-keys", pid],
    queryFn: () => api.get<{ apiKeys: ApiKeyMasked[] }>(`/api/projects/${pid}/api-keys`),
    enabled: Boolean(pid),
  });

  const createMut = useMutation({
    mutationFn: () => api.post<{ apiKey: ApiKeyMasked; plaintext: string }>(`/api/projects/${pid}/api-keys`, { name: "Dashboard key" }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["api-keys", pid] });
      setNewKey(res.plaintext);
    },
  });
  const rotateMut = useMutation({
    mutationFn: (id: string) => api.post<{ apiKey: ApiKeyMasked; plaintext: string }>(`/api/projects/${pid}/api-keys/${id}/rotate`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["api-keys", pid] });
      setRotateId(null);
      setNewKey(res.plaintext);
    },
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${pid}/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys", pid] });
      setRevokeId(null);
    },
  });

  const activeKey = keys.data?.apiKeys.find((k) => k.status === "ACTIVE");

  const snippet = `<!-- InsightFlow tracking SDK -->
<script src="${API_URL}/sdk/insightflow.js"></script>
<script>
  InsightFlow.init({ apiKey: "YOUR_API_KEY", endpoint: "${API_URL}" });
  InsightFlow.track("PAGE_VIEW", { page: "/products" });
  InsightFlow.track("ADD_TO_CART", { properties: { productId: "123", price: 99 } });
</script>`;

  const curl = `curl -X POST ${API_URL}/api/events \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"event":"PAGE_VIEW","userId":"u1","sessionId":"s1","page":"/"}'`;

  if (!pid) return <EmptyState title="No project selected" />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">API &amp; Integration</h1>

      <Card
        title="Project API keys"
        subtitle="keys are hashed at rest — the full key is shown only once at creation"
        action={
          <button className="btn-primary" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? "Creating…" : "+ New key"}
          </button>
        }
      >
        {keys.isLoading ? (
          <ChartSkeleton height={140} />
        ) : keys.isError ? (
          <ErrorState onRetry={() => keys.refetch()} />
        ) : keys.data && keys.data.apiKeys.length > 0 ? (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr><th className="th">Key</th><th className="th">Name</th><th className="th">Status</th><th className="th">Last used</th><th className="th">Actions</th></tr>
              </thead>
              <tbody>
                {keys.data.apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="td font-mono text-xs">{k.masked}</td>
                    <td className="td">{k.name}</td>
                    <td className="td">
                      <span className={`text-xs px-2 py-0.5 rounded ${k.status === "ACTIVE" ? "bg-emerald-950/60 text-emerald-300" : "bg-ink-600 text-subtle line-through"}`}>
                        {k.status}
                      </span>
                    </td>
                    <td className="td text-muted text-xs">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "never"}</td>
                    <td className="td">
                      {k.status === "ACTIVE" && (
                        <div className="flex gap-2">
                          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setRotateId(k.id)}>Rotate</button>
                          <button className="btn-danger !px-2 !py-1 text-xs" onClick={() => setRevokeId(k.id)}>Revoke</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No API keys" description="Create a key to start sending events." />
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Browser SDK" subtitle="drop this into your site's <head>">
          <pre className="text-xs bg-ink-900 border border-ink-600 rounded-lg p-3 overflow-x-auto text-slate-300">{snippet}</pre>
        </Card>
        <Card title="HTTP API" subtitle="server-side or curl ingestion">
          <pre className="text-xs bg-ink-900 border border-ink-600 rounded-lg p-3 overflow-x-auto text-slate-300">{curl}</pre>
          <p className="text-xs text-subtle mt-3">
            Try the live demo event generator at{" "}
            <a className="text-accent-soft hover:underline" href={`${API_URL}/demo`} target="_blank" rel="noreferrer">
              {API_URL}/demo
            </a>{" "}
            — events will appear on the Realtime page.
          </p>
        </Card>
      </div>

      {/* New key modal — plaintext shown once */}
      <Modal open={Boolean(newKey)} onClose={() => { setNewKey(null); setCopied(false); }} title="API key created"
        footer={<button className="btn-primary" onClick={() => { setNewKey(null); setCopied(false); }}>Done</button>}>
        <p className="text-sm text-muted mb-3">
          Copy this key now — it is stored hashed and <b>cannot be shown again</b>.
        </p>
        <div className="flex gap-2">
          <code className="flex-1 text-xs bg-ink-900 border border-ink-600 rounded-lg px-3 py-2.5 font-mono break-all text-emerald-300">
            {newKey}
          </code>
          <button
            className="btn-ghost shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(newKey ?? "");
              setCopied(true);
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(revokeId)}
        onClose={() => setRevokeId(null)}
        onConfirm={() => revokeId && revokeMut.mutate(revokeId)}
        title="Revoke API key"
        body="Events sent with this key will immediately be rejected with 401."
        confirmLabel="Revoke"
        loading={revokeMut.isPending}
      />
      <ConfirmModal
        open={Boolean(rotateId)}
        onClose={() => setRotateId(null)}
        onConfirm={() => rotateId && rotateMut.mutate(rotateId)}
        title="Rotate API key"
        body="A new key will be issued and the current one revoked. Update your integrations."
        confirmLabel="Rotate"
        loading={rotateMut.isPending}
      />
    </div>
  );
}
