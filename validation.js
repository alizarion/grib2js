/**
 * Script de validation complet - WGrib2JS vs wgrib2
 * Intègre tous les tests de validation en un seul script
 * Usage: node validation.js <fichier.grib>
 */

const fs = require('fs');
const { execSync } = require('child_process');
const GribReader = require('./grib-reader.js');

// Codes couleur pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const GRIB_FILE = process.argv[2];
const TOLERANCE = 0.001; // Tolérance pour comparaison (0.001 m/s)

if (!GRIB_FILE) {
  console.error(`${colors.red}Erreur: Aucun fichier GRIB spécifié${colors.reset}\n`);
  console.log('Usage: node validation.js <fichier.grib>\n');
  console.log('Exemples:');
  console.log('  node validation.js meteo.grib');
  console.log('  node validation.js meteo4.grib');
  console.log('  node validation.js meteo2.grib');
  process.exit(1);
}

if (!fs.existsSync(GRIB_FILE)) {
  console.error(`${colors.red}Erreur: Le fichier '${GRIB_FILE}' n'existe pas${colors.reset}`);
  process.exit(1);
}

// Vérifier Docker
let dockerAvailable = false;
try {
  execSync('docker --version', { stdio: 'ignore' });
  dockerAvailable = true;
} catch (error) {
  console.log(`${colors.yellow}⚠ Docker non disponible - certains tests seront ignorés${colors.reset}\n`);
}

// ============================================================================
// INITIALISATION
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log(`${colors.bright}${colors.cyan}🔍 VALIDATION COMPLÈTE WGRIB2JS${colors.reset}`);
console.log('='.repeat(80) + '\n');

console.log(`Fichier testé : ${colors.cyan}${GRIB_FILE}${colors.reset}`);
console.log(`Tolérance : ${TOLERANCE} m/s\n`);

// Parser le fichier GRIB
const buffer = fs.readFileSync(GRIB_FILE);
const reader = new GribReader(buffer.buffer);
reader.parse();

const s3 = reader.messages[0].sections.section3;
const scanningMode = s3.gridTemplate.scanningMode;
const ni = s3.gridTemplate.ni;
const nj = s3.gridTemplate.nj;

console.log(`${colors.blue}📚 Informations du fichier${colors.reset}`);
console.log(`  Messages : ${reader.messages.length}`);
console.log(`  Grille : ${ni} x ${nj} (${ni * nj} points)`);
console.log(`  Scanning mode : 0x${scanningMode.toString(16).padStart(2, '0')} (${(scanningMode & 0x40) ? 'South-North' : 'North-South'})`);
console.log();

// Résultats des tests
const testResults = [];

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function reorderWgrib2Data(values, ni, nj, scanningMode) {
  const isNorthSouth = (scanningMode & 0x40) === 0;
  if (!isNorthSouth) return values;

  console.log(`  ${colors.blue}ℹ️  Réorganisation NS→SN détectée${colors.reset}`);
  const reordered = new Array(values.length);
  for (let j = 0; j < nj; j++) {
    for (let i = 0; i < ni; i++) {
      const srcIdx = j * ni + i;
      const dstIdx = (nj - 1 - j) * ni + i;
      reordered[srcIdx] = values[dstIdx];
    }
  }
  return reordered;
}

function extractWithWgrib2Text(field) {
  const inventoryCmd = `docker run --rm -v "${process.cwd()}:/data" 28mm/wgrib2 /data/${GRIB_FILE} -match ":${field}:"`;
  const inventory = execSync(inventoryCmd, { encoding: 'utf-8' });
  const inventoryLines = inventory.trim().split('\n');

  if (inventoryLines.length === 0 || !inventoryLines[0]) {
    throw new Error(`Aucun message ${field} trouvé`);
  }

  const recordNumber = parseInt(inventoryLines[0].split(':')[0]);
  const cmd = `docker run --rm -v "${process.cwd()}:/data" 28mm/wgrib2 /data/${GRIB_FILE} -d ${recordNumber} -text /data/ref_${field}.txt`;
  execSync(cmd, { stdio: 'pipe' });

  const content = fs.readFileSync(`ref_${field}.txt`, 'utf-8');
  const lines = content.trim().split('\n');
  const values = [];

  for (let i = 1; i < lines.length; i++) {
    const val = parseFloat(lines[i]);
    if (!isNaN(val)) values.push(val);
  }

  return values;
}

