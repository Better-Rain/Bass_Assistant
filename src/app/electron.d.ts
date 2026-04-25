export {}

declare global {
  interface Window {
    redlineWindow?: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}
