"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useRange } from "@/lib/range";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

function Dropdown({
  open,
  onClose,
  align = "right",
  children,
}: {
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-full mt-1 z-50 card min-w-56 p-1 shadow-xl max-h-[calc(100vh-64px)] overflow-y-auto",
        align === "right" ? "right-0" : "left-0"
      )}
    >
      {children}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout, projects, currentProject, setCurrentProject, refreshProjects } = useAuth();
  const { preset, setPreset, range } = useRange();
  const [projOpen, setProjOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function createProject() {
    if (!newName.trim()) return;
    setCreateErr(null);
    try {
      await api.post("/api/projects", { name: newName.trim() });
      await refreshProjects();
      setNewName("");
      setCreating(false);
    } catch (e) {
      setCreateErr((e as Error).message);
    }
  }

  return (
    <header className="h-14 border-b border-ink-600 bg-ink-950/80 backdrop-blur flex items-center gap-2 px-4 sticky top-0 z-20">
      <button className="lg:hidden btn-ghost !px-2" onClick={onMenu} aria-label="Menu">☰</button>

      {/* Project selector */}
      <div className="relative">
        <button
          className="btn-ghost max-w-52 truncate"
          onClick={() => setProjOpen((v) => !v)}
        >
          <span className="truncate">{currentProject?.name ?? "Select project"}</span>
          <span className="text-subtle">▾</span>
        </button>
        <Dropdown open={projOpen} onClose={() => setProjOpen(false)} align="left">
          <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-subtle">Projects</div>
          {projects.map((p: Project) => (
            <button
              key={p.id}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-ink-700",
                p.id === currentProject?.id && "bg-ink-700 text-white"
              )}
              onClick={() => {
                setCurrentProject(p);
                setProjOpen(false);
              }}
            >
              <div className="truncate font-medium">{p.name}</div>
              <div className="text-[11px] text-subtle">{p.eventCount?.toLocaleString() ?? 0} events</div>
            </button>
          ))}
          <div className="border-t border-ink-600 mt-1 pt-1">
            {creating ? (
              <div className="p-2 space-y-2">
                <input
                  autoFocus
                  className="input"
                  placeholder="Project name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createProject()}
                />
                {createErr && <div className="text-xs text-red-300">{createErr}</div>}
                <div className="flex gap-2">
                  <button className="btn-primary flex-1 !py-1.5" onClick={createProject}>Create</button>
                  <button className="btn-ghost !py-1.5" onClick={() => setCreating(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-accent-soft hover:bg-ink-700"
                onClick={() => setCreating(true)}
              >
                + New project
              </button>
            )}
          </div>
        </Dropdown>
      </div>

      <div className="flex-1" />

      {/* Date range picker */}
      <div className="relative">
        <button className="btn-ghost" onClick={() => setRangeOpen((v) => !v)}>
          <span>{range.label}</span>
          <span className="text-subtle">▾</span>
        </button>
        <Dropdown open={rangeOpen} onClose={() => setRangeOpen(false)}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-ink-700",
                preset === p.key && "bg-ink-700 text-white"
              )}
              onClick={() => {
                setPreset(p.key);
                setRangeOpen(false);
              }}
            >
              {p.label}
            </button>
          ))}
        </Dropdown>
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          className="w-8 h-8 rounded-full bg-ink-600 grid place-items-center text-xs font-bold text-white hover:bg-ink-500"
          onClick={() => setUserOpen((v) => !v)}
          title={user?.email}
        >
          {user?.name?.[0]?.toUpperCase() ?? "?"}
        </button>
        <Dropdown open={userOpen} onClose={() => setUserOpen(false)}>
          <div className="px-3 py-2">
            <div className="text-sm font-semibold text-white">{user?.name}</div>
            <div className="text-xs text-subtle">{user?.email}</div>
          </div>
          <div className="border-t border-ink-600 mt-1 pt-1">
            <button
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-300 hover:bg-ink-700"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </Dropdown>
      </div>
    </header>
  );
}
