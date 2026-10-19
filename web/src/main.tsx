import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./install";
import { App } from "./App";
import { IpadFrame, wantsIpadFrame } from "./IpadFrame";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode>{wantsIpadFrame() ? <IpadFrame /> : <App />}</StrictMode>);
