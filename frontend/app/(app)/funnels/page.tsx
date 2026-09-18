"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useRange } from "@/lib/range";
import { api, qs } from "@/lib/api";
import { fmtNumber, fmtPct } from "@/lib/utils";
import { Card } from "@/components/Charts";
import { Modal, ConfirmModal } from "@/components/Modal";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/States";
import type { Funnel, FunnelResults } from "@/lib/types";

const SUGGESTED_STEPS = ["PAGE_VIEW", "PRODUCT_VIEW", "ADD_TO_CART", "CHECKOUT", "PURCHASE", "SIGNUP", "SEARCH", "LOGIN"];

export default function FunnelsPage() {
  const { currentProject } = useAuth();
  const { params } = useRange();
  const pid = currentProject?.id;
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<string[]>(["PAGE_VIEW", "PRODUCT_VIEW", "PURCHASE"]);

  const funnels = useQuery({
    queryKey: ["funnels", pid],
    queryFn: () => api.get<{ funnels: Funnel[] }>(`/api/projects/${pid}/funnels`),
    enabled: Boolean(pid),
  });

  const activeId = selected ?? funnels.data?.funnels[0]?.id;
  const results = useQuery({
    queryKey: ["funnel-results", activeId, params.from, params.to],
    queryFn: () => api.get<FunnelResults>(`/api/projects/${pid}/funnels/${activeId}/results${qs(params)}`),
    enabled: Boolean(pid && activeId),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.post(`/api/projects/${pid}/funnels`, { name, steps }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funnels", pid] });
      setCreateOpen(false);
      setName("");
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${pid}/funnels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funnels", pid] });
      setDeleteId(null);
      setSelected(null);
    },
  });

  const addStep = (ev: string) => steps.length < 8 && setSteps([...steps, ev]);
  const removeStep = (i: number) => steps.length > 2 && setSteps(steps.filter((_, x) => x !== i));

  if (!pid) return <EmptyState title="No project selected" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Conversion funnels</h1>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ New funnel</button>
      </div>

      {funnels.isLoading ? (
        <ChartSkeleton height={80} />
      ) : funnels.data && funnels.data.funnels.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {funnels.data.funnels.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelected(f.id)}
              className={`btn-ghost ${f.id === activeId ? "!bg-ink-600 text-white border-accent" : ""}`}
            >
              {f.name}
            </button>
          ))}
        </div>
      ) : null}

      <Card title="Funnel results" subtitle="users who completed each step in order">
        {funnels.isLoading || results.isLoading ? (
          <ChartSkeleton height={340} />
        ) : !funnels.data || funnels.data.funnels.length === 0 ? (
          <EmptyState
            title="No funnels yet"
            description="Create a funnel to measure conversion between events."
            action={<button className="btn-primary" onClick={() => setCreateOpen(true)}>Create funnel</button>}
          />
        ) : results.isError ? (
          <ErrorState message={(results.error as Error).message} onRetry={() => results.refetch()} />
        ) : results.data ? (
          <div className="space-y-3">
            {results.data.steps.map((s, i) => {
              const widthPct = results.data!.entered > 0 ? (s.users / results.data!.entered) * 100 : 0;
              return (
                <div key={s.order}>
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="text-sm">
                      <span className="text-subtle mr-2">{i + 1}.</span>
                      <span className="font-mono text-xs text-accent-soft">{s.eventName}</span>
                    </div>
                    <div className="text-sm text-muted">
                      <span className="text-white font-semibold tabular-nums">{fmtNumber(s.users)}</span>
                      {" · "}{fmtPct(s.conversionFromStart)}
                      {i > 0 && <span className="text-red-300/80 ml-2">−{fmtNumber(s.dropOff)}</span>}
                    </div>
                  </div>
                  <div className="h-9 bg-ink-700 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent-soft rounded-lg transition-all"
                      style={{ width: `${Math.max(1.5, widthPct)}%` }}
                    />
                    {i > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">
                        {fmtPct(s.conversionFromPrevious)} from prev
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="pt-3 border-t border-ink-600 flex justify-between text-sm">
              <span className="text-muted">
                {fmtNumber(results.data.entered)} entered → {fmtNumber(results.data.completed)} completed
              </span>
              <span className="font-semibold text-emerald-300">
                {fmtPct(results.data.overallConversion)} overall conversion
              </span>
            </div>
            <div className="pt-1">
              <button className="btn-danger text-xs" onClick={() => setDeleteId(activeId!)}>Delete funnel</button>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Create funnel modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create funnel"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!name.trim() || steps.length < 2 || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Creating…" : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Funnel name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Purchase funnel" />
          </div>
          <div>
            <label className="label">Steps (in order)</label>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-subtle w-4">{i + 1}.</span>
                  <span className="flex-1 input !py-1.5 font-mono text-xs">{s}</span>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => removeStep(i)} disabled={steps.length <= 2}>✕</button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {SUGGESTED_STEPS.filter((s) => !steps.includes(s)).map((s) => (
                <button key={s} className="text-xs bg-ink-700 hover:bg-ink-600 rounded-md px-2 py-1 font-mono" onClick={() => addStep(s)}>
                  + {s}
                </button>
              ))}
            </div>
          </div>
          {createMut.isError && <div className="text-sm text-red-300">{(createMut.error as Error).message}</div>}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete funnel"
        body="This deletes the funnel definition. Events are not affected."
        loading={deleteMut.isPending}
      />
    </div>
  );
}
