
import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ hasError: true })
    console.error(error, errorInfo)
  }

  render() {
    // eslint-disable-next-line ts/ban-ts-comment
    // @ts-expect-error
    if (this.state.hasError) {
      return (
        <div>
          Oops! An error occurred. This could be due to an ECharts runtime error or invalid SVG content.
          <br />
          (see the browser console for more information)
        </div>
      )
    }
    // eslint-disable-next-line ts/ban-ts-comment
    // @ts-expect-error
    return this.props.children
  }
}


export default ErrorBoundary