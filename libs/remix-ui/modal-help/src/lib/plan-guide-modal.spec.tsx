import React from 'react'
import { strict as assert } from 'assert'
import { renderToStaticMarkup } from 'react-dom/server'
import PlanGuideModal, { PlanGuideModalProps } from './plan-guide-modal'

const defaultProps: PlanGuideModalProps = {
  open: true,
  onClose: () => {},
  planName: 'Remix Free',
  accent: '#6bdb8a',
  intro: 'Welcome to Remix!',
  demos: []
}

describe('PlanGuideModal guide customisation', () => {
  it('renders the Free call to action in bright white after the intro', () => {
    const markup = renderToStaticMarkup(
      <PlanGuideModal {...defaultProps} introAction="Click any feature below to see it in action." />
    )

    assert.match(markup, /Welcome to Remix!<span style="color:#ffffff"> Click any feature below to see it in action\.<\/span>/)
  })

  for (const planName of ['Remix Starter', 'Remix Pro']) {
    it(`preserves the ${planName} intro and default chat title when optional props are omitted`, () => {
      const markup = renderToStaticMarkup(
        <PlanGuideModal {...defaultProps} planName={planName} intro="Try a demo of each below." />
      )

      assert.match(markup, /Try a demo of each below\.<\/div>/)
      assert.match(markup, />RemixAI Assistant<\/div>/)
      assert.doesNotMatch(markup, /Click any feature below to see it in action/)
    })
  }

  it('uses the custom Free chat title and preserves the bottom prompt in white', () => {
    const markup = renderToStaticMarkup(
      <PlanGuideModal {...defaultProps} chatTitle="RemixAI" />
    )

    assert.match(markup, />RemixAI<\/div>/)
    assert.doesNotMatch(markup, /RemixAI Assistant/)
    assert.match(markup, /<div style="[^"]*color:#ffffff[^"]*">Click on any feature above to see it in action and for more information about how it works\.<\/div>/)
  })
})
