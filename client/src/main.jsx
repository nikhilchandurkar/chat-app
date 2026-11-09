import React, { Component } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CssBaseline from '@mui/material/CssBaseline';
import { HelmetProvider } from 'react-helmet-async';
import { Provider } from 'react-redux';
import store from "./redux/store.js";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#202421', color: '#F1F3F0', fontFamily: 'sans-serif', padding: '20px'
        }}>
          <h2>Something went wrong loading Chat App</h2>
          <pre style={{ color: '#ef4444', background: '#181B19', padding: '16px', borderRadius: '8px', maxWidth: '600px', overflowX: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px', padding: '10px 24px', background: '#236B4A', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <HelmetProvider>
          <CssBaseline />
          <App />
        </HelmetProvider>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
