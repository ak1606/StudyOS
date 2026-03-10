"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a value by the given delay (ms).
 * Useful for search inputs to avoid firing API calls on every keystroke.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
