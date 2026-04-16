/**
 * Utility functions for Filter Presets
 * Handles dynamic calculation of top regions and segments
 */

import type { ComparisonData, DataRecord, FilterState } from './types'

/** Segment types that mirror geography breakdowns, not product taxonomy. */
const GEO_DIMENSION_SEGMENT_TYPES = new Set(['By Region', 'By State', 'By Country'])

/** Prefer this order so presets rank markets on product value, not application slices. */
const MARKET_SEGMENT_TYPE_PRIORITY = [
  'By Product Type',
  'By Type',
  'By Technology',
  'By Project Type',
  'By Application',
  'Application / Use Case',
  'By End-Use Sector',
  'By End User',
]

export function getAllCountryGeographies(data: ComparisonData | null): string[] {
  if (!data?.dimensions?.geographies?.countries) return []
  return Object.values(data.dimensions.geographies.countries).flat()
}

function getRegionGeographiesSet(data: ComparisonData | null): Set<string> {
  if (!data) return new Set()
  const regions = data.dimensions.geographies.regions
  if (regions?.length) return new Set(regions)
  const all = data.dimensions.geographies.all_geographies || []
  const countrySet = new Set(getAllCountryGeographies(data))
  return new Set(all.filter((g) => g !== 'Global' && !countrySet.has(g)))
}

/**
 * First segment type used for preset math: excludes By Country / By Region, prefers By Product Type.
 */
export function getFirstMarketSegmentType(data: ComparisonData | null): string | null {
  if (!data?.dimensions?.segments) return null
  const keys = new Set(Object.keys(data.dimensions.segments))
  for (const preferred of MARKET_SEGMENT_TYPE_PRIORITY) {
    if (keys.has(preferred) && !GEO_DIMENSION_SEGMENT_TYPES.has(preferred)) {
      return preferred
    }
  }
  const fallback = Object.keys(data.dimensions.segments).find(
    (k) => !GEO_DIMENSION_SEGMENT_TYPES.has(k)
  )
  return fallback ?? null
}

function sumLeafMarketByGeography(
  records: DataRecord[],
  opts: {
    year: number
    segmentType: string
    geographySet: Set<string>
  }
): Map<string, number> {
  const geographyTotals = new Map<string, number>()
  const { year, segmentType, geographySet } = opts

  const accumulate = (useAggregatedToo: boolean) => {
    geographyTotals.clear()
    records.forEach((record: DataRecord) => {
      const geography = record.geography
      if (geography === 'Global' || !geographySet.has(geography)) return
      if (record.segment_type !== segmentType) return
      if (!useAggregatedToo && record.is_aggregated === true) return

      const value = record.time_series[year] || 0
      geographyTotals.set(geography, (geographyTotals.get(geography) || 0) + value)
    })
  }

  accumulate(false)
  if (geographyTotals.size === 0 || [...geographyTotals.values()].every((v) => v === 0)) {
    accumulate(true)
  }

  return geographyTotals
}

function collectCagrSamplesByGeography(
  records: DataRecord[],
  opts: {
    segmentType: string
    geographySet: Set<string>
    leavesOnly: boolean
  }
): Map<string, number[]> {
  const geographyCAGRs = new Map<string, number[]>()
  records.forEach((record: DataRecord) => {
    const geography = record.geography
    if (geography === 'Global' || !opts.geographySet.has(geography)) return
    if (record.segment_type !== opts.segmentType) return
    if (opts.leavesOnly && record.is_aggregated === true) return
    if (record.cagr === undefined || record.cagr === null) return
    const cagrs = geographyCAGRs.get(geography) || []
    cagrs.push(record.cagr)
    geographyCAGRs.set(geography, cagrs)
  })
  return geographyCAGRs
}

function rankGeographiesByAvgCagr(
  geographyCAGRs: Map<string, number[]>,
  topN: number
): string[] {
  const avgCAGRs = Array.from(geographyCAGRs.entries()).map(([geography, cagrs]) => ({
    geography,
    avgCAGR: cagrs.reduce((a, b) => a + b, 0) / cagrs.length
  }))
  return avgCAGRs
    .sort((a, b) => b.avgCAGR - a.avgCAGR)
    .slice(0, topN)
    .map((item) => item.geography)
}

/**
 * Calculate top regions based on market value for a specific year
 * @param data - The comparison data
 * @param year - The year to evaluate (default 2024)
 * @param topN - Number of top regions to return (default 3)
 * @returns Array of top region names
 */
export function getTopRegionsByMarketValue(
  data: ComparisonData | null,
  year: number = 2023,
  topN: number = 3
): string[] {
  if (!data) return []

  const segmentType = getFirstMarketSegmentType(data)
  if (!segmentType) return []

  const records = data.data.value.geography_segment_matrix
  const regionSet = getRegionGeographiesSet(data)
  if (regionSet.size === 0) return []

  const geographyTotals = sumLeafMarketByGeography(records, {
    year,
    segmentType,
    geographySet: regionSet,
  })

  const sortedGeographies = Array.from(geographyTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([geography]) => geography)

  return sortedGeographies
}

/**
 * Get all first-level segments for a given segment type
 * @param data - The comparison data
 * @param segmentType - The segment type to get segments for
 * @returns Array of first-level segment names
 */
