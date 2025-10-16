# WGRIB2JS - JS GRIB2 Reader Library

A JavaScript library for reading GRIB2 files with full wgrib2 compatibility, including pattern matching, multiple longitude formats, and automatic wind calculations.

## Installation

```bash
npm install wgrib2js
```

## Quick Start

### Node.js (CommonJS)

```javascript
const fs = require('fs');
const GribReader = require('wgrib2js');

const buffer = fs.readFileSync('your-file.grib');
const reader = new GribReader(buffer.buffer);
reader.parse();

const data = reader.getData({ asObjects: true });
data.forEach(point => {
  console.log(`(${point.lat}, ${point.lng}): U=${point.ugrd}, V=${point.vgrd}`);
});
```

### ES Modules

```javascript
import GribReader from 'wgrib2js';
import { readFileSync } from 'fs';

const buffer = readFileSync('your-file.grib');
const reader = new GribReader(buffer.buffer);
reader.parse();

const data = reader.getData({ asObjects: true });
```

### Browser (CDN)

```html
<!-- Via unpkg CDN (minified) -->
<script src="https://unpkg.com/wgrib2js@1.0.0/dist/grib-reader.min.js"></script>

<!-- Via jsdelivr CDN (minified) -->
<script src="https://cdn.jsdelivr.net/npm/wgrib2js@1.0.0/dist/grib-reader.min.js"></script>

<script>
  fetch('your-file.grib')
    .then(response => response.arrayBuffer())
    .then(buffer => {
      const reader = new GribReader(buffer);
      reader.parse();
      const data = reader.getData({ asObjects: true });
      console.log('Data points:', data.length);
    });
</script>
```

### Available Builds

The package includes multiple optimized builds for different use cases:

| File | Format | Size | Use Case |
|------|--------|------|----------|
| `dist/grib-reader.cjs.js` | CommonJS | 20 KB | Node.js (default) |
| `dist/grib-reader.esm.js` | ES Module | 20 KB | Modern bundlers |
| `dist/grib-reader.umd.js` | UMD | 20 KB | Browser |
| `dist/grib-reader.min.js` | UMD | 20 KB | CDN (alias) |

All builds are minified and include source maps for debugging.

## Data Formats

Wgrib2JS offers **two data formats** and **three longitude formats** to suit your needs:

### Longitude Formats

Choose how longitude coordinates are normalized (similar to wgrib2 options):

```javascript
// Format 1: preserve (default) - Keep exact values from GRIB file
const data = reader.getData({ longitudeFormat: 'preserve' });
// Example: [351.75°, 352.00°, ..., 372.75°, 373.00°]

// Format 2: 0-360 - Normalize to [0, 360) range
const data = reader.getData({ longitudeFormat: '0-360' });
// Example: [351.75°, 352.00°, ..., 359.75°, 0.00°, ..., 13.00°]

// Format 3: -180-180 - Normalize to [-180, +180] (like wgrib2, recommended for web mapping)
const data = reader.getData({ longitudeFormat: '-180-180' });
// Example: [-8.25°, -8.00°, ..., -0.25°, 0.00°, ..., 13.00°]
```

**Recommended:** Use `'-180-180'` for web mapping (Leaflet, Mapbox) and GeoJSON export.

### Pattern Matching (like wgrib2 -match)

Wgrib2JS implements **wgrib2-compatible pattern matching** to filter GRIB messages by regex patterns on inventory lines:

```javascript
// Pattern matching works on inventory lines like:
// "1:0:d=2025101312:UGRD:10 m above ground:33 hour fcst:"

// Example 1: Simple pattern - Extract only UGRD
const data = reader.getData({
  match: ':UGRD:',
  longitudeFormat: '-180-180'
});

// Example 2: Pattern with specific level
const data = reader.getData({
  match: ':UGRD:10 m above ground:'
});

// Example 3: Pattern with alternation - Extract UGRD AND VGRD
const data = reader.getData({
  match: ':(UGRD|VGRD):10 m above ground:'
});
console.log(Object.keys(data)); // ['lat', 'lng', 'ugrd', 'vgrd', ...]

// Example 4: Regex wildcard - All parameters at 10m
const data = reader.getData({
  match: ':.*:10 m above ground:'
});

// Example 5: Filter by forecast time
const data = reader.getData({
  match: ':.*:24 hour fcst:'
});

// Example 6: Complex pattern - Temperature at isobaric levels
const data = reader.getData({
  match: ':TMP:(850|500|250) mb:'
});
```

