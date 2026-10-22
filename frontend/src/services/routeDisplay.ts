export function shouldShowRoadRoute(
  coordinates: [number, number][] | null | undefined,
) {
  return Boolean(coordinates && coordinates.length > 1)
}
