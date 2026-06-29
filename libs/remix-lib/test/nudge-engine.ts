import tape from 'tape'
import { NudgeEngine } from '../src/state-machine/nudge-engine'
import { all, any } from '../src/state-machine/event-guard'

// ─── Helper ──────────────────────────────────────────────────────────

function makeEngine() {
  return new NudgeEngine()
}

// ─── Basic rule triggering ───────────────────────────────────────────

tape('NudgeEngine: single event rule triggers', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'simple',
    condition: 'user:logged_in',
    action: { type: 'toast', message: 'Welcome!' },
    showOnce: false
  })

  engine.fire('user:logged_in')
  t.deepEqual(triggered, ['simple'])
  t.end()
})

tape('NudgeEngine: all() combinator rule triggers when all conditions met', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'try-opus',
    condition: all('user:logged_in', 'user:beta_tester', 'ai:model:mistral'),
    action: { type: 'toast', message: 'Try Opus!', actionLabel: 'Switch' },
    showOnce: false
  })

  engine.fire('user:logged_in')
  t.equal(triggered.length, 0, 'not yet — missing conditions')
  engine.fire('user:beta_tester')
  t.equal(triggered.length, 0, 'still missing ai:model:mistral')
  engine.fire('ai:model:mistral')
  t.deepEqual(triggered, ['try-opus'])
  t.end()
})

tape('NudgeEngine: any() combinator rule triggers on first match', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'any-model',
    condition: any('ai:model:opus', 'ai:model:sonnet'),
    action: { type: 'toast', message: 'You have a premium model!' },
    showOnce: false
  })

  engine.fire('ai:model:sonnet')
  t.deepEqual(triggered, ['any-model'])
  t.end()
})

// ─── showOnce: 'session' ─────────────────────────────────────────────

tape('NudgeEngine: showOnce session — shows once per session', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  // Use showOnce: false on the rule but we'll test session manually
  // Actually, EventGuard.when() is one-shot by default so the rule fires once.
  // showOnce: 'session' prevents re-activation from showing again.
  engine.addRule({
    id: 'session-nudge',
    condition: 'event:a',
    action: { type: 'toast', message: 'Hey!' },
    showOnce: 'session'
  })

  engine.fire('event:a')
  t.equal(triggered.length, 1, 'fires first time')

  // Re-add the same rule (simulating re-registration)
  engine.addRule({
    id: 'session-nudge',
    condition: 'event:a',
    action: { type: 'toast', message: 'Hey!' },
    showOnce: 'session'
  })
  engine.fire('event:a')
  t.equal(triggered.length, 1, 'does not fire again in same session')
  t.end()
})

// ─── showOnce: true (default) — persistent ──────────────────────────

tape('NudgeEngine: showOnce true (default) — shows once ever', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'persistent-nudge',
    condition: 'event:b',
    action: { type: 'modal', message: 'New feature!' }
    // showOnce defaults to true
  })

  engine.fire('event:b')
  t.equal(triggered.length, 1, 'fires first time')
  t.ok(engine.getShownNudges().includes('persistent-nudge'), 'tracked in session')

  // Reset for next test
  engine.resetShown('persistent-nudge')
  t.end()
})

// ─── Enable / disable rules ─────────────────────────────────────────

tape('NudgeEngine: disabled rule does not trigger', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'disabled-one',
    condition: 'event:c',
    action: { type: 'toast', message: 'Nope' },
    enabled: false,
    showOnce: false
  })

  engine.fire('event:c')
  t.equal(triggered.length, 0, 'disabled rule does not fire')

  engine.enableRule('disabled-one')
  engine.fire('event:c')
  t.equal(triggered.length, 1, 'fires after enabling')
  t.end()
})

tape('NudgeEngine: disableRule stops an active rule', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'will-disable',
    condition: all('x', 'y'),
    action: { type: 'toast', message: 'Test' },
    showOnce: false
  })

  engine.fire('x')
  engine.disableRule('will-disable')
  engine.fire('y')
  t.equal(triggered.length, 0, 'disabled before condition met — never fires')
  t.end()
})

// ─── removeRule ──────────────────────────────────────────────────────