// ============================================================================
// TEST 1: VALIDATION UGRD/VGRD vs WGRIB2
// ============================================================================

function test1_ValidationWgrib2() {
  console.log('='.repeat(80));
  console.log(`${colors.bright}${colors.magenta}TEST 1: Validation UGRD/VGRD vs wgrib2${colors.reset}`);
  console.log('='.repeat(80) + '\n');

  if (!dockerAvailable) {
    console.log(`${colors.yellow}⚠ Docker non disponible - test ignoré${colors.reset}\n`);
    testResults.push({ name: 'Validation wgrib2', passed: null, skipped: true });
    return;
  }

  try {
    // Extraction wgrib2
    console.log(`${colors.blue}📦 Extraction avec wgrib2...${colors.reset}`);
    let wgrib2_ugrd = extractWithWgrib2Text('UGRD');
    let wgrib2_vgrd = extractWithWgrib2Text('VGRD');
    console.log(`  ✓ UGRD: ${wgrib2_ugrd.length} valeurs`);
    console.log(`  ✓ VGRD: ${wgrib2_vgrd.length} valeurs`);

    wgrib2_ugrd = reorderWgrib2Data(wgrib2_ugrd, ni, nj, scanningMode);
    wgrib2_vgrd = reorderWgrib2Data(wgrib2_vgrd, ni, nj, scanningMode);
    console.log();

    // Extraction WGrib2JS
    console.log(`${colors.blue}🔬 Extraction avec WGrib2JS...${colors.reset}`);
    const data = reader.getData({
      longitudeFormat: 'preserve',
      firstParameterOnly: true
    });
    console.log(`  ✓ Points extraits: ${data.numPoints}`);
    console.log();

    // Comparaison UGRD
    console.log(`${colors.cyan}UGRD (Composante U du vent)${colors.reset}`);
    let matches = 0;
    let maxDiff = 0;
    let totalDiff = 0;

    for (let i = 0; i < Math.min(data.ugrd.length, wgrib2_ugrd.length); i++) {
      const diff = Math.abs(data.ugrd[i] - wgrib2_ugrd[i]);
      totalDiff += diff;
      if (diff > maxDiff) maxDiff = diff;
      if (diff <= TOLERANCE) matches++;
    }

    const ugrdMatchPercent = (matches / wgrib2_ugrd.length * 100).toFixed(2);
    console.log(`  Points correspondants : ${matches}/${wgrib2_ugrd.length} (${ugrdMatchPercent}%)`);
    console.log(`  Diff max : ${maxDiff.toFixed(6)} m/s`);
    console.log(`  Diff moy : ${(totalDiff / wgrib2_ugrd.length).toFixed(6)} m/s`);
    console.log(`  Statut : ${ugrdMatchPercent >= 99.9 ? colors.green + '✓ VALIDÉ' : colors.red + '✗ ÉCHEC'}${colors.reset}\n`);

    // Comparaison VGRD
    console.log(`${colors.cyan}VGRD (Composante V du vent)${colors.reset}`);
    matches = 0;
    maxDiff = 0;
    totalDiff = 0;

    for (let i = 0; i < Math.min(data.vgrd.length, wgrib2_vgrd.length); i++) {
      const diff = Math.abs(data.vgrd[i] - wgrib2_vgrd[i]);
      totalDiff += diff;
      if (diff > maxDiff) maxDiff = diff;
      if (diff <= TOLERANCE) matches++;
    }

    const vgrdMatchPercent = (matches / wgrib2_vgrd.length * 100).toFixed(2);
    console.log(`  Points correspondants : ${matches}/${wgrib2_vgrd.length} (${vgrdMatchPercent}%)`);
    console.log(`  Diff max : ${maxDiff.toFixed(6)} m/s`);
    console.log(`  Diff moy : ${(totalDiff / wgrib2_vgrd.length).toFixed(6)} m/s`);
    console.log(`  Statut : ${vgrdMatchPercent >= 99.9 ? colors.green + '✓ VALIDÉ' : colors.red + '✗ ÉCHEC'}${colors.reset}\n`);

    const passed = ugrdMatchPercent >= 99.9 && vgrdMatchPercent >= 99.9;
    testResults.push({ name: 'Validation wgrib2', passed });

    // Nettoyage
    ['ref_UGRD.txt', 'ref_VGRD.txt'].forEach(file => {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (e) {}
    });

  } catch (error) {
    console.log(`${colors.red}✗ Erreur: ${error.message}${colors.reset}\n`);
    testResults.push({ name: 'Validation wgrib2', passed: false });
  }
}

