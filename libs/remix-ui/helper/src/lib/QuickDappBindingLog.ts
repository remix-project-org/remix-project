export const logQuickDappBinding = (
  event: string,
  details: Record<string, string | number | boolean | null | undefined>
): void => {
  console.info(`[QDBinding] ${event}`, JSON.stringify(details));
};