tape('NudgeEngine: removeRule cleans up', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'temp',
    condition: 'event:d',
    action: { type: 'hint', message: 'Temp' },
    showOnce: false
  })

  engine.removeRule('temp')
  t.ok(!engine.getRuleIds().includes('temp'), 'rule removed from map')

  engine.fire('event:d')
  t.equal(triggered.length, 0, 'removed rule does not fire')
  t.end()
})

// ─── Multiple rules ──────────────────────────────────────────────────

tape('NudgeEngine: multiple rules trigger independently', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'rule-a',
    condition: 'shared:event',
    action: { type: 'toast', message: 'A' },
    showOnce: false
  })
  engine.addRule({
    id: 'rule-b',
    condition: all('shared:event', 'extra'),
    action: { type: 'toast', message: 'B' },
    showOnce: false
  })

  engine.fire('shared:event')
  t.deepEqual(triggered, ['rule-a'], 'only rule-a fires (rule-b needs extra)')

  engine.fire('extra')
  t.deepEqual(triggered, ['rule-a', 'rule-b'], 'both fired')
  t.end()
})

// ─── addRulesFromJSON ────────────────────────────────────────────────

tape('NudgeEngine: addRulesFromJSON deserializes and activates', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRulesFromJSON([{
    id: 'from-api',
    condition: { all: ['user:logged_in', 'feature:new_compiler']},
    action: { type: 'modal', message: 'New compiler available!', actionLabel: 'Try it' },
    showOnce: false
  }])

  engine.fire('user:logged_in')
  engine.fire('feature:new_compiler')
  t.deepEqual(triggered, ['from-api'])
  t.end()
})

// ─── onNudge unsubscribe ─────────────────────────────────────────────

tape('NudgeEngine: onNudge returns unsubscribe function', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  const unsub = engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'unsub-test',
    condition: 'event:e',
    action: { type: 'toast', message: 'Test' },
    showOnce: false
  })

  unsub()
  engine.fire('event:e')
  t.equal(triggered.length, 0, 'callback not called after unsubscribe')
  t.end()
})

// ─── resetShown ──────────────────────────────────────────────────────

tape('NudgeEngine: resetShown clears all', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'reset-test',
    condition: 'event:f',
    action: { type: 'toast', message: 'Test' },
    showOnce: 'session'
  })

  engine.fire('event:f')
  t.equal(triggered.length, 1)

  engine.resetShown()
  t.deepEqual(engine.getShownNudges(), [], 'shown state cleared')
  t.end()
})

// ─── Nested combinators ─────────────────────────────────────────────

tape('NudgeEngine: nested all(any(...), event) works', (t) => {
  const engine = makeEngine()
  const triggered: string[] = []
  engine.onNudge((rule) => triggered.push(rule.id))

  engine.addRule({
    id: 'nested',
    condition: all(any('role:beta', 'role:admin'), 'page:settings'),
    action: { type: 'hint', message: 'New settings available' },
    showOnce: false
  })

  engine.fire('role:beta')
  t.equal(triggered.length, 0, 'any() satisfied but all() not yet')
  engine.fire('page:settings')
  t.deepEqual(triggered, ['nested'])
  t.end()
})

// ─── Action payload preserved ────────────────────────────────────────

tape('NudgeEngine: full action payload passed to callback', (t) => {
  const engine = makeEngine()
  let receivedAction: any = null
  engine.onNudge((rule) => { receivedAction = rule.action })

  engine.addRule({
    id: 'action-test',
    condition: 'trigger',
    action: {
      type: 'modal',
      title: 'Upgrade Model',
      message: 'Switch to Opus for 10x better output',
      actionLabel: 'Switch now',
      actionTarget: 'remixAI::switchModel::opus'
    },
    showOnce: false
  })

  engine.fire('trigger')
  t.equal(receivedAction.type, 'modal')
  t.equal(receivedAction.title, 'Upgrade Model')
  t.equal(receivedAction.actionLabel, 'Switch now')
  t.equal(receivedAction.actionTarget, 'remixAI::switchModel::opus')
  t.end()
})

// ─── has() checks ────────────────────────────────────────────────────

tape('NudgeEngine: has() reflects fired events', (t) => {
  const engine = makeEngine()
  t.notOk(engine.has('user:logged_in'), 'not fired yet')
  engine.fire('user:logged_in')
  t.ok(engine.has('user:logged_in'), 'fired')
  t.end()
})