**Use cases:**
- Extract specific atmospheric levels
- Filter by forecast time
- Select parameter combinations
- Build targeted data queries

### Wind Speed Calculation

Wgrib2JS can automatically calculate wind speed from UGRD and VGRD components:

```javascript
// Calculate wind speed using the formula: sqrt(u² + v²)
const data = reader.getData({ calculateWindSpeed: true });

// Arrays format
console.log(data.wind_speed[0]); // Wind speed in m/s

// Objects format
const data = reader.getData({ asObjects: true, calculateWindSpeed: true });
console.log(data[0].wind_speed); // Wind speed in m/s
```

The calculation is **100% validated** against wgrib2's reference implementation with < 0.000046 m/s difference.

### Wind Direction Calculation

Wgrib2JS can automatically calculate wind direction from UGRD and VGRD components:

```javascript
// Calculate wind direction using meteorological convention
const data = reader.getData({ calculateWindDirection: true });

// Arrays format
console.log(data.wind_dir[0]); // Wind direction in degrees (0-360)

// Objects format
const data = reader.getData({ asObjects: true, calculateWindDirection: true });
console.log(data[0].wind_dir); // Wind direction in degrees

// Calculate both wind speed and direction together
const data = reader.getData({
  calculateWindSpeed: true,
  calculateWindDirection: true
});
```

**Meteorological Convention:**
- Direction represents where wind **comes FROM** (not where it blows to)
- 0° = North wind (from North)
- 90° = East wind (from East)
- 180° = South wind (from South)
- 270° = West wind (from West)

**Formula:** `atan2(-u, -v) * 180 / π`, normalized to [0, 360) range

The calculation is **100% validated** against wgrib2's `-wind_dir` option with < 0.006° difference (average: 0.0025°).

### Wind Rotation (Grid-Relative → Earth-Relative)

Wgrib2JS automatically detects and handles wind rotation for projected grids (like wgrib2 `-new_grid_winds earth`):

```javascript
// Automatic detection and conversion (default: enabled)
const data = reader.getData({ earthRelativeWinds: true });

// For lat-lon grids, no rotation is needed (winds are already earth-relative)
// For projected grids (Lambert, Polar Stereographic), rotation is automatically applied
```

**Note:** For lat-lon grids (Template 0), winds are already earth-relative, so no rotation is performed. For other projections, the library will automatically rotate grid-relative winds to earth-relative coordinates.

### Bilinear Interpolation

Wgrib2JS supports bilinear interpolation for spatial data analysis (like wgrib2 `-new_grid_interpolation bilinear`):

```javascript
// 1. Interpolate at a specific point
const data = reader.getData();
const interpolated = reader.bilinearInterpolate(
  data,
  45.125,  // Target latitude
  0.125,   // Target longitude
  ['ugrd', 'vgrd', 'wind_speed']  // Parameters to interpolate
);

console.log(interpolated);
// {
//   lat: 45.125,
//   lng: 0.125,
//   ugrd: -1.569954,
//   vgrd: -2.320160,
//   wind_speed: 2.805432
// }

// 2. Regrid to a new regular grid
const newGrid = {
  latMin: 44.0,
  latMax: 46.0,
  lngMin: -2.0,
  lngMax: 2.0,
  latStep: 0.5,  // New resolution
  lngStep: 0.5
};

const regridded = reader.regridBilinear(data, newGrid, ['ugrd', 'vgrd']);
// Returns new data object with 9x5 = 45 points (0.5° resolution)
```

The interpolation is **100% validated** against wgrib2 with < 0.000004 m/s difference.

### Data Structure Formats

Wgrib2JS also offers **two data structure formats** to suit your needs:

