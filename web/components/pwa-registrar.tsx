"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    const nav = navigator as unknown as { serviceWorker: any };
    const win = window as unknown as { serwist: any };
    if (
      "serviceWorker" in navigator &&
      win.serwist !== undefined &&
      process.env.NODE_ENV !== "development"
    ) {
      // Actually, serwist is just sw.js. Let's just register it simply.
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("Service Worker registered!", reg))
        .catch((err) => console.error("Service Worker registration failed", err));
    } else if ("serviceWorker" in navigator && process.env.NODE_ENV !== "development") {
        navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("Service Worker registered!", reg))
        .catch((err) => console.error("Service Worker registration failed", err));
    }
  }, []);

  return null;
}