// ============================================================================
// TEST 2: PATTERN MATCHING (option match)
// ============================================================================

function test2_PatternMatching() {
  console.log('='.repeat(80));
  console.log(`${colors.bright}${colors.magenta}TEST 2: Pattern Matching (option match)${colors.reset}`);
  console.log('='.repeat(80) + '\n');

  let allPassed = true;

  try {
    // Test 2.1: Pattern simple ":UGRD:"
    console.log(`${colors.blue}Test 2.1: Pattern simple ":UGRD:"${colors.reset}`);
    try {
      const data = reader.getData({ match: ':UGRD:', longitudeFormat: 'preserve' });
      console.log(`  ✓ ${data.ugrd ? data.ugrd.length : 0} points UGRD extraits`);
      if (!data.ugrd) {
        console.log(`  ${colors.red}✗ UGRD non extrait${colors.reset}`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`  ${colors.red}✗ Erreur: ${error.message}${colors.reset}`);
      allPassed = false;
    }
    console.log();

    // Test 2.2: Pattern inexistant
    console.log(`${colors.blue}Test 2.2: Pattern inexistant (doit lever une erreur)${colors.reset}`);
    try {
      const data = reader.getData({ match: ':NOTEXIST:', longitudeFormat: 'preserve' });
      console.log(`  ${colors.red}✗ Devrait lever une erreur${colors.reset}`);
      allPassed = false;
    } catch (error) {
      console.log(`  ✓ Erreur levée correctement: ${error.message}`);
    }
    console.log();

    // Test 2.3: Pattern regex avec wildcard
    console.log(`${colors.blue}Test 2.3: Pattern regex ":.*:"${colors.reset}`);
    try {
      const data = reader.getData({ match: ':.*:', longitudeFormat: 'preserve' });
      const params = Object.keys(data).filter(k =>
        !['lat', 'lng', 'metadata', 'numPoints'].includes(k) && !k.startsWith('_')
      );
      console.log(`  ✓ ${params.length} paramètres extraits: ${params.slice(0, 5).join(', ')}${params.length > 5 ? '...' : ''}`);
    } catch (error) {
      console.log(`  ${colors.red}✗ Erreur: ${error.message}${colors.reset}`);
      allPassed = false;
    }
    console.log();

    // Test 2.4: Pattern complexe avec alternance et validation vs wgrib2
    console.log(`${colors.blue}Test 2.4: Pattern complexe ":(UGRD|VGRD):10 m above ground:" vs wgrib2${colors.reset}`);
    if (!dockerAvailable) {
      console.log(`  ${colors.yellow}⚠ Docker non disponible - test ignoré${colors.reset}`);
    } else {
      try {
        // Extraction avec WGrib2JS
        const dataWGrib2JS = reader.getData({
          match: ':(UGRD|VGRD):10 m above ground:',
          longitudeFormat: 'preserve'
        });

        const paramsWGrib2JS = Object.keys(dataWGrib2JS).filter(k =>
          !['lat', 'lng', 'metadata', 'numPoints'].includes(k) && !k.startsWith('_')
        );

        console.log(`  WGrib2JS: ${paramsWGrib2JS.join(', ')} (${dataWGrib2JS.numPoints} points)`);

        // Extraction avec wgrib2
        const pattern = ':(UGRD|VGRD):10 m above ground:';
        const inventoryCmd = `docker run --rm -v "${process.cwd()}:/data" 28mm/wgrib2 /data/${GRIB_FILE} -match "${pattern}"`;

        try {
          const inventory = execSync(inventoryCmd, { encoding: 'utf-8' });
          const inventoryLines = inventory.trim().split('\n').filter(line => line.length > 0);

          console.log(`  wgrib2: ${inventoryLines.length} messages matchent`);

          // Extraire les données wgrib2 pour UGRD et VGRD
          const wgrib2Data = { ugrd: null, vgrd: null };

          for (const line of inventoryLines) {
            const parts = line.split(':');
            const recordNum = parts[0];
            const param = parts[3];

            if (param === 'UGRD' || param === 'VGRD') {
              const field = param;
              const cmd = `docker run --rm -v "${process.cwd()}:/data" 28mm/wgrib2 /data/${GRIB_FILE} -d ${recordNum} -text /data/ref_match_${field}.txt`;
              execSync(cmd, { stdio: 'pipe' });

              const content = fs.readFileSync(`ref_match_${field}.txt`, 'utf-8');
              const lines = content.trim().split('\n');
              const values = [];

              for (let i = 1; i < lines.length; i++) {
                const val = parseFloat(lines[i]);
                if (!isNaN(val)) values.push(val);
              }

              wgrib2Data[field.toLowerCase()] = reorderWgrib2Data(values, ni, nj, scanningMode);
            }
          }

          // Comparer les résultats
          let ugrdMatch = true;
          let vgrdMatch = true;
          let ugrdDiff = 0;
          let vgrdDiff = 0;

          if (dataWGrib2JS.ugrd && wgrib2Data.ugrd) {
            for (let i = 0; i < Math.min(100, dataWGrib2JS.ugrd.length); i++) {
              const diff = Math.abs(dataWGrib2JS.ugrd[i] - wgrib2Data.ugrd[i]);
              if (diff > ugrdDiff) ugrdDiff = diff;
              if (diff > TOLERANCE) ugrdMatch = false;
            }
          }

          if (dataWGrib2JS.vgrd && wgrib2Data.vgrd) {
            for (let i = 0; i < Math.min(100, dataWGrib2JS.vgrd.length); i++) {
              const diff = Math.abs(dataWGrib2JS.vgrd[i] - wgrib2Data.vgrd[i]);
              if (diff > vgrdDiff) vgrdDiff = diff;
              if (diff > TOLERANCE) vgrdMatch = false;
            }
          }

          console.log(`  Comparaison UGRD: ${ugrdMatch ? colors.green + '✓' : colors.red + '✗'} (diff max: ${ugrdDiff.toFixed(6)})${colors.reset}`);
          console.log(`  Comparaison VGRD: ${vgrdMatch ? colors.green + '✓' : colors.red + '✗'} (diff max: ${vgrdDiff.toFixed(6)})${colors.reset}`);

          if (!ugrdMatch || !vgrdMatch) allPassed = false;

          // Nettoyage
          ['ref_match_UGRD.txt', 'ref_match_VGRD.txt'].forEach(file => {
            try {
              if (fs.existsSync(file)) fs.unlinkSync(file);
            } catch (e) {}
          });

        } catch (wgrib2Error) {
          console.log(`  ${colors.yellow}⚠ Pattern non supporté par ce fichier GRIB${colors.reset}`);
        }

      } catch (error) {
        console.log(`  ${colors.red}✗ Erreur: ${error.message}${colors.reset}`);
        allPassed = false;
      }
    }
    console.log();

    testResults.push({ name: 'Pattern matching', passed: allPassed });

  } catch (error) {
    console.log(`${colors.red}✗ Erreur générale: ${error.message}${colors.reset}\n`);
    testResults.push({ name: 'Pattern matching', passed: false });
  }
}

// ============================================================================
// TEST 3: FORMATS DE LONGITUDE
// ============================================================================

function test3_LongitudeFormats() {
  console.log('='.repeat(80));
  console.log(`${colors.bright}${colors.magenta}TEST 3: Formats de longitude${colors.reset}`);
  console.log('='.repeat(80) + '\n');

  let allPassed = true;

  try {
    // Helper pour min/max sans spread operator (évite stack overflow sur gros tableaux)
    function findMinMax(arr) {
      let min = arr[0];
      let max = arr[0];
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] < min) min = arr[i];
        if (arr[i] > max) max = arr[i];
      }
      return { min, max };
    }

    // Test 3.1: Format "preserve"
    console.log(`${colors.blue}Test 3.1: Format "preserve"${colors.reset}`);
    const dataPreserve = reader.getData({ longitudeFormat: 'preserve' });
    const preserveMinMax = findMinMax(dataPreserve.lng);
    console.log(`  ✓ ${dataPreserve.numPoints} points extraits`);
    console.log(`  ✓ Plage: [${preserveMinMax.min.toFixed(2)}°, ${preserveMinMax.max.toFixed(2)}°]`);
    console.log();

    // Test 3.2: Format "0-360"
    console.log(`${colors.blue}Test 3.2: Format "0-360"${colors.reset}`);
    const data0_360 = reader.getData({ longitudeFormat: '0-360' });
    const data360MinMax = findMinMax(data0_360.lng);
    let validCount = 0;
    for (let i = 0; i < data0_360.numPoints; i++) {
      if (data0_360.lng[i] >= 0 && data0_360.lng[i] < 360) validCount++;
    }
    const valid360 = validCount === data0_360.numPoints;
    console.log(`  ${valid360 ? '✓' : colors.red + '✗'} ${validCount}/${data0_360.numPoints} points dans [0, 360)${colors.reset}`);
    console.log(`  ✓ Plage: [${data360MinMax.min.toFixed(2)}°, ${data360MinMax.max.toFixed(2)}°]`);
    if (!valid360) allPassed = false;
    console.log();

    // Test 3.3: Format "-180-180"
    console.log(`${colors.blue}Test 3.3: Format "-180-180"${colors.reset}`);
    const dataMinus180 = reader.getData({ longitudeFormat: '-180-180' });
    const dataMinus180MinMax = findMinMax(dataMinus180.lng);
    validCount = 0;
    for (let i = 0; i < dataMinus180.numPoints; i++) {
      if (dataMinus180.lng[i] > -180 && dataMinus180.lng[i] <= 180) validCount++;
    }
    const valid180 = validCount === dataMinus180.numPoints;
    console.log(`  ${valid180 ? '✓' : colors.red + '✗'} ${validCount}/${dataMinus180.numPoints} points dans [-180, +180]${colors.reset}`);
    console.log(`  ✓ Plage: [${dataMinus180MinMax.min.toFixed(2)}°, ${dataMinus180MinMax.max.toFixed(2)}°]`);
    if (!valid180) allPassed = false;
    console.log();

    testResults.push({ name: 'Formats de longitude', passed: allPassed });

  } catch (error) {
    console.log(`${colors.red}✗ Erreur: ${error.message}${colors.reset}\n`);
    testResults.push({ name: 'Formats de longitude', passed: false });
  }
}

