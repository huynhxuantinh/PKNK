import React, { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          padding: '2rem',
          maxWidth: '600px',
          margin: '3rem auto',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
          textAlign: 'center',
          fontFamily: "'Montserrat', sans-serif",
          color: '#1a3348',
        }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#087493' }}>
            Đã có sự cố xảy ra khi tải nội dung
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#526677', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Vui lòng làm mới lại trang hoặc thử lại sau vài giây.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '999px',
              border: 'none',
              background: '#148eb0',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Tải lại trang
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
