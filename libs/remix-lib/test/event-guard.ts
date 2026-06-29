'use strict'
import tape from 'tape'
import { EventGuard, all, any, sequence } from '../src/state-machine/event-guard'

tape('EventGuard — basic fire and has', function (t) {
  const guard = new EventGuard()

  t.false(guard.has('A'), 'event A not fired yet')
  guard.fire('A')
  t.true(guard.has('A'), 'event A is fired')
  t.deepEqual(guard.getFiredEvents(), ['A'], 'getFiredEvents returns A')

  // Idempotent — firing again does nothing
  guard.fire('A')
  t.deepEqual(guard.getFiredEvents(), ['A'], 'duplicate fire is idempotent')

  t.end()
})

tape('EventGuard — when() with single event', function (t) {
  const guard = new EventGuard()
  let called = 0

  guard.when('A', () => { called++ })
  t.equal(called, 0, 'callback not called before event')

  guard.fire('A')
  t.equal(called, 1, 'callback called when event fires')

  // One-shot: shouldn't fire again
  guard.fire('B')
  t.equal(called, 1, 'one-shot callback does not fire again')

  t.end()
})

tape('EventGuard — when() late registration (condition already met)', function (t) {
  const guard = new EventGuard()
  guard.fire('A')

  let called = 0
  guard.when('A', () => { called++ })
  t.equal(called, 1, 'late registration fires immediately when condition already met')

  t.end()
})

tape('EventGuard — all() combinator', function (t) {
  const guard = new EventGuard()
  let called = 0

  guard.when(all('A', 'B', 'C'), () => { called++ })

  guard.fire('A')
  t.equal(called, 0, 'not yet — only A fired')

  guard.fire('C')
  t.equal(called, 0, 'not yet — only A and C fired')

  guard.fire('B')
  t.equal(called, 1, 'all three fired — callback triggered')

  t.end()
})

tape('EventGuard — any() combinator', function (t) {
  const guard = new EventGuard()
  let called = 0

  guard.when(any('X', 'Y', 'Z'), () => { called++ })

  guard.fire('Y')
  t.equal(called, 1, 'any() fires on first matching event')

  // One-shot: second matching event should not re-fire
  guard.fire('X')
  t.equal(called, 1, 'one-shot any() does not re-fire')

  t.end()
})

tape('EventGuard — sequence() combinator (in-order)', function (t) {
  const guard = new EventGuard()
  let called = 0

  guard.when(sequence('A', 'B', 'C'), () => { called++ })

  guard.fire('A')
  t.equal(called, 0, 'sequence: only A so far')

  guard.fire('B')
  t.equal(called, 0, 'sequence: A then B so far')

  guard.fire('C')
  t.equal(called, 1, 'sequence: A then B then C — satisfied')

  t.end()
})

tape('EventGuard — sequence() rejects out-of-order', function (t) {
  const guard = new EventGuard()
  let called = 0

  guard.when(sequence('A', 'B', 'C'), () => { called++ })

  guard.fire('C')
  t.equal(called, 0, 'C first — sequence not satisfied')

  guard.fire('B')
  t.equal(called, 0, 'C then B — still not satisfied')

  guard.fire('A')
  // All events are present but in wrong order (C, B, A instead of A, B, C)
  t.equal(called, 0, 'all events present but wrong order — not satisfied')

  t.end()
})

tape('EventGuard — nested combinators', function (t) {
  const guard = new EventGuard()
  let called = 0

  // all(A, any(B, C))
  guard.when(all('A', any('B', 'C')), () => { called++ })

  guard.fire('A')
  t.equal(called, 0, 'only A — any(B,C) not met')

  guard.fire('C')
  t.equal(called, 1, 'A + C satisfies all(A, any(B,C))')

  t.end()
})

tape('EventGuard — deeply nested combinators', function (t) {
  const guard = new EventGuard()
  let called = 0

  // all('EDITOR', any('SOLIDITY', 'VYPER'), sequence('WORKSPACE', 'CACHE'))
  guard.when(
    all('EDITOR', any('SOLIDITY', 'VYPER'), sequence('WORKSPACE', 'CACHE')),
    () => { called++ }
  )

  guard.fire('EDITOR')
  guard.fire('VYPER')
  t.equal(called, 0, 'missing sequence part')

  guard.fire('WORKSPACE')
  t.equal(called, 0, 'sequence needs CACHE after WORKSPACE')

  guard.fire('CACHE')
  t.equal(called, 1, 'all conditions met including sequence')

  t.end()
})

tape('EventGuard — waitFor() resolves', function (t) {
  t.plan(1)
  const guard = new EventGuard()

  guard.waitFor('A').then(() => {
    t.pass('waitFor resolved')
  })

  guard.fire('A')
})

tape('EventGuard — waitFor() resolves immediately when already met', function (t) {
  t.plan(1)
  const guard = new EventGuard()
  guard.fire('A')

  guard.waitFor('A').then(() => {
    t.pass('waitFor resolved immediately for already-fired event')
  })
})

tape('EventGuard — waitFor() with timeout rejects', function (t) {
  t.plan(1)
  const guard = new EventGuard()

  guard.waitFor('NEVER', 50).catch((err) => {
    t.ok(err.message.includes('timed out'), 'waitFor rejects on timeout')
  })
})

tape('EventGuard — waitFor() with all() combinator', function (t) {
  t.plan(1)
  const guard = new EventGuard()

  guard.waitFor(all('X', 'Y')).then(() => {
    t.pass('waitFor with all() resolved')
  })

  guard.fire('X')
  guard.fire('Y')
})

tape('EventGuard — unsubscribe function', function (t) {
  const guard = new EventGuard()
  let called = 0

  const unsub = guard.when('A', () => { called++ })
  unsub()

  guard.fire('A')
  t.equal(called, 0, 'unsubscribed callback is not called')

  t.end()
})

tape('EventGuard — no double-fire on one-shot', function (t) {
  const guard = new EventGuard()
  let called = 0

  guard.when(all('A', 'B'), () => { called++ })

  guard.fire('A')
  guard.fire('B')
  t.equal(called, 1, 'fires once')

  // Fire more events — should not re-trigger
  guard.fire('C')
  guard.fire('A') // idempotent anyway
  t.equal(called, 1, 'still only fired once')

  t.end()
})

tape('EventGuard — multiple registrations on same events', function (t) {
  const guard = new EventGuard()
  let count1 = 0
  let count2 = 0

  guard.when('A', () => { count1++ })
  guard.when('A', () => { count2++ })

  guard.fire('A')
  t.equal(count1, 1, 'first callback fired')
  t.equal(count2, 1, 'second callback fired')

  t.end()
})

tape('EventGuard — reset clears all state', function (t) {
  const guard = new EventGuard()
  guard.fire('A')
  guard.fire('B')

  guard.reset()
  t.false(guard.has('A'), 'A cleared after reset')
  t.false(guard.has('B'), 'B cleared after reset')
  t.deepEqual(guard.getFiredEvents(), [], 'no fired events after reset')

  t.end()
})
