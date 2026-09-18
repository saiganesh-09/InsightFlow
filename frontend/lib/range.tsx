"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { dateRangePreset } from "./utils";
import type { DateRange } from "./types";

interface RangeState {
  range: DateRange;
  preset: string;
  setPreset: (key: string) => void;
  setCustom: (from: string, to: string) => void;
  /** query-string params ready for api calls */
  params: { from: string; to: string };
}

const RangeContext = createContext<RangeState | null>(null);

export function RangeProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPresetKey] = useState("7d");
  const [range, setRange] = useState<DateRange>(() => dateRangePreset("7d"));

  const setPreset = useCallback((key: string) => {
    setPresetKey(key);
    setRange(dateRangePreset(key));
  }, []);

  const setCustom = useCallback((from: string, to: string) => {
    setPresetKey("custom");
    setRange({ from, to, label: "Custom" });
  }, []);

  const params = useMemo(() => ({ from: range.from, to: range.to }), [range]);

  return (
    <RangeContext.Provider value={{ range, preset, setPreset, setCustom, params }}>
      {children}
    </RangeContext.Provider>
  );
}

export function useRange() {
  const ctx = useContext(RangeContext);
  if (!ctx) throw new Error("useRange must be used inside RangeProvider");
  return ctx;
}
