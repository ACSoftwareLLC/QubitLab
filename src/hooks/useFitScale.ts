import { useEffect, useState } from "react";
import { WORKSPACE_WIDTH, WORKSPACE_HEIGHT } from "../constants/canvas";

/**
 * Measures an element and returns the uniform scale that fits the whole
 * canvas workspace inside it (letterboxed). Recomputes whenever the
 * element resizes, so the stage is never clipped and never leaves
 * scrollbars — zoom controls multiply on top of this base scale.
 *
 * The ref is a callback ref backed by state: the measured element is not
 * mounted on first render (auth loading / login screens), so a plain
 * `useRef` + mount effect would never observe it.
 *
 * Pass logicalSize to fit a different rectangle (the v2 editor grid uses
 * its own aspect); defaults to the legacy canvas workspace.
 */
export function useFitScale<T extends HTMLElement = HTMLDivElement>(
   logicalSize: { width: number; height: number } = {
      width: WORKSPACE_WIDTH,
      height: WORKSPACE_HEIGHT,
   },
) {
   const [el, setEl] = useState<T | null>(null);
   const [fitScale, setFitScale] = useState(1);

   useEffect(() => {
      if (!el) return;

      const update = () => {
         const { clientWidth, clientHeight } = el;
         if (clientWidth === 0 || clientHeight === 0) return;
         setFitScale(
            Math.min(
               clientWidth / logicalSize.width,
               clientHeight / logicalSize.height,
            ),
         );
      };

      update();
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
   }, [el, logicalSize.width, logicalSize.height]);

   return { ref: setEl, fitScale };
}