### Format 1: Separate Arrays (Default) - Best Performance

```javascript
const data = reader.getData();
// Returns: {
//   lat: Float32Array,
//   lng: Float32Array,
//   ugrd: Float32Array,
//   vgrd: Float32Array,
//   metadata: Object,
//   numPoints: Number
// }

// Access data by index
for (let i = 0; i < data.numPoints; i++) {
  const lat = data.lat[i];
  const lng = data.lng[i];
  const u = data.ugrd[i];
  const v = data.vgrd[i];
}
```

**Best for:** Large datasets, numerical computation, performance-critical applications

### Format 2: Array of Objects - Best Usability

```javascript
const data = reader.getData({ asObjects: true });
// Returns: [
//   { lat: 42.750, lng: 351.750, ugrd: -0.492, vgrd: 0.790 },
//   { lat: 42.750, lng: 352.000, ugrd: -0.532, vgrd: -0.220 },
//   ...
// ]

// Easy filtering and manipulation
const strongWind = data.filter(point => {
  const speed = Math.sqrt(point.ugrd ** 2 + point.vgrd ** 2);
  return speed > 10;
});

// Direct JSON export
const json = JSON.stringify(data);
```

**Best for:** REST APIs, JSON export, web frameworks, rapid prototyping

**Performance:**
- Arrays: ~1.5ms for 4,042 points
- Objects: ~8ms for 4,042 points

## Features

✅ **Pattern matching** - Regex filtering like wgrib2 -match (NEW!)
✅ **Three longitude formats** - preserve, 0-360, -180-180 (like wgrib2)
✅ **Two flexible data formats** - Arrays for performance, Objects for usability
✅ **Automatic wind speed calculation** - Equivalent to wgrib2's -wind_speed option
✅ **Automatic wind direction calculation** - Equivalent to wgrib2's -wind_dir option
✅ **Wind rotation** - Auto-detect and convert grid-relative to earth-relative winds
✅ **Bilinear interpolation** - Spatial interpolation and regridding (like wgrib2)
✅ **GRIB2 Template 5.0, 5.2, 5.3** - Simple and Complex Packing with Spatial Differencing
✅ **100% validated against wgrib2** - Perfect accuracy for all features
✅ **Browser-ready** - Pure JavaScript, no dependencies
✅ **Fast parsing** - Handles 1M+ data points efficiently
✅ **Complete metadata** - Grid info, dates, coordinates
✅ **Comprehensive documentation** - Usage guide and examples

## Validation