export function getFirstLevelSegments(
  data: ComparisonData | null,
  segmentType: string
): string[] {
  if (!data) return []

  const segmentDimension = data.dimensions.segments[segmentType]
  if (!segmentDimension) return []

  const hierarchy = segmentDimension.hierarchy || {}
  const allSegments = segmentDimension.items || []

  // Find root segments (those that are parents but not children of any other segment)
  const allChildren = new Set(Object.values(hierarchy).flat())
  const firstLevelSegments: string[] = []

  // Add all segments that have children but are not children themselves
  Object.keys(hierarchy).forEach(parent => {
    if (!allChildren.has(parent) && hierarchy[parent].length > 0) {
      firstLevelSegments.push(parent)
    }
  })

  // Also add standalone segments that are neither parents nor children
  allSegments.forEach(segment => {
    if (!allChildren.has(segment) && !hierarchy[segment]) {
      firstLevelSegments.push(segment)
    }
  })

  return firstLevelSegments.sort()
}

/** @deprecated Use getFirstMarketSegmentType — kept for any external imports */
export const getFirstSegmentType = getFirstMarketSegmentType

/**
 * Calculate top regions based on CAGR (Compound Annual Growth Rate)
 * @param data - The comparison data
 * @param topN - Number of top regions to return (default 2)
 * @returns Array of top region names sorted by CAGR
 */
export function getTopRegionsByCAGR(
  data: ComparisonData | null,
  topN: number = 2
): string[] {
  if (!data) return []

  const segmentType = getFirstMarketSegmentType(data)
  if (!segmentType) return []

  const records = data.data.value.geography_segment_matrix
  const regionSet = getRegionGeographiesSet(data)

  let geographyCAGRs = collectCagrSamplesByGeography(records, {
    segmentType,
    geographySet: regionSet,
    leavesOnly: true,
  })
  if (geographyCAGRs.size === 0) {
    geographyCAGRs = collectCagrSamplesByGeography(records, {
      segmentType,
      geographySet: regionSet,
      leavesOnly: false,
    })
  }

  return rankGeographiesByAvgCagr(geographyCAGRs, topN)
}

/**
 * Calculate top countries based on CAGR (Compound Annual Growth Rate)
 * @param data - The comparison data
 * @param topN - Number of top countries to return (default 5)
 * @returns Array of top country names sorted by CAGR
 */
export function getTopCountriesByCAGR(
  data: ComparisonData | null,
  topN: number = 5
): string[] {
  if (!data) return []

  const segmentType = getFirstMarketSegmentType(data)
  if (!segmentType) return []

  const records = data.data.value.geography_segment_matrix
  const countrySet = new Set(getAllCountryGeographies(data))
  if (countrySet.size === 0) return []

  let geographyCAGRs = collectCagrSamplesByGeography(records, {
    segmentType,
    geographySet: countrySet,
    leavesOnly: true,
  })
  if (geographyCAGRs.size === 0) {
    geographyCAGRs = collectCagrSamplesByGeography(records, {
      segmentType,
      geographySet: countrySet,
      leavesOnly: false,
    })
  }

  return rankGeographiesByAvgCagr(geographyCAGRs, topN)
}

/**
 * Create dynamic filter configuration for Top Market preset
 * @param data - The comparison data
 * @returns Partial FilterState with dynamic values
 */
export function createTopMarketFilters(data: ComparisonData | null): Partial<FilterState> {
  const topRegions = getTopRegionsByMarketValue(data, 2023, 3)
  const firstSegmentType = getFirstMarketSegmentType(data)
  const firstLevelSegments = firstSegmentType
    ? getFirstLevelSegments(data, firstSegmentType)
    : []

  return {
    viewMode: 'geography-mode', // Geography on X-axis, segments as series
    geographies: topRegions,
    segments: firstLevelSegments,
    segmentType: firstSegmentType || 'By Product Type',
    yearRange: [2023, 2027],
    dataType: 'value'
  }
}

/**
 * Create dynamic filter configuration for Growth Leaders preset
 * Identifies top 2 regions with highest CAGR and uses first segment type with all first-level segments
 */
export function createGrowthLeadersFilters(data: ComparisonData | null): Partial<FilterState> {
  if (!data) return {
    viewMode: 'geography-mode',
    yearRange: [2025, 2031],
    dataType: 'value'
  }

  // Get top 2 regions with highest CAGR
  const topRegions = getTopRegionsByCAGR(data, 2)
  const firstSegmentType = getFirstMarketSegmentType(data)
  const firstLevelSegments = firstSegmentType
    ? getFirstLevelSegments(data, firstSegmentType)
    : []

  return {
    viewMode: 'geography-mode', // Geography on X-axis, segments as series
    geographies: topRegions,
    segments: firstLevelSegments,
    segmentType: firstSegmentType || 'By Product Type',
    yearRange: [2025, 2031],
    dataType: 'value'
  }
}

/**
 * Create dynamic filter configuration for Emerging Markets preset
 * Identifies top 5 countries with highest CAGR and uses first segment type with all first-level segments
 */
export function createEmergingMarketsFilters(data: ComparisonData | null): Partial<FilterState> {
  if (!data) return {
    viewMode: 'geography-mode',
    yearRange: [2025, 2031],
    dataType: 'value'
  }

  // Get top 5 countries with highest CAGR
  const topCountries = getTopCountriesByCAGR(data, 5)
  const firstSegmentType = getFirstMarketSegmentType(data)
  const firstLevelSegments = firstSegmentType
    ? getFirstLevelSegments(data, firstSegmentType)
    : []

  return {
    viewMode: 'geography-mode', // Geography on X-axis, segments as series
    geographies: topCountries,
    segments: firstLevelSegments,
    segmentType: firstSegmentType || 'By Product Type',
    yearRange: [2025, 2031],
    dataType: 'value'
  }
}
