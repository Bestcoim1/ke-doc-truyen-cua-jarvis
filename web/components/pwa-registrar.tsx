"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (
      "serviceWorker" in navigator &&
      process.env.NODE_ENV !== "development"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("Service Worker registered!", reg))
        .catch((err) => console.error("Service Worker registration failed", err));
    }
  }, []);

  return null;
}