// ============================================================================
// TEST 4: CALCUL DE WIND_SPEED
// ============================================================================

function test4_WindSpeed() {
  console.log('='.repeat(80));
  console.log(`${colors.bright}${colors.magenta}TEST 4: Calcul de wind_speed${colors.reset}`);
  console.log('='.repeat(80) + '\n');

  let allPassed = true;

  try {
    // Helper pour min/max/avg sans spread operator
    function findStats(arr) {
      let min = arr[0];
      let max = arr[0];
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] < min) min = arr[i];
        if (arr[i] > max) max = arr[i];
        sum += arr[i];
      }
      return { min, max, avg: sum / arr.length };
    }

    console.log(`${colors.blue}Test 4.1: calculateWindSpeed: true${colors.reset}`);
    const data = reader.getData({ calculateWindSpeed: true, longitudeFormat: 'preserve' });

    if (!data.wind_speed) {
      console.log(`  ${colors.red}✗ wind_speed non calculé${colors.reset}`);
      allPassed = false;
    } else {
      console.log(`  ✓ wind_speed calculé (${data.wind_speed.length} points)`);

      // Vérifier quelques valeurs
      let correctCount = 0;
      for (let i = 0; i < Math.min(100, data.wind_speed.length); i++) {
        const u = data.ugrd[i];
        const v = data.vgrd[i];
        const calculated = Math.sqrt(u * u + v * v);
        const diff = Math.abs(data.wind_speed[i] - calculated);
        if (diff < 0.001) correctCount++;
      }

      const verifyCount = Math.min(100, data.wind_speed.length);
      const stats = findStats(data.wind_speed);
      console.log(`  ✓ Vérification: ${correctCount}/${verifyCount} valeurs correctes`);
      console.log(`  ✓ Min: ${stats.min.toFixed(3)} m/s`);
      console.log(`  ✓ Max: ${stats.max.toFixed(3)} m/s`);
      console.log(`  ✓ Moy: ${stats.avg.toFixed(3)} m/s`);

      if (correctCount < verifyCount) allPassed = false;
    }
    console.log();

    testResults.push({ name: 'Calcul wind_speed', passed: allPassed });

  } catch (error) {
    console.log(`${colors.red}✗ Erreur: ${error.message}${colors.reset}\n`);
    testResults.push({ name: 'Calcul wind_speed', passed: false });
  }
}

