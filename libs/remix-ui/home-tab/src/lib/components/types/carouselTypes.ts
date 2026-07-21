import * as React from "react";
export interface ResponsiveType {
  [key: string]: {
    breakpoint: { max: number; min: number };
    items: number;
    partialVisibilityGutter?: number; // back-ward compatible, because previously there has been a typo
    paritialVisibilityGutter?: number;
    slidesToSlide?: number;
  };
}
export function isMouseMoveEvent(
  e: React.MouseEvent | React.TouchEvent
): e is React.MouseEvent {
  return "clientX" in e && "clientY" in e;
}
export interface CarouselProps {
  responsive: ResponsiveType;
  deviceType?: string;
  ssr?: boolean;
  slidesToSlide?: number;
  draggable?: boolean;
  arrows?: boolean; // show or hide arrows.
  renderArrowsWhenDisabled?: boolean; // Allow for the arrows to have a disabled attribute instead of not showing them
  swipeable?: boolean;
  removeArrowOnDeviceType?: string | Array<string>;
  children: any;
  customLeftArrow?: React.ReactElement<any> | null;
  customRightArrow?: React.ReactElement<any> | null;
  customDot?: React.ReactElement<any> | null;
  customButtonGroup?: React.ReactElement<any> | null;
  infinite?: boolean;
  minimumTouchDrag?: number; // default 50px. The amount of distance to drag / swipe in order to move to the next slide.
  afterChange?: (previousSlide: number, state: StateCallBack) => void; // Change callback after sliding every time. `(previousSlide, currentState) => ...`
  beforeChange?: (nextSlide: number, state: StateCallBack) => void; // Change callback before sliding every time. `(previousSlide, currentState) => ...`
  sliderClass?: string; // Use this to style your own track list.
  itemClass?: string; // Use this to style your own Carousel item. For example add padding-left and padding-right
  itemAriaLabel?: string; // Use this to add your own Carousel item aria-label.if it is not defined the child aria label will be applied if the child doesn't have one, then a default empty string will be applied
  containerClass?: string; // Use this to style the whole container. For example add padding to allow the "dots" or "arrows" to go to other places without being overflown.
  className?: string; // Use this to style the whole container with styled-components
  dotListClass?: string; // Use this to style the dot list.
  keyBoardControl?: boolean;
  centerMode?: boolean; // show previous and next set of items partially
  autoPlay?: boolean;
  autoPlaySpeed?: number; // default 3000ms
  showDots?: boolean;
  renderDotsOutside?: boolean; // show dots outside of the container for custom styling.
  renderButtonGroupOutside?: boolean; // show buttonGroup outside of the container for custom styling.
  // Show next/previous item partially
  // partialVisible has to be used in conjunction with the responsive props, details are in documentation.
  // it shows the next set of items partially, different from centerMode as it shows both.
  partialVisible?: boolean;
  partialVisbile?: boolean; // old typo - deprecated (will be remove in 3.0)
  customTransition?: string;
  transitionDuration?: number;
  // if you are using customTransition, make sure to put the duration here.
  // for example, customTransition="all .5"  then put transitionDuration as 500.
  // this is needed for the resizing to work.
  focusOnSelect?: boolean;
  additionalTransfrom?: number; // this is only used if you want to add additional transform to the current transform
  pauseOnHover?: boolean;
  shouldResetAutoplay?: boolean;
  rewind?: boolean;
  rewindWithAnimation?: boolean;
  rtl?: boolean;
}

export type StateCallBack = CarouselInternalState;

export type Direction = "left" | "right" | "" | undefined;
export type SkipCallbackOptions =
  | boolean
  | { skipBeforeChange?: boolean; skipAfterChange?: boolean };
export interface ButtonGroupProps {
  previous?: () => void;
  next?: () => void;
  goToSlide?: (index: number, skipCallbacks?: SkipCallbackOptions) => void;
  carouselState?: StateCallBack;
}
export interface ArrowProps {
  onClick?: () => void;
  carouselState?: StateCallBack;
}
export interface DotProps {
  index?: number;
  active?: boolean;
  onClick?: () => void;
  carouselState?: StateCallBack;
}

export interface CarouselInternalState {
  itemWidth: number;
  containerWidth: number;
  slidesToShow: number;
  currentSlide: number;
  totalItems: number;
  domLoaded: boolean;
  deviceType?: string;
  transform: number;
}

export default class Carousel extends React.Component<CarouselProps> {
  previous: (slidesHavePassed: number) => void;
  next: (slidesHavePassed: number) => void;
  goToSlide: (slide: number, skipCallbacks?: SkipCallbackOptions) => void;

  setClones: (
    slidesToShow: number,
    itemWidth?: number,
    forResizing?: boolean
  ) => void; // reset carousel in infinite mode.
  setItemsToShow: (shouldCorrectItemPosition?: boolean) => void; // reset carousel in non-infinite mode.
  correctClonesPosition: ({ domLoaded }: { domLoaded: boolean }) => void;
  onMove: boolean;
  direction: Direction;
  containerRef: React.RefObject<HTMLDivElement>;
}

export type localeLang = {
  code: string
  localeName: string
  messages: { [key: string]: string }
  name: string
}

export interface UpdateInfo {
  badge: string
  title: string
  description: string
  descriptionList?: string[]
  icon: string
  action: {
    type: 'link' | 'methodCall'
    label: string
    url?: string
    pluginName?: string
    pluginMethod?: string,
    pluginArgs?: (string | number | boolean | object | null)[]
  },
  theme: string
}
