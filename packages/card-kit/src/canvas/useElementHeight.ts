import { useEffect, useState } from "react";
import type { RefObject } from "react";

// The rendered height of an element, kept current: the table lays the
// cards out around its controls, whatever height they wrap to.
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    setHeight(element.offsetHeight);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}
