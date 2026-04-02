import React, { useState } from 'react'
import { useAccordionButton } from 'react-bootstrap/AccordionButton' 

export type CustomAccordionToggleProps = {
  children: React.ReactNode
  eventKey: string
  callback?: any
}

export default function CustomAccordionToggle({ children, eventKey }: CustomAccordionToggleProps) {
  const [toggleAccordion, setToggleAccordion] = useState(false)

  const decoratedOnClick = useAccordionButton(eventKey, () =>
    setToggleAccordion(!toggleAccordion)
  )

  return (
    <div
      onClick={decoratedOnClick}
      className="flex flex-row justify-between items-center mx-3"
    >
      {children}
      <i className={toggleAccordion ? 'far fa-angle-down' : 'far fa-angle-right'}></i>
    </div>
  )
}
