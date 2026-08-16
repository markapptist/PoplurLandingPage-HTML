import { useEffect, useState } from 'react';

import {
  PoplurPerformanceManager,
  type PoplurPerformanceSnapshot,
} from './poplurPerformanceManager';

export function usePoplurPerformance(): PoplurPerformanceSnapshot {
  const [snapshot, setSnapshot] = useState(() => PoplurPerformanceManager.snapshot);
  useEffect(() => PoplurPerformanceManager.subscribe(setSnapshot), []);
  return snapshot;
}