✅ **VALIDATED** - This library has been thoroughly tested against wgrib2 (NOAA's reference implementation):

### Core Functionality
- **UGRD:** 100% match (< 0.000047 m/s difference)
- **VGRD:** 100% match (< 0.000001 m/s difference)
- **WIND_SPEED:** 100% match (< 0.000046 m/s difference)
- **WIND_DIR:** 100% match (< 0.006° difference, average: 0.0025°)
- **Bilinear Interpolation:** 100% match (< 0.000004 m/s difference)
- **Coordinates:** Exact match with wgrib2

### New Features Validated
- **Pattern matching:** 100% match (simple, complex, and regex patterns)
- **All 3 longitude formats:** 100% validated (preserve, 0-360, -180-180)
- **Pattern `:(UGRD|VGRD):10 m above ground:`:** ✅ Validated

All features have been tested on files with 4K to 1M+ data points.

## Examples

### Example 1: Pattern Matching for Targeted Data Extraction

```javascript
const fs = require('fs');
const GribReader = require('./grib-reader.js');

// Load and parse GRIB file
const buffer = fs.readFileSync('your-file.grib');
const reader = new GribReader(buffer.buffer);
reader.parse();

// Extract only wind components at 10m above ground
const windData = reader.getData({
  match: ':(UGRD|VGRD):10 m above ground:',
  calculateWindSpeed: true,
  calculateWindDirection: true,
  longitudeFormat: '-180-180'
});

console.log(`Extracted: ${windData.numPoints} points`);
console.log(`Parameters: ${Object.keys(windData)
  .filter(k => !['lat', 'lng', 'metadata', 'numPoints'].includes(k))
  .join(', ')}`);

// Find strongest winds
let maxSpeed = 0;
let maxIdx = 0;
for (let i = 0; i < windData.wind_speed.length; i++) {
  if (windData.wind_speed[i] > maxSpeed) {
    maxSpeed = windData.wind_speed[i];
    maxIdx = i;
  }
}

console.log(`\nStrongest wind:`);
console.log(`  Location: ${windData.lat[maxIdx].toFixed(2)}°, ${windData.lng[maxIdx].toFixed(2)}°`);
console.log(`  Speed: ${maxSpeed.toFixed(2)} m/s`);
console.log(`  Direction: ${windData.wind_dir[maxIdx].toFixed(1)}°`);
```

### Example 2: Multiple Longitude Formats

```javascript
const data = reader.getData({
  asObjects: true,
  longitudeFormat: '-180-180',  // Recommended for GeoJSON
  calculateWindSpeed: true
});

const geojson = {
  type: 'FeatureCollection',
  features: data.map(point => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [point.lng, point.lat]
    },
    properties: {
      u: point.ugrd,
      v: point.vgrd,
      speed: point.wind_speed
    }
  }))
};
```

### Example 3: REST API

```javascript
app.get('/api/wind', async (req, res) => {
  const reader = new GribReader(gribBuffer);
  reader.parse();

  const data = reader.getData({ asObjects: true });

  // Filter by area
  const filtered = data.filter(point =>
    point.lat >= req.query.latMin &&
    point.lat <= req.query.latMax
  );

  res.json({ points: filtered });
});
```

### Example 4: Numerical Processing with Wind Analysis

```javascript
// Use array format for performance + automatic wind calculations
const data = reader.getData({
  calculateWindSpeed: true,
  calculateWindDirection: true
});

// Statistics on pre-calculated wind speeds
const maxSpeed = Math.max(...data.wind_speed);
const avgSpeed = data.wind_speed.reduce((a, b) => a + b, 0) / data.numPoints;

console.log(`Max wind speed: ${maxSpeed.toFixed(2)} m/s`);
console.log(`Avg wind speed: ${avgSpeed.toFixed(2)} m/s`);

// Find dominant wind direction
const directions = Array.from(data.wind_dir);
const northWinds = directions.filter(dir => dir >= 337.5 || dir < 22.5).length;
const eastWinds = directions.filter(dir => dir >= 67.5 && dir < 112.5).length;
const southWinds = directions.filter(dir => dir >= 157.5 && dir < 202.5).length;
const westWinds = directions.filter(dir => dir >= 247.5 && dir < 292.5).length;

console.log(`Wind distribution:`);
console.log(`  North: ${northWinds} points`);
console.log(`  East: ${eastWinds} points`);
console.log(`  South: ${southWinds} points`);
console.log(`  West: ${westWinds} points`);
```

### Example 5: Spatial Interpolation and Regridding

```javascript
const data = reader.getData({ calculateWindSpeed: true });

// Get wind conditions at a specific location (e.g., airport)
const airportLocation = reader.bilinearInterpolate(
  data,
  48.7233,  // Paris CDG latitude
  2.3794,   // Paris CDG longitude
  ['ugrd', 'vgrd', 'wind_speed']
);

console.log(`Airport winds: ${airportLocation.wind_speed.toFixed(2)} m/s`);

// Regrid to a coarser resolution for visualization
const coarserGrid = reader.regridBilinear(data, {
  latMin: data.metadata.grid.latMin,
  latMax: data.metadata.grid.latMax,
  lngMin: data.metadata.grid.lngMin,
  lngMax: data.metadata.grid.lngMax,
  latStep: 1.0,  // 1 degree resolution (coarser than 0.25)
  lngStep: 1.0
}, ['ugrd', 'vgrd', 'wind_speed']);

console.log(`Original: ${data.numPoints} points`);
console.log(`Regridded: ${coarserGrid.numPoints} points (faster rendering)`);
```

## License

MIT
