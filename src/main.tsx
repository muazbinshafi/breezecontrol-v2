import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Belt-and-suspenders: unregister any stale service worker in preview/iframe.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
if (isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);