// ============================================================================
// TEST 5: CALCUL DE WIND_DIRECTION
// ============================================================================

function test5_WindDirection() {
  console.log('='.repeat(80));
  console.log(`${colors.bright}${colors.magenta}TEST 5: Calcul de wind_direction${colors.reset}`);
  console.log('='.repeat(80) + '\n');

  let allPassed = true;

  try {
    // Helper pour min/max sans spread operator
    function findMinMax(arr) {
      let min = arr[0];
      let max = arr[0];
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] < min) min = arr[i];
        if (arr[i] > max) max = arr[i];
      }
      return { min, max };
    }

    console.log(`${colors.blue}Test 5.1: calculateWindDirection: true${colors.reset}`);
    const data = reader.getData({ calculateWindDirection: true, longitudeFormat: 'preserve' });

    if (!data.wind_dir) {
      console.log(`  ${colors.red}✗ wind_dir non calculé${colors.reset}`);
      allPassed = false;
    } else {
      console.log(`  ✓ wind_dir calculé (${data.wind_dir.length} points)`);

      // Vérifier quelques valeurs
      let validCount = 0;
      for (let i = 0; i < data.wind_dir.length; i++) {
        if (data.wind_dir[i] >= 0 && data.wind_dir[i] < 360) validCount++;
      }

      const dirMinMax = findMinMax(data.wind_dir);
      console.log(`  ✓ Vérification: ${validCount}/${data.wind_dir.length} valeurs dans [0, 360)°`);
      console.log(`  ✓ Min: ${dirMinMax.min.toFixed(2)}°`);
      console.log(`  ✓ Max: ${dirMinMax.max.toFixed(2)}°`);

      // Afficher quelques exemples
      console.log(`  ✓ Exemples (premiers points):`);
      for (let i = 0; i < Math.min(3, data.wind_dir.length); i++) {
        console.log(`    Point ${i}: UGRD=${data.ugrd[i].toFixed(3)}, VGRD=${data.vgrd[i].toFixed(3)} → ${data.wind_dir[i].toFixed(2)}°`);
      }

      if (validCount < data.wind_dir.length) allPassed = false;
    }
    console.log();

    testResults.push({ name: 'Calcul wind_direction', passed: allPassed });

  } catch (error) {
    console.log(`${colors.red}✗ Erreur: ${error.message}${colors.reset}\n`);
    testResults.push({ name: 'Calcul wind_direction', passed: false });
  }
}

