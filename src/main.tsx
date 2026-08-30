import { StrictMode, Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("BMS Data Platform crashed", error, info); }
  render() {
    if (this.state.error) return <main style={{ padding: 24, fontFamily: "sans-serif", color: "#18222b", background: "#f5f3f1", minHeight: "100vh" }}><h1>Ошибка загрузки монитора</h1><p>{this.state.error.message || "Неизвестная ошибка"}</p><button onClick={() => location.reload()}>Перезагрузить</button></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>,
);
