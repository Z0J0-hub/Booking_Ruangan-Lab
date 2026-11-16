export function createMonitor({ url, emit, threshold = 3 }) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.username || target.password) throw new Error('MONITOR_REQUIRES_LOOPBACK');
  let consecutive = 0; let down = false;
  return {
    check: async () => {
      let healthy = false;
      try { const response = await fetch(`${target.origin}/health`, { signal: AbortSignal.timeout(1500) }); healthy = response.status === 200 && (await response.text()) === 'healthy'; }
      catch { healthy = false; }
      if (healthy) {
        consecutive = 0;
        if (down) await emit({ type: 'availability_restored', source: 'monitor' });
        down = false;
      } else {
        consecutive++;
        if (consecutive >= threshold && !down) { await emit({ type: 'availability_failure', source: 'monitor' }); down = true; }
      }
      return { healthy, consecutive, down };
    },
  };
}
