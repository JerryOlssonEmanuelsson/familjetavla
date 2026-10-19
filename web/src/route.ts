import { useEffect, useState } from "react";

// Hash routing keeps every route under the same index.html (works behind HA ingress),
// and the browser's – and Android's – back button walks back through the pages.
const stack: string[] = [];

function current() {
  return window.location.hash.slice(1) || "/";
}

if (typeof window !== "undefined") {
  stack.push(current());
  window.addEventListener("hashchange", () => {
    const h = current();
    if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
    else stack.push(h);
  });
}

export function useHash() {
  const [hash, setHash] = useState(current);
  useEffect(() => {
    const on = () => setHash(current());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function navigate(path: string) {
  if (current() !== path) window.location.hash = path;
}

/** Back within the board; from a page opened directly (bookmark, reload) it goes home instead. */
export function goBack() {
  if (stack.length > 1) window.history.back();
  else navigate("/");
}

export function goHome() {
  navigate("/");
}
