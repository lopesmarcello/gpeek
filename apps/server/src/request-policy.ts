export function isLocalRequest(
  headers: {
    host?: string | undefined;
    origin?: string | undefined;
    fetchSite?: string | string[] | undefined;
  },
  expectedOrigin: string,
): boolean {
  return (
    headers.host === new URL(expectedOrigin).host &&
    (headers.origin === undefined || headers.origin === expectedOrigin) &&
    headers.fetchSite !== 'cross-site'
  );
}
