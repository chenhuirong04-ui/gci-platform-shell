// GCI Executive Desk — Task 16.1: root-level error boundary.
// Defense-in-depth: if any component throws during render (not just the
// auth/session chain this task's confirmed root cause lives in), this
// shows a visible retry screen instead of an uncaught exception leaving
// React's root silently unmounted (a blank page with no console-visible
// explanation to a non-technical user).
import { Component, type ReactNode } from 'react';
import { StartupError } from './StartupScreen';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <StartupError
          message={this.state.error.message || String(this.state.error)}
          onRetry={() => {
            this.setState({ error: null });
            window.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}
