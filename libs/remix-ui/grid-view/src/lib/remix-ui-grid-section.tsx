import React, {createContext, ReactNode, useEffect, useState} from 'react' // eslint-disable-line
import './remix-ui-grid-section.css'

// Define the type for the context value
interface ChildCallbackContextType {
  onChildCallback: (id: string, enabled: boolean) => void;
}

// Create the context with a default value of `null`
export const ChildCallbackContext = createContext<ChildCallbackContextType | null>(null);

interface ChildState {
  id: string;
  enabled: boolean;
}

interface RemixUIGridSectionProps {
  plugin: any
  title?: string
  tooltipTitle?: string
  hScrollable: boolean
  classList?: string
  styleList?: any
  children?: ReactNode
  expandedCell?: any
}

export const RemixUIGridSection = (props: RemixUIGridSectionProps) => {

  const [hide, setHide] = useState(false);
  const [childrenStates, setChildrenStates] = useState<ChildState[]>([]);

  // Callback to update the state of a child
  const onChildCallback = (id: string, enabled: boolean) => {
    setChildrenStates((prev) => {
      const existingChild = prev.find((child) => child.id === id);

      if (existingChild) {
        // Update existing child
        return prev.map((child) =>
          child.id === id ? { ...child, enabled } : child
        );
      } else {
        // Add new child
        return [...prev, { id, enabled }];
      }
    });
  };

  useEffect(() => {
    // Check if all children are disabled
    const allDisabled = childrenStates.every((child) => !child.enabled);
    setHide(allDisabled);
  }, [childrenStates]);

  return (
    <ChildCallbackContext.Provider value={{ onChildCallback }}>
      <div
        className={`${hide? 'd-none': `d-flex px-4 py-2 flex-column w-100 remixui_grid_section_container ${props.classList}`}`}
        data-id={"remixUIGS" + props.title}
        style={{ overflowX: 'auto' }}
      >
        <div className={`w-100 remixui_grid_section`}>
          { props.title && <h6 className={`mt-1 mb-0 align-items-left`}>{ props.title }</h6> }
          <div className={(props.hScrollable) ? `d-flex flex-row pb-2  overflow-auto` : `d-flex flex-wrap`}>
            { props.children }
          </div>
          { props.expandedCell && <div>
            { props.expandedCell }
          </div>
          }
        </div>
      </div>
    </ChildCallbackContext.Provider>
  )
}

export default RemixUIGridSection
