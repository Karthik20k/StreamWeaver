import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to monitor real-time browser FPS.
 * Directly supports Member 1's mission of maintaining 60 FPS under data streaming.
 */
export function useFPSMonitor() {
  const [fps, setFps] = useState(60);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const animFrameId = useRef(null);

  useEffect(() => {
    const loop = (currentTime) => {
      frameCount.current += 1;
      const delta = currentTime - lastTime.current;

      if (delta >= 1000) {
        const currentFps = Math.round((frameCount.current * 1000) / delta);
        setFps(Math.min(60, currentFps));
        frameCount.current = 0;
        lastTime.current = currentTime;
      }

      animFrameId.current = requestAnimationFrame(loop);
    };

    animFrameId.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
      }
    };
  }, []);

  return fps;
}
