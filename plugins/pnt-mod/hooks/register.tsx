import { atom, read, update } from 'claude-code'
import type { Register, TurnUsage } from 'claude-code'

import type { ContextFill, Spend } from '../types'

const context = atom({ plugin: 'pnt-mod', key: 'context' } as const, null)
const lastTurn = atom({ plugin: 'pnt-mod', key: 'lastTurn' } as const, null)

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

const colorOf = (percent: number) =>
  percent < 30 ? 'success' : percent <= 50 ? 'warning' : 'error'

// Fresh leaves out the cache reads: each call re-reads the conversation.
const freshOf = (u: TurnUsage) =>
  u.input_tokens + u.cache_creation_input_tokens + u.output_tokens

const totalOf = (u: TurnUsage) => freshOf(u) + u.cache_read_input_tokens

export const register: Register = on => {
  // Spend of the prompt in progress, keyed by 'main' or the subagent's type.
  let cycle = new Map<string, Spend>()
  let isMainDone = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    $.ui.status(undefined)
    const { tokens, window, percent } = (await $.session.usage()).context
    await update($, context, () => ({ tokens, window, percent }))
    return result
  })

  on('session.measure', async ($, e, next) => {
    const { tokens, window, percent } = e.context
    await update($, context, () => ({ tokens, window, percent }))
    return next(e)
  })

  // Show the smaller context right after /compact, before the next reply.
  // Hooked on the compaction row, as another plugin answers session.compact.
  on('session.append', { door: 'compaction' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const { tokens, window, percent } = (await $.session.usage()).context
      await update($, context, () => ({ tokens, window, percent }))
    }
    return result
  })

  // A new prompt starts a new count; turns raised by background agents
  // finishing add to the prompt that launched them.
  on('prompt.submit', ($, e, next) => {
    if (e.isMeta === undefined) {
      cycle = new Map()
      isMainDone = false
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const usage = result.usage ?? e.usage

    if (usage) {
      const agent =
        e.agentId === undefined
          ? undefined
          : (await $.agent.list()).find(a => a.id === e.agentId)
      const label = e.agentId === undefined ? 'main' : agent?.type ?? 'agent'
      const spend = cycle.get(label) ?? { label, total: 0, fresh: 0 }
      cycle.set(label, {
        label,
        total: spend.total + totalOf(usage),
        fresh: spend.fresh + freshOf(usage),
      })
    }

    if (e.agentId === undefined) {
      isMainDone = true
    }
    if (isMainDone) {
      const spends = [...cycle.values()]
      await update($, lastTurn, () => spends)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const fill: ContextFill | null = await read($, context)
    const spends: Spend[] | null = await read($, lastTurn)

    if (e.props.hasSurvey || fill === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const percent = fill.percent ?? 0
    const used = fill.tokens === undefined ? '—' : k(fill.tokens)

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>pnt-mod </Text>
          <Text color={colorOf(percent)}>
            ctx: {used} / {k(fill.window)} ({percent}%)
          </Text>
          {percent >= 30 && (
            <Text dimColor> · consider /compact &lt;what to keep&gt; or /clear</Text>
          )}
        </Box>
        {spends !== null && spends.length > 0 && (
          <Text dimColor>
            last prompt:{' '}
            {spends.map(s => `${s.label} ${k(s.total)} total, ${k(s.fresh)} new`).join(' · ')}
          </Text>
        )}
      </Box>
    )
  })
}
