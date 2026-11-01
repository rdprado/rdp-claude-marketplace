export type ContextFill = { tokens?: number; window: number; percent?: number }

export type Spend = { label: string; total: number; fresh: number }

declare module 'claude-code' {
  interface PluginState {
    'rdp-mod': { context: ContextFill | null; lastTurn: Spend[] | null }
  }
}
