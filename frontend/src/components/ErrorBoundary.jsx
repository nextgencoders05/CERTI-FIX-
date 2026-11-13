import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-slate-500">An unexpected error occurred while displaying this page. Please reload and try again.</p>
        <button onClick={() => window.location.reload()} className="gradient-bg mt-6 rounded-lg px-4 py-2 text-sm font-medium text-white">Reload page</button>
      </div>
    )
  }
}
