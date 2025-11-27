import {
  closestCorners,
  getFirstCollision,
  KeyboardCode,
  DroppableContainer,
  KeyboardCoordinateGetter,
} from '@dnd-kit/core';

// Define the directions that can be used with the keyboard
const directions: string[] = [
  KeyboardCode.Down,
  KeyboardCode.Right,
  KeyboardCode.Up,
  KeyboardCode.Left,
];

// This is a custom coordinate getter for keyboard events.
// It's used to handle keyboard navigation when moving items around in a drag and drop context.
// It determines the next position of an item based on the direction of the keyboard event.
// The function filters droppable containers based on their position relative to the currently dragged item,
// then finds the closest container in the direction of the keyboard event and returns its coordinates.
export const coordinateGetter: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect } }
) => {
  // If the key pressed is one of the defined directions
  if (directions.includes(event.code)) {
    // Prevent the default browser behaviour
    event.preventDefault();

    // If there is no active draggable or collision rectangle, return
    if (!active || !collisionRect) {
      return;
    }

    // Create an array to store the droppable containers that meet the criteria
    const filteredContainers: DroppableContainer[] = [];

    // For each enabled droppable container
    droppableContainers.getEnabled().forEach((entry) => {
      // If the container is not defined or it is disabled, return
      if (!entry || entry?.disabled) {
        return;
      }

      // Get the rectangle of the droppable container
      const rect = droppableRects.get(entry.id);

      // If the rectangle is not defined, return
      if (!rect) {
        return;
      }

      // Get the data of the droppable container
      const data = entry.data.current;

      // If the data is defined
      if (data) {
        const { type, children } = data;

        // If the droppable container is of type 'container' and it has children
        if (type === 'container' && children?.length > 0) {
          // If the active draggable is not of type 'container', return
          if (active.data.current?.type !== 'container') {
            return;
          }
        }
      }

      // Depending on the direction of the keyboard event
      switch (event.code) {
      // If the direction is down and the top of the collision rectangle is above the top of the container rectangle
      case KeyboardCode.Down:
        if (collisionRect.top < rect.top) {
          // Add the container to the array of filtered containers
          filteredContainers.push(entry);
        }
        break;
      // If the direction is up and the top of the collision rectangle is below the top of the container rectangle
      case KeyboardCode.Up:
        if (collisionRect.top > rect.top) {
          // Add the container to the array of filtered containers
          filteredContainers.push(entry);
        }
        break;
      // If the direction is left and the left of the collision rectangle is to the right of the right of the container rectangle
      case KeyboardCode.Left:
        if (collisionRect.left >= rect.left + rect.width) {
          // Add the container to the array of filtered containers
          filteredContainers.push(entry);
        }
        break;
      // If the direction is right and the right of the collision rectangle is to the left of the left of the container rectangle
      case KeyboardCode.Right:
        if (collisionRect.left + collisionRect.width <= rect.left) {
          // Add the container to the array of filtered containers
          filteredContainers.push(entry);
        }
        break;
      }
    });

    // Get the closest corners of the collision rectangle and the filtered containers
    const collisions = closestCorners({
      active,
      collisionRect: collisionRect,
      droppableRects,
      droppableContainers: filteredContainers,
      pointerCoordinates: null,
    });
    // Get the id of the first collision
    const closestId = getFirstCollision(collisions, 'id');

    // If there is a closest id
    if (closestId != null) {
      // Get the droppable container with the closest id
      const newDroppable = droppableContainers.get(closestId);
      // Get the node and rectangle of the droppable container
      const newNode = newDroppable?.node.current;
      const newRect = newDroppable?.rect.current;

      // If there is a node and rectangle
      if (newNode && newRect) {
        // If the droppable container is the placeholder
        if (newDroppable.id === 'placeholder') {
          // Return the center coordinates of the droppable container
          return {
            x: newRect.left + (newRect.width - collisionRect.width) / 2,
            y: newRect.top + (newRect.height - collisionRect.height) / 2,
          };
        }

        // If the droppable container is of type 'container'
        if (newDroppable.data.current?.type === 'container') {
          // Return specific coordinates within the droppable container
          return {
            x: newRect.left + 20,
            y: newRect.top + 74,
          };
        }

        // Otherwise, return the top left coordinates of the droppable container
        return {
          x: newRect.left,
          y: newRect.top,
        };
      }
    }
  }

  // If none of the above conditions are met, return undefined
  return undefined;
};