// ============================================================================
// TEST 6: GETGRID()
// ============================================================================

function test6_GetGrid() {
  console.log('='.repeat(80));
  console.log(`${colors.bright}${colors.magenta}TEST 6: getGrid() - Informations de grille${colors.reset}`);
  console.log('='.repeat(80) + '\n');

  let allPassed = true;

  try {
    const grid = reader.getGrid();

    console.log(`${colors.blue}Informations de grille extraites:${colors.reset}`);
    console.log(`  ✓ Type: ${grid.gridType}`);
    console.log(`  ✓ Template: ${grid.gridTemplate}`);
    console.log(`  ✓ Dimensions: ${grid.dimensions.ni} x ${grid.dimensions.nj}`);
    console.log(`  ✓ Total points: ${grid.totalPoints}`);
    console.log(`  ✓ Latitude: [${grid.latitude.first.toFixed(3)}°, ${grid.latitude.last.toFixed(3)}°], increment ${grid.latitude.increment.toFixed(3)}°`);
    console.log(`  ✓ Longitude: [${grid.longitude.first.toFixed(3)}°, ${grid.longitude.last.toFixed(3)}°], increment ${grid.longitude.increment.toFixed(3)}°`);
    console.log(`  ✓ Scanning: ${grid.scanning.inputOrder} → ${grid.scanning.outputOrder}`);
    console.log();

    // Vérifications
    if (grid.totalPoints !== grid.dimensions.ni * grid.dimensions.nj) {
      console.log(`  ${colors.red}✗ Incohérence totalPoints${colors.reset}`);
      allPassed = false;
    }

    testResults.push({ name: 'getGrid()', passed: allPassed });

  } catch (error) {
    console.log(`${colors.red}✗ Erreur: ${error.message}${colors.reset}\n`);
    testResults.push({ name: 'getGrid()', passed: false });
  }
}

