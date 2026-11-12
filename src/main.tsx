import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Output } from "./components/Output";
import "./styles.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="recovery">
        <h1>The studio needs a refresh.</h1>
        <p>Your last saved project is stored on this device.</p>
        <button onClick={() => location.reload()}>Reload studio</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {location.pathname === "/output" ? (
      <Output />
    ) : location.pathname === "/presenter" ? (
      <Output presenter />
    ) : (
      <App />
    )}
  </ErrorBoundary>,
);
