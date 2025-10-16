const fs = require('fs');
const GribReader = require('./grib-reader.js');

// Example: Read a GRIB2 file and extract wind data
const buffer = fs.readFileSync('your-file.grib');
const reader = new GribReader(buffer.buffer);

// Parse the GRIB file
reader.parse();

// Example 1: Get all data with automatic wind calculations
const data = reader.getData({
  calculateWindSpeed: true,
  calculateWindDirection: true,
  longitudeFormat: '-180-180'
});

console.log(`Total points: ${data.numPoints}`);
console.log(`Parameters: ${Object.keys(data).filter(k => !['lat', 'lng', 'metadata', 'numPoints'].includes(k)).join(', ')}`);

// Example 2: Use pattern matching to extract specific parameters
const windAt10m = reader.getData({
  match: ':(UGRD|VGRD):10 m above ground:',
  calculateWindSpeed: true,
  asObjects: true
});

console.log(`\nFirst 3 points at 10m above ground:`);
windAt10m.slice(0, 3).forEach(point => {
  console.log(`  Lat: ${point.lat.toFixed(2)}°, Lng: ${point.lng.toFixed(2)}°, Speed: ${point.wind_speed.toFixed(2)} m/s`);
});

// Example 3: Get inventory
const inventory = reader.getInventory();
console.log(`\nInventory (${inventory.length} messages):`);
inventory.slice(0, 5).forEach(entry => {
  console.log(`  ${entry.inventoryLine}`);
});