// ============================================================================
// TEST 7: GETINVENTORY()
// ============================================================================

function test7_GetInventory() {
  console.log('='.repeat(80));
  console.log(`${colors.bright}${colors.magenta}TEST 7: getInventory() - Inventaire des messages${colors.reset}`);
  console.log('='.repeat(80) + '\n');

  let allPassed = true;

  try {
    const inventory = reader.getInventory();

    console.log(`${colors.blue}Inventaire généré (format wgrib2):${colors.reset}`);
    console.log(`  ✓ ${inventory.length} messages\n`);

    // Afficher les 10 premiers
    const displayCount = Math.min(10, inventory.length);
    console.log(`${colors.blue}Premiers ${displayCount} messages:${colors.reset}`);
    for (let i = 0; i < displayCount; i++) {
      console.log(`  ${inventory[i].inventoryLine}`);
    }

    if (inventory.length > displayCount) {
      console.log(`  ... et ${inventory.length - displayCount} autres messages`);
    }
    console.log();

    // Vérifications
    if (inventory.length !== reader.messages.length) {
      console.log(`  ${colors.red}✗ Nombre de messages incorrect${colors.reset}`);
      allPassed = false;
    }

    testResults.push({ name: 'getInventory()', passed: allPassed });

  } catch (error) {
    console.log(`${colors.red}✗ Erreur: ${error.message}${colors.reset}\n`);
    testResults.push({ name: 'getInventory()', passed: false });
  }
}

// ============================================================================
// EXÉCUTION DES TESTS
// ============================================================================

test1_ValidationWgrib2();
test2_PatternMatching();
test3_LongitudeFormats();
test4_WindSpeed();
test5_WindDirection();
test6_GetGrid();
test7_GetInventory();

// ============================================================================
// RÉSUMÉ FINAL
// ============================================================================

console.log('='.repeat(80));
console.log(`${colors.bright}${colors.cyan}📊 RÉSUMÉ DES TESTS${colors.reset}`);
console.log('='.repeat(80) + '\n');

console.log(`Fichier testé : ${colors.cyan}${GRIB_FILE}${colors.reset}\n`);

let totalTests = 0;
let passedTests = 0;
let skippedTests = 0;

testResults.forEach(result => {
  totalTests++;
  const status = result.skipped
    ? `${colors.yellow}⊘ SKIP`
    : result.passed
      ? `${colors.green}✓ PASS`
      : `${colors.red}✗ FAIL`;

  console.log(`  ${result.name.padEnd(30)} : ${status}${colors.reset}`);

  if (result.skipped) skippedTests++;
  else if (result.passed) passedTests++;
});

console.log('\n' + '='.repeat(80));

const allPassed = passedTests === (totalTests - skippedTests);

if (allPassed) {
  console.log(`${colors.bright}${colors.green}✓✓✓ TOUS LES TESTS RÉUSSIS ✓✓✓${colors.reset}`);
  console.log(`${colors.green}${passedTests}/${totalTests - skippedTests} tests validés${skippedTests > 0 ? ` (${skippedTests} ignorés)` : ''}${colors.reset}`);
} else {
  console.log(`${colors.bright}${colors.red}✗✗✗ CERTAINS TESTS ONT ÉCHOUÉ ✗✗✗${colors.reset}`);
  console.log(`${colors.red}${passedTests}/${totalTests - skippedTests} tests validés${colors.reset}`);
}

console.log('='.repeat(80) + '\n');

process.exit(allPassed ? 0 : 1);
