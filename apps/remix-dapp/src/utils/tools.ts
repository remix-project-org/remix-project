export function isMobile(): boolean {
  const userAgentInfo = navigator.userAgent.toLowerCase();
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  const mobileAgents = [
    'android',
    'iphone',
    'symbianos',
    'windows phone',
    'ipad',
    'ipod',
  ];
  const isMobileUA = mobileAgents.some((agent) => userAgentInfo.includes(agent));

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const isLargeScreen = screenWidth >= 1024;
  const isSmallScreen = screenWidth <= 767;
  const isNarrowHeight = screenHeight <= 600;

  if (isLargeScreen) {
    return false;
  }

  if (isSmallScreen) {
    return isMobileUA || isTouchDevice;
  }

  if (isNarrowHeight && isMobileUA) {
    return true;
  }

  if (isMobileUA && isTouchDevice) {
    return true;
  }

  return false;
}
