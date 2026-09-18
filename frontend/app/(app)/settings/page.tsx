"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card } from "@/components/Charts";
import { ConfirmModal } from "@/components/Modal";
import { EmptyState } from "@/components/States";

export default function SettingsPage() {
  const { currentProject, user, refreshProjects, logout } = useAuth();
  const pid = currentProject?.id;
  const qc = useQueryClient();
  const router = useRouter();

  const [name, setName] = useState(currentProject?.name ?? "");
  const [description, setDescription] = useState(currentProject?.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(currentProject?.websiteUrl ?? "");
  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(currentProject?.name ?? "");
    setDescription(currentProject?.description ?? "");
    setWebsiteUrl(currentProject?.websiteUrl ?? "");
  }, [currentProject?.id, currentProject?.name, currentProject?.description, currentProject?.websiteUrl]);

  const updateProject = useMutation({
    mutationFn: () =>
      api.patch(`/api/projects/${pid}`, {
        name: name.trim(),
        description: description.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
      }),
    onSuccess: async () => {
      await refreshProjects();
      setSavedMsg("Project saved");
      setTimeout(() => setSavedMsg(null), 2500);
    },
  });

  const updateProfile = useMutation({
    mutationFn: () => api.patch("/api/auth/me", { name: displayName.trim() }),
    onSuccess: async () => {
      setSavedMsg("Profile saved");
      setTimeout(() => setSavedMsg(null), 2500);
    },
  });

  const changePw = useMutation({
    mutationFn: () =>
      api.post("/api/auth/change-password", { currentPassword: curPw, newPassword: newPw }),
    onSuccess: async () => {
      await logout();
    },
  });

  const deleteProject = useMutation({
    mutationFn: () => api.delete(`/api/projects/${pid}`),
    onSuccess: async () => {
      await refreshProjects();
      qc.clear();
      router.push("/overview");
    },
  });

  if (!pid) return <EmptyState title="No project selected" />;

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-lg font-bold text-white">Settings</h1>
      {savedMsg && (
        <div className="text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-900 rounded-lg px-3 py-2">{savedMsg}</div>
      )}

      {/* Project */}
      <Card title="Project settings">
        <div className="space-y-4">
          <div>
            <label className="label">Project name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this project track?" />
          </div>
          <div>
            <label className="label">Website URL</label>
            <input className="input" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" />
          </div>
          {updateProject.isError && (
            <div className="text-sm text-red-300">{(updateProject.error as Error).message}</div>
          )}
          <button className="btn-primary" disabled={!name.trim() || updateProject.isPending} onClick={() => updateProject.mutate()}>
            {updateProject.isPending ? "Saving…" : "Save project"}
          </button>
        </div>
      </Card>

      {/* Profile */}
      <Card title="Your profile">
        <div className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" value={user?.email ?? ""} disabled />
          </div>
          <div>
            <label className="label">Display name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <button className="btn-ghost" disabled={!displayName.trim() || updateProfile.isPending} onClick={() => updateProfile.mutate()}>
            Save profile
          </button>
        </div>
      </Card>

      {/* Password */}
      <Card title="Change password" subtitle="all sessions are revoked on change">
        <div className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" placeholder="8+ chars, letter + number" />
          </div>
          {changePw.isError && <div className="text-sm text-red-300">{(changePw.error as Error).message}</div>}
          <button className="btn-ghost" disabled={!curPw || newPw.length < 8 || changePw.isPending} onClick={() => changePw.mutate()}>
            {changePw.isPending ? "Changing…" : "Change password"}
          </button>
        </div>
      </Card>

      {/* Danger zone */}
      <Card title="Danger zone">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-200">Delete this project</div>
            <div className="text-xs text-subtle mt-0.5">
              Permanently removes the project, all events, sessions, funnels and reports.
            </div>
          </div>
          <button className="btn-danger" onClick={() => setDeleteOpen(true)}>Delete project</button>
        </div>
      </Card>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteProject.mutate()}
        title="Delete project"
        body={
          <>
            Permanently delete <b>{currentProject?.name}</b> and all of its analytics data?
            This cannot be undone.
          </>
        }
        confirmLabel="Delete forever"
        loading={deleteProject.isPending}
      />
    </div>
  );
}
