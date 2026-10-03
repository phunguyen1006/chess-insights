import { Component } from "react";
import type { ReactNode } from "react";

// Keep account controls and navigation usable when a single view fails.
export class WidgetBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="ci-status" role="alert">
        <p>
          This view could not be displayed. Your saved history is still
          available.
        </p>
        <button type="button" onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
