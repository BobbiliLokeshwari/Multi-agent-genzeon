"use client";

import { STREAM_EVENTS, type GenerationDetail, type StepEvent } from "@studio/shared";
import { useEffect, useReducer } from "react";

export type Connection = "connecting" | "open" | "reconnecting" | "ended" | "closed" | "unavailable";

interface StreamState {
  generation: GenerationDetail | null;
  connection: Connection;
}

type Action =
  | { type: "open" }
  | { type: "snapshot"; generation: GenerationDetail }
  | { type: "step"; event: StepEvent }
  | { type: "end" }
  | { type: "error"; closed: boolean };

/** Merges one finished step into the run, mirroring what the worker saved. */
export function applyStep(run: GenerationDetail, event: StepEvent): GenerationDetail {
  const next: GenerationDetail = {
    ...run,
    status: run.status === "QUEUED" ? "RUNNING" : run.status,
    currentStep: event.step,
    issues: event.issues,
  };
  switch (event.step) {
    case "research":
      return { ...next, research: event.data };
    case "write":
      return event.data ? { ...next, post: event.data, hook: event.data.hook } : next;
    case "validate":
      return { ...next, validation: event.data, validatorScore: event.data.score };
    case "judge":
      return { ...next, judge: event.data, judgeScore: event.data.overall };
    case "memory":
      return next;
  }
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case "open":
      return state.connection === "ended" ? state : { ...state, connection: "open" };
    case "snapshot":
      return { ...state, generation: action.generation };
    case "step":
      return state.generation ? { ...state, generation: applyStep(state.generation, action.event) } : state;
    case "end":
      return { ...state, connection: "ended" };
    case "error":
      if (state.connection === "ended") return state;
      if (!action.closed) return { ...state, connection: "reconnecting" };
      return { ...state, connection: state.generation ? "closed" : "unavailable" };
  }
}

/** Subscribes to a run's Server-Sent Events. EventSource reconnects by itself. */
export function useGenerationStream(url: string): StreamState {
  const [state, dispatch] = useReducer(reducer, { generation: null, connection: "connecting" });

  useEffect(() => {
    const source = new EventSource(url);
    const read = <T,>(event: Event) => JSON.parse((event as MessageEvent<string>).data) as T;
    source.onopen = () => dispatch({ type: "open" });
    source.onerror = () => dispatch({ type: "error", closed: source.readyState === EventSource.CLOSED });
    source.addEventListener(STREAM_EVENTS.snapshot, (event) =>
      dispatch({ type: "snapshot", generation: read<GenerationDetail>(event) }),
    );
    source.addEventListener(STREAM_EVENTS.step, (event) =>
      dispatch({ type: "step", event: read<StepEvent>(event) }),
    );
    source.addEventListener(STREAM_EVENTS.end, () => {
      dispatch({ type: "end" });
      source.close(); // Otherwise EventSource would reconnect after the server closes.
    });
    return () => source.close();
  }, [url]);

  return state;
}
