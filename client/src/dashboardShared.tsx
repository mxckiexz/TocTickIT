import { ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError } from "./api.js";
import { Route, routeHref } from "./routes.js";

// Lab 4 F8 (ui-spec.md §2, §3): the two dashboards share their loading, error, forbidden and zero states and the
// way a drill-down is drawn, so they cannot drift apart.

type LoadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "error" }
  | { kind: "forbidden" };

// Loads once on mount and again on reload(). No numbers from an earlier load are kept while a new one runs
// (ui-spec.md §2: "loading, no stale numbers").
export function useDashboard<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", data: await fetcher() });
    } catch (error) {
      console.error("Failed to load the dashboard:", error);
      setState(error instanceof ApiError && error.status === 403 ? { kind: "forbidden" } : { kind: "error" });
    }
    // The fetcher is a module-level function of api.ts; it never changes for a mounted dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}

export function DashboardStatus({ state, reload }: { state: LoadState<unknown>; reload: () => void }) {
  if (state.kind === "loading") return <p>Loading dashboard…</p>;
  if (state.kind === "forbidden") {
    return (
      <div className="alert alert-danger" role="alert">
        You do not have permission to view this page.
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">
        <span>Unable to load the dashboard.</span>
        <button type="button" className="btn btn-outline-success btn-sm" onClick={reload}>
          Retry
        </button>
      </div>
    );
  }
  return null;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

// A drill-down is a real link (it opens in a new tab and works with the Back button), never a clickable div. The
// visible text is short; the accessible name says what it opens and carries the number it opens.
export function DrillLink({ route, label, children = "View", className = "btn btn-outline-success btn-sm" }: {
  route: Route;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a href={routeHref(route)} className={className} aria-label={label}>
      {children}
    </a>
  );
}

// A card: a label, the number, and (when it is 0) the muted note. Whatever else the card holds goes in `children`.
export function MetricCard({ title, value, children }: { title: string; value?: number; children?: ReactNode }) {
  return (
    <div className="card h-100" data-card>
      <div className="card-body">
        <h3 className="h6 card-title">{title}</h3>
        {value !== undefined && (
          <>
            <p className="display-6 mb-1">{value}</p>
            {value === 0 && <p className="text-muted small mb-2">Nothing here</p>}
          </>
        )}
        {children}
      </div>
    </div>
  );
}
