// Test all build formats
const fs = require('fs');

console.log('Testing all build formats...\n');

// Test 1: CommonJS (default)
console.log('1. Testing CommonJS (dist/grib-reader.cjs.js)...');
const GribReaderCJS = require('./dist/grib-reader.cjs.js');
const buffer1 = fs.readFileSync('data/meteo.grib');
const reader1 = new GribReaderCJS(buffer1.buffer);
reader1.parse();
const data1 = reader1.getData();
console.log(`   ✓ CJS works - ${data1.numPoints} points parsed\n`);

// Test 2: UMD
console.log('2. Testing UMD (dist/grib-reader.umd.js)...');
const GribReaderUMD = require('./dist/grib-reader.umd.js');
const buffer2 = fs.readFileSync('data/meteo.grib');
const reader2 = new GribReaderUMD(buffer2.buffer);
reader2.parse();
const data2 = reader2.getData();
console.log(`   ✓ UMD works - ${data2.numPoints} points parsed\n`);

// Test 3: Minified UMD
console.log('3. Testing Minified UMD (dist/grib-reader.min.js)...');
const GribReaderMin = require('./dist/grib-reader.min.js');
const buffer3 = fs.readFileSync('data/meteo.grib');
const reader3 = new GribReaderMin(buffer3.buffer);
reader3.parse();
const data3 = reader3.getData();
console.log(`   ✓ Minified works - ${data3.numPoints} points parsed\n`);

// Test 4: Package main entry point
console.log('4. Testing package main entry point (require("./"))...');
const GribReaderMain = require('./');
const buffer4 = fs.readFileSync('data/meteo.grib');
const reader4 = new GribReaderMain(buffer4.buffer);
reader4.parse();
const data4 = reader4.getData();
console.log(`   ✓ Main entry works - ${data4.numPoints} points parsed\n`);

console.log('✅ All formats work correctly!');
console.log('\nFile sizes:');
const stats = fs.readdirSync('dist').filter(f => f.endsWith('.js')).map(f => {
  const size = fs.statSync(`dist/${f}`).size;
  return { file: f, size: (size / 1024).toFixed(2) + ' KB' };
});
stats.forEach(s => console.log(`   ${s.file.padEnd(30)} ${s.size}`));
