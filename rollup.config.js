import terser from '@rollup/plugin-terser';

const banner = `/*!
 * wgrib2js v1.0.0
 * JavaScript GRIB2 reader library with full wgrib2 compatibility
 * (c) 2025
 * Released under the MIT License
 */`;

const terserConfig = {
  format: {
    comments: false,
    preamble: banner
  },
  compress: {
    drop_console: false,
    drop_debugger: true,
    passes: 2
  },
  mangle: {
    keep_classnames: true,
    reserved: ['GribReader']
  }
};

export default [
  // CommonJS minifié (pour Node.js et require())
  {
    input: 'grib-reader.js',
    output: {
      file: 'dist/grib-reader.cjs.js',
      format: 'cjs',
      exports: 'auto',
      banner,
      sourcemap: true
    },
    plugins: [terser(terserConfig)]
  },

  // ES Module minifié (pour import/export et bundlers modernes)
  {
    input: 'grib-reader.js',
    output: {
      file: 'dist/grib-reader.esm.js',
      format: 'es',
      banner,
      sourcemap: true
    },
    plugins: [terser(terserConfig)]
  },

  // UMD minifié (pour navigateur direct et CDN)
  {
    input: 'grib-reader.js',
    output: {
      file: 'dist/grib-reader.umd.js',
      format: 'umd',
      name: 'GribReader',
      exports: 'auto',
      banner,
      sourcemap: true
    },
    plugins: [terser(terserConfig)]
  },

  // Alias .min.js (copie de UMD pour compatibilité CDN)
  {
    input: 'grib-reader.js',
    output: {
      file: 'dist/grib-reader.min.js',
      format: 'umd',
      name: 'GribReader',
      exports: 'auto',
      banner,
      sourcemap: true
    },
    plugins: [terser(terserConfig)]
  }
];
