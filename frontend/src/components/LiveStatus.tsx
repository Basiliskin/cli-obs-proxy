import { NetworkStatus } from "@apollo/client";
import { POLL_INTERVAL_MS } from "../metrics";

interface LiveStatusProps {
  /** Network status of the dashboard's polling query — the badge reflects it directly. */
  networkStatus: NetworkStatus;
}

interface LiveState {
  label: string;
  stale: boolean;
}

/**
 * There is deliberately no wall-clock "updated Ns ago" here: reading the time
 * during render is impure, and syncing it from an effect costs an extra commit
 * pass. The query's own network status is the honest signal instead — it is a
 * pure prop, and it moves to `error` the moment polling stops succeeding.
 *
 * `poll` is rendered as healthy rather than as a separate "refreshing" state,
 * because it fires every few seconds and would make the badge flicker.
 */
function describe(networkStatus: NetworkStatus): LiveState {
  switch (networkStatus) {
    case NetworkStatus.error:
      return { label: "Offline — polling failed", stale: true };
    case NetworkStatus.loading:
      return { label: "Connecting…", stale: false };
    default:
      return {
        label: `Live · polling every ${POLL_INTERVAL_MS / 1000}s`,
        stale: false,
      };
  }
}

export function LiveStatus({ networkStatus }: LiveStatusProps) {
  const { label, stale } = describe(networkStatus);

  return (
    <div className={`live-status${stale ? " stale" : ""}`} role="status">
      <span />
      {label}
    </div>
  );
}
