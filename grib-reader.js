/**
 * GRIB v2 Reader Library for Browser
 * Reads and parses GRIB2 (GRIdded Binary, Edition 2) meteorological data files
 */

class GribReader {
  constructor(arrayBuffer) {
    this.buffer = arrayBuffer;
    this.view = new DataView(arrayBuffer);
    this.offset = 0;
    this.messages = [];
  }

  /**
   * Parse the entire GRIB file
   * @returns {Array} Array of parsed GRIB messages
   */
  parse() {
    this.offset = 0;
    this.messages = [];

    while (this.offset < this.buffer.byteLength) {
      try {
        const message = this.parseMessage();
        if (message) {
          this.messages.push(message);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
        break;
      }
    }

    return this.messages;
  }

  /**
   * Parse a single GRIB message
   * @returns {Object} Parsed message object
   */
  parseMessage() {
    const messageStart = this.offset;

    // Section 0: Indicator Section
    const section0 = this.parseSection0();
    if (!section0) return null;

    const message = {
      discipline: section0.discipline,
      edition: section0.edition,
      totalLength: section0.totalLength,
      sections: {}
    };

    // Section 1: Identification Section
    message.sections.section1 = this.parseSection1();

    // Parse remaining sections until we hit section 8 (end)
    while (this.offset < messageStart + section0.totalLength) {
      // Check if we're at the end section ("7777")
      const next4Bytes = String.fromCharCode(
        this.view.getUint8(this.offset),
        this.view.getUint8(this.offset + 1),
        this.view.getUint8(this.offset + 2),
        this.view.getUint8(this.offset + 3)
      );

      if (next4Bytes === '7777') {
        // Section 8: End Section
        this.parseSection8();
        break;
      }

      const sectionNumber = this.view.getUint8(this.offset + 4);

      switch (sectionNumber) {
        case 2:
          message.sections.section2 = this.parseSection2();
          break;
        case 3:
          message.sections.section3 = this.parseSection3();
          break;
        case 4:
          message.sections.section4 = this.parseSection4();
          break;
        case 5:
          message.sections.section5 = this.parseSection5();
          break;
        case 6:
          message.sections.section6 = this.parseSection6();
          break;
        case 7:
          message.sections.section7 = this.parseSection7(message.sections.section5);
          break;
        default:
          throw new Error(`Unknown section number: ${sectionNumber} at offset ${this.offset}`);
      }
    }

    return message;
  }

  /**
   * Section 0: Indicator Section
   * Fixed length of 16 octets
   */
  parseSection0() {
    if (this.offset + 16 > this.buffer.byteLength) return null;

    // Check for "GRIB" signature
    const signature = String.fromCharCode(
      this.view.getUint8(this.offset),
      this.view.getUint8(this.offset + 1),
      this.view.getUint8(this.offset + 2),
      this.view.getUint8(this.offset + 3)
    );

    if (signature !== 'GRIB') {
      throw new Error('Invalid GRIB file: signature not found');
    }

    const discipline = this.view.getUint8(this.offset + 6);
    const edition = this.view.getUint8(this.offset + 7);

    // Total length is stored in bytes 8-15 (8 bytes, big-endian)
    const totalLength = this.readUint64(this.offset + 8);

    this.offset += 16;

    return { signature, discipline, edition, totalLength };
  }

  /**
   * Section 1: Identification Section
   */
  parseSection1() {
    const length = this.view.getUint32(this.offset);
    const sectionNumber = this.view.getUint8(this.offset + 4);

    if (sectionNumber !== 1) {
      throw new Error('Expected section 1');
    }

    const section1 = {
      length,
      centreId: this.view.getUint16(this.offset + 5),
      subCentreId: this.view.getUint16(this.offset + 7),
      masterTableVersion: this.view.getUint8(this.offset + 9),
      localTableVersion: this.view.getUint8(this.offset + 10),
      significanceOfReferenceTime: this.view.getUint8(this.offset + 11),
      year: this.view.getUint16(this.offset + 12),
      month: this.view.getUint8(this.offset + 14),
      day: this.view.getUint8(this.offset + 15),
      hour: this.view.getUint8(this.offset + 16),
      minute: this.view.getUint8(this.offset + 17),
      second: this.view.getUint8(this.offset + 18),
      productionStatus: this.view.getUint8(this.offset + 19),
      typeOfData: this.view.getUint8(this.offset + 20)
    };

    this.offset += length;
    return section1;
  }

  /**
   * Section 2: Local Use Section (optional)
   */
  parseSection2() {
    const length = this.view.getUint32(this.offset);
    const sectionNumber = this.view.getUint8(this.offset + 4);

    const localData = new Uint8Array(this.buffer, this.offset + 5, length - 5);

    this.offset += length;
    return { length, localData };
  }

  /**
   * Section 3: Grid Definition Section
   */
  parseSection3() {
    const length = this.view.getUint32(this.offset);
    const sectionNumber = this.view.getUint8(this.offset + 4);

    const section3 = {
      length,
      source: this.view.getUint8(this.offset + 5),
      numberOfDataPoints: this.view.getUint32(this.offset + 6),
      numberOfOctetsForOptional: this.view.getUint8(this.offset + 10),
      interpretationOfOptional: this.view.getUint8(this.offset + 11),
      gridDefinitionTemplateNumber: this.view.getUint16(this.offset + 12)
    };

    // Parse grid definition template (simplified - only template 0 for lat/lon)
    if (section3.gridDefinitionTemplateNumber === 0) {
      section3.gridTemplate = this.parseGridTemplate0(this.offset + 14);
    }

    this.offset += length;
    return section3;
  }

  /**
   * Parse Grid Definition Template 3.0 (Latitude/Longitude)
   */
  parseGridTemplate0(offset) {
    const ni = this.view.getUint32(offset + 16);
    const nj = this.view.getUint32(offset + 20);
    const latFirst = this.view.getInt32(offset + 32) / 1e6;
    const lonFirst = this.view.getInt32(offset + 36) / 1e6;
    const iIncrement = this.view.getUint32(offset + 49) / 1e6;
    const jIncrement = this.view.getUint32(offset + 53) / 1e6;
    const scanningMode = this.view.getUint8(offset + 57);

    // Read lat/lon last from file (may be incorrect in some files)
    const latLastFromFile = this.view.getInt32(offset + 41) / 1e6;
    const lonLastFromFile = this.view.getInt32(offset + 45) / 1e6;

    // Calculate correct lat/lon last based on scanning mode
    // Bit 7 (0x80): 0 = +i direction (W to E), 1 = -i direction (E to W)
    // Bit 6 (0x40): 0 = -j direction (N to S), 1 = +j direction (S to N)
    const iScansPositively = (scanningMode & 0x80) === 0;
    const jScansPositively = (scanningMode & 0x40) !== 0;

    const lonLast = lonFirst + (ni - 1) * iIncrement * (iScansPositively ? 1 : -1);
    const latLast = latFirst + (nj - 1) * jIncrement * (jScansPositively ? 1 : -1);

    return {
      shapeOfEarth: this.view.getUint8(offset),
      scaleFactorOfRadiusOfSphericalEarth: this.view.getUint8(offset + 1),
      scaledValueOfRadiusOfSphericalEarth: this.view.getUint32(offset + 2),
      scaleFactorOfEarthMajorAxis: this.view.getUint8(offset + 6),
      scaledValueOfEarthMajorAxis: this.view.getUint32(offset + 7),
      scaleFactorOfEarthMinorAxis: this.view.getUint8(offset + 11),
      scaledValueOfEarthMinorAxis: this.view.getUint32(offset + 12),
      ni: ni,
      nj: nj,
      basicAngleOfInitialProductionDomain: this.view.getUint32(offset + 24),
      subdivisionsOfBasicAngle: this.view.getUint32(offset + 28),
      latitudeOfFirstGridPoint: latFirst,
      longitudeOfFirstGridPoint: lonFirst,
      resolutionAndComponentFlags: this.view.getUint8(offset + 40),
      latitudeOfLastGridPoint: latLast, // Calculated, not read from file
      longitudeOfLastGridPoint: lonLast, // Calculated, not read from file
      latitudeOfLastGridPointFromFile: latLastFromFile, // For debugging
      longitudeOfLastGridPointFromFile: lonLastFromFile, // For debugging
      iDirectionIncrement: iIncrement,
      jDirectionIncrement: jIncrement,
      scanningMode: scanningMode
    };
  }

  /**
   * Section 4: Product Definition Section
   */
  parseSection4() {
    const length = this.view.getUint32(this.offset);
    const sectionNumber = this.view.getUint8(this.offset + 4);

    const section4 = {
      length,
      numberOfCoordinateValues: this.view.getUint16(this.offset + 5),
      productDefinitionTemplateNumber: this.view.getUint16(this.offset + 7)
    };

    // Simplified parsing - store raw template data
    section4.templateData = new Uint8Array(this.buffer, this.offset + 9, length - 9);

    this.offset += length;
    return section4;
  }

  /**
   * Section 5: Data Representation Section
   */
  parseSection5() {
    const length = this.view.getUint32(this.offset);
    const sectionNumber = this.view.getUint8(this.offset + 4);

    const section5 = {
      length,
      numberOfDataPoints: this.view.getUint32(this.offset + 5),
      dataRepresentationTemplateNumber: this.view.getUint16(this.offset + 9)
    };

    // Parse template 0 (simple packing)
    if (section5.dataRepresentationTemplateNumber === 0) {
      section5.template = {
        referenceValue: this.view.getFloat32(this.offset + 11),
        binaryScaleFactor: this.view.getInt16(this.offset + 15),
        decimalScaleFactor: this.view.getInt16(this.offset + 17),
        numberOfBits: this.view.getUint8(this.offset + 19),
        typeOfOriginalFieldValues: this.view.getUint8(this.offset + 20)
      };
    }
    // Parse template 2 (complex packing without spatial differencing)
    else if (section5.dataRepresentationTemplateNumber === 2) {
      section5.template = {
        referenceValue: this.view.getFloat32(this.offset + 11),
        binaryScaleFactor: this.view.getInt16(this.offset + 15),
        decimalScaleFactor: this.view.getInt16(this.offset + 17),
        numberOfBits: this.view.getUint8(this.offset + 19),
        typeOfOriginalFieldValues: this.view.getUint8(this.offset + 20),
        groupSplittingMethod: this.view.getUint8(this.offset + 21),
        missingValueManagement: this.view.getUint8(this.offset + 22),
        primaryMissingValue: this.view.getFloat32(this.offset + 23),
        secondaryMissingValue: this.view.getFloat32(this.offset + 27),
        numberOfGroups: this.view.getUint32(this.offset + 31),
        referenceForGroupWidths: this.view.getUint8(this.offset + 35),
        numberOfBitsForGroupWidths: this.view.getUint8(this.offset + 36),
        referenceForGroupLengths: this.view.getUint32(this.offset + 37),
        lengthIncrementForGroupLengths: this.view.getUint8(this.offset + 41),
        trueLengthOfLastGroup: this.view.getUint32(this.offset + 42),
        numberOfBitsForScaledGroupLengths: this.view.getUint8(this.offset + 46),
        orderOfSpatialDifferencing: 0  // No spatial differencing for template 2
      };
    }
    // Parse template 3 (complex packing and spatial differencing)
    else if (section5.dataRepresentationTemplateNumber === 3) {
      section5.template = {
        referenceValue: this.view.getFloat32(this.offset + 11),
        binaryScaleFactor: this.view.getInt16(this.offset + 15),
        decimalScaleFactor: this.view.getInt16(this.offset + 17),
        numberOfBits: this.view.getUint8(this.offset + 19),
        typeOfOriginalFieldValues: this.view.getUint8(this.offset + 20),
        groupSplittingMethod: this.view.getUint8(this.offset + 21),
        missingValueManagement: this.view.getUint8(this.offset + 22),
        primaryMissingValue: this.view.getFloat32(this.offset + 23),
        secondaryMissingValue: this.view.getFloat32(this.offset + 27),
        numberOfGroups: this.view.getUint32(this.offset + 31),
        referenceForGroupWidths: this.view.getUint8(this.offset + 35),
        numberOfBitsForGroupWidths: this.view.getUint8(this.offset + 36),
        referenceForGroupLengths: this.view.getUint32(this.offset + 37),
        lengthIncrementForGroupLengths: this.view.getUint8(this.offset + 41),
        trueLengthOfLastGroup: this.view.getUint32(this.offset + 42),
        numberOfBitsForScaledGroupLengths: this.view.getUint8(this.offset + 46),
        orderOfSpatialDifferencing: this.view.getUint8(this.offset + 47),
        numberOfOctetsExtraDescriptors: this.view.getUint8(this.offset + 48)
      };
    }

    this.offset += length;
    return section5;
  }

  /**
   * Section 6: Bit-Map Section
   */
  parseSection6() {
    const length = this.view.getUint32(this.offset);
    const sectionNumber = this.view.getUint8(this.offset + 4);

    const section6 = {
      length,
      bitMapIndicator: this.view.getUint8(this.offset + 5)
    };

    if (section6.bitMapIndicator === 0) {
      // Bitmap follows
      section6.bitmap = new Uint8Array(this.buffer, this.offset + 6, length - 6);
    }

    this.offset += length;
    return section6;
  }

  /**
   * Section 7: Data Section
   */
  parseSection7(section5) {
    const length = this.view.getUint32(this.offset);
    const sectionNumber = this.view.getUint8(this.offset + 4);

    const section7 = {
      length,
      data: null
    };

    if (section5 && section5.template) {
      if (section5.dataRepresentationTemplateNumber === 0) {
        // Simple packing
        section7.data = this.decodeSimplePacking(
          this.offset + 5,
          length - 5,
          section5.template,
          section5.numberOfDataPoints
        );
      } else if (section5.dataRepresentationTemplateNumber === 2 || section5.dataRepresentationTemplateNumber === 3) {
        // Complex packing (with or without spatial differencing)
        section7.data = this.decodeComplexPacking(
          this.offset + 5,
          length - 5,
          section5.template,
          section5.numberOfDataPoints
        );
      } else {
        // Store raw data for unsupported templates
        section7.rawData = new Uint8Array(this.buffer, this.offset + 5, length - 5);
      }
    } else {
      // Store raw data
      section7.rawData = new Uint8Array(this.buffer, this.offset + 5, length - 5);
    }

    this.offset += length;
    return section7;
  }

  /**
   * Decode simple packing (Data Representation Template 5.0)
   */
  decodeSimplePacking(offset, dataLength, template, numberOfPoints) {
    if (!template || template.numberOfBits === 0) {
      return new Array(numberOfPoints).fill(template.referenceValue);
    }

    const data = new Float32Array(numberOfPoints);
    const R = template.referenceValue;
    const E = template.binaryScaleFactor;
    const D = template.decimalScaleFactor;
    const numberOfBits = template.numberOfBits;

    const decimalScale = Math.pow(10, -D);
    const binaryScale = Math.pow(2, E);

    let bitOffset = offset * 8;

    for (let i = 0; i < numberOfPoints; i++) {
      const packedValue = this.readBits(bitOffset, numberOfBits);
      data[i] = (R + packedValue * binaryScale) * decimalScale;
      bitOffset += numberOfBits;
    }

    return data;
  }

  /**
   * Decode complex packing and spatial differencing (Data Representation Template 5.3)
   * Based on NOAA g2clib comunpack.c reference implementation
   */
  decodeComplexPacking(offset, dataLength, template, numberOfPoints) {
    try {
      // Working array for integer values (before final scaling)
      const ifld = new Int32Array(numberOfPoints);

      const R = template.referenceValue;
      const E = template.binaryScaleFactor;
      const D = template.decimalScaleFactor;
      const decimalScale = Math.pow(10, -D);
      const binaryScale = Math.pow(2, E);

      const numberOfGroups = template.numberOfGroups;
      const nbitsgref = template.numberOfBits; // bits for group references
      const nbitsgwidth = template.numberOfBitsForGroupWidths;
      const referenceForGroupWidths = template.referenceForGroupWidths;
      const nbitsglen = template.numberOfBitsForScaledGroupLengths;
      const referenceForGroupLengths = template.referenceForGroupLengths;
      const lengthIncrement = template.lengthIncrementForGroupLengths;
      const trueLengthOfLastGroup = template.trueLengthOfLastGroup;
      const orderOfSpatialDiff = template.orderOfSpatialDifferencing || 0;
      const nbitsd = template.numberOfBits; // bits per value

      // Step 1: Extract spatial differencing values (if template 5.3)
      // According to grib22json implementation, for template 5.3:
      // - h1 and h2 are stored in the first numberOfOctetsExtraDescriptors bytes
      // - Overall minimum is stored in the next numberOfOctetsExtraDescriptors bytes
      // - Then we skip those bytes and start reading group data

      let h1 = 0, h2 = 0, overallMin = 0;
      const numExtraOctets = template.numberOfOctetsExtraDescriptors || 0;
      let bitOffset;

      if (orderOfSpatialDiff > 0 && numExtraOctets > 0) {
        // According to NOAA g2clib: read as unsigned (gbit reads unsigned values)
        const nbitsd = numExtraOctets * 8;
        let bitPos = offset * 8;

        if (numExtraOctets === 2) {
          h1 = this.readBits(bitPos, nbitsd);  // Unsigned, 16 bits
          bitPos += nbitsd;

          if (orderOfSpatialDiff === 2) {
            h2 = this.readBits(bitPos, nbitsd);  // Unsigned, 16 bits
            bitPos += nbitsd;
          }

          // Read sign bit (1 bit)
          const isign = this.readBits(bitPos, 1);
          bitPos += 1;

          // Read magnitude of minsd (nbitsd - 1 bits)
          const minsdMagnitude = this.readBits(bitPos, nbitsd - 1);
          bitPos += (nbitsd - 1);

          // Apply sign
          overallMin = isign === 1 ? -minsdMagnitude : minsdMagnitude;
        } else if (numExtraOctets === 1) {
          h1 = this.readBits(bitPos, nbitsd);  // Unsigned, 8 bits
          bitPos += nbitsd;

          if (orderOfSpatialDiff === 2) {
            h2 = this.readBits(bitPos, nbitsd);  // Unsigned, 8 bits
            bitPos += nbitsd;
          }

          // Read sign bit (1 bit)
          const isign = this.readBits(bitPos, 1);
          bitPos += 1;

          // Read magnitude of minsd (nbitsd - 1 bits)
          const minsdMagnitude = this.readBits(bitPos, nbitsd - 1);
          bitPos += (nbitsd - 1);

          // Apply sign
          overallMin = isign === 1 ? -minsdMagnitude : minsdMagnitude;
        }

        // Continue reading from where we left off in the bitstream
        bitOffset = bitPos;
      } else {
        bitOffset = offset * 8;
      }

      const maxBitOffset = (offset + dataLength) * 8;

      // Check if we have groups
      if (numberOfGroups === 0) {
        // No groups - fill with reference value
        const data = new Float32Array(numberOfPoints);
        data.fill(R * decimalScale);
        return data;
      }

      // Step 2: Read group reference values
      const gref = new Int32Array(numberOfGroups);

      if (nbitsgref > 0) {
        for (let i = 0; i < numberOfGroups; i++) {
          gref[i] = this.readBits(bitOffset, nbitsgref);
          bitOffset += nbitsgref;
        }
        // Byte-align after group references
        const bitsUsed = numberOfGroups * nbitsgref;
        if (bitsUsed % 8 !== 0) {
          bitOffset += 8 - (bitsUsed % 8);
        }
      }

      // Step 3: Read group widths
      const gwidth = new Uint8Array(numberOfGroups);

      if (nbitsgwidth > 0) {
        for (let i = 0; i < numberOfGroups; i++) {
          gwidth[i] = this.readBits(bitOffset, nbitsgwidth);
          bitOffset += nbitsgwidth;
        }
        // Byte-align after group widths
        const bitsUsed = numberOfGroups * nbitsgwidth;
        if (bitsUsed % 8 !== 0) {
          bitOffset += 8 - (bitsUsed % 8);
        }
      }

      // Add reference to each width
      for (let i = 0; i < numberOfGroups; i++) {
        gwidth[i] += referenceForGroupWidths;
      }

      // Step 4: Read and calculate group lengths
      const glen = new Uint32Array(numberOfGroups);

      if (nbitsglen > 0) {
        for (let i = 0; i < numberOfGroups; i++) {
          glen[i] = this.readBits(bitOffset, nbitsglen);
          bitOffset += nbitsglen;
        }
        // Byte-align after group lengths
        const bitsUsed = numberOfGroups * nbitsglen;
        if (bitsUsed % 8 !== 0) {
          bitOffset += 8 - (bitsUsed % 8);
        }
      }

      // Calculate actual group lengths
      for (let i = 0; i < numberOfGroups; i++) {
        glen[i] = (glen[i] * lengthIncrement) + referenceForGroupLengths;
      }

      // Override last group length
      glen[numberOfGroups - 1] = trueLengthOfLastGroup;

      // Step 5: Unpack data from groups
      let n = 0;

      for (let j = 0; j < numberOfGroups; j++) {
        if (gwidth[j] !== 0) {
          // Read glen[j] values, each gwidth[j] bits wide
          for (let k = 0; k < glen[j] && n < numberOfPoints; k++) {
            // Check if we would exceed data bounds
            if (bitOffset + gwidth[j] > maxBitOffset) {
              // Stop decoding - data section is incomplete, fill remaining with zeros
              while (n < numberOfPoints) {
                ifld[n++] = 0;
              }
              break;
            }
            const packedValue = this.readBits(bitOffset, gwidth[j]);
            ifld[n] = gref[j] + packedValue;
            bitOffset += gwidth[j];
            n++;
          }
          if (n >= numberOfPoints) break;
        } else {
          // Width is 0, all values are the group reference
          for (let k = 0; k < glen[j] && n < numberOfPoints; k++) {
            ifld[n] = gref[j];
            n++;
          }
        }
      }

      // Step 6: Reverse spatial differencing (NOAA g2clib algorithm - same as wgrib2)
      if (orderOfSpatialDiff > 0) {
        if (orderOfSpatialDiff === 1) {
          // First-order spatial differencing
          ifld[0] = h1;
          for (n = 1; n < numberOfPoints; n++) {
            ifld[n] = ifld[n] + overallMin;
            ifld[n] = ifld[n] + ifld[n - 1];
          }
        } else if (orderOfSpatialDiff === 2) {
          // Second-order spatial differencing (NOAA algorithm)
          ifld[0] = h1;
          ifld[1] = h2;
          for (n = 2; n < numberOfPoints; n++) {
            ifld[n] = ifld[n] + overallMin;
            ifld[n] = ifld[n] + (2 * ifld[n - 1]) - ifld[n - 2];
          }
        }
      }

      // Step 7: Apply final scaling to float values
      const data = new Float32Array(numberOfPoints);
      for (let i = 0; i < numberOfPoints; i++) {
        data[i] = (R + ifld[i] * binaryScale) * decimalScale;
      }

      return data;
    } catch (error) {
      console.warn(`Error decoding complex packing (${numberOfPoints} points):`, error.message);
      // Return array of zeros as fallback
      return new Float32Array(numberOfPoints);
    }
  }

  /**
   * Section 8: End Section
   */
  parseSection8() {
    const endSignature = String.fromCharCode(
      this.view.getUint8(this.offset),
      this.view.getUint8(this.offset + 1),
      this.view.getUint8(this.offset + 2),
      this.view.getUint8(this.offset + 3)
    );

    if (endSignature !== '7777') {
      throw new Error('Invalid end section');
    }

    this.offset += 4;
  }

  /**
   * Read n bits from the buffer at a bit offset
   */
  readBits(bitOffset, numberOfBits) {
    const byteOffset = Math.floor(bitOffset / 8);
    const bitShift = bitOffset % 8;

    // Check bounds
    const lastByteNeeded = Math.floor((bitOffset + numberOfBits - 1) / 8);
    if (lastByteNeeded >= this.buffer.byteLength) {
      throw new Error(`Offset ${lastByteNeeded} is outside the bounds of the DataView (size: ${this.buffer.byteLength})`);
    }

    let value = 0;
    let bitsRead = 0;

    while (bitsRead < numberOfBits) {
      const currentByteOffset = byteOffset + Math.floor((bitShift + bitsRead) / 8);
      const currentBitShift = (bitShift + bitsRead) % 8;

      const byte = this.view.getUint8(currentByteOffset);
      const bitsAvailable = 8 - currentBitShift;
      const bitsToRead = Math.min(numberOfBits - bitsRead, bitsAvailable);

      const mask = (1 << bitsToRead) - 1;
      const shift = bitsAvailable - bitsToRead;

      value = (value << bitsToRead) | ((byte >> shift) & mask);
      bitsRead += bitsToRead;
    }

    return value;
  }

  /**
   * Read 64-bit unsigned integer (big-endian)
   */
  readUint64(offset) {
    const high = this.view.getUint32(offset);
    const low = this.view.getUint32(offset + 4);
    return high * 0x100000000 + low;
  }

  /**
   * Get all messages
   */
  getMessages() {
    return this.messages;
  }

  /**
   * Get a formatted summary of the GRIB file
   */
  getSummary() {
    return this.messages.map((msg, index) => {
      const s1 = msg.sections.section1;
      const s3 = msg.sections.section3;
      const s5 = msg.sections.section5;

      return {
        messageIndex: index,
        date: `${s1.year}-${String(s1.month).padStart(2, '0')}-${String(s1.day).padStart(2, '0')} ${String(s1.hour).padStart(2, '0')}:${String(s1.minute).padStart(2, '0')}:${String(s1.second).padStart(2, '0')}`,
        discipline: msg.discipline,
        gridPoints: s3.numberOfDataPoints,
        gridTemplate: s3.gridDefinitionTemplateNumber,
        dataPoints: s5.numberOfDataPoints,
        gridDimensions: s3.gridTemplate ? `${s3.gridTemplate.ni}x${s3.gridTemplate.nj}` : 'N/A'
      };
    });
  }

  /**
   * Get grid information (like wgrib2 -grid)
   * Returns grid definition details in a structured JavaScript format
   *
   * @param {Number} messageIndex - Index of message to extract grid from (default: 0)
   * @returns {Object} Grid information object with all grid parameters
   *
   * Example output:
   * {
   *   gridTemplate: 0,
   *   gridType: 'lat-lon',
   *   winds: 'grid relative',  // or 'earth relative'
   *   dimensions: { ni: 86, nj: 47 },
   *   totalPoints: 4042,
   *   latitude: { first: 42.750000, last: 54.250000, increment: 0.250000 },
   *   longitude: { first: 351.750000, last: 13.000000, increment: 0.250000 },
   *   scanning: { mode: 0, inputOrder: 'WE:SN', outputOrder: 'WE:SN' },
   *   resolution: 48,
   *   units: '1e-06'
   * }
   */
  getGrid(messageIndex = 0) {
    if (this.messages.length === 0) {
      throw new Error('No messages parsed. Call parse() first.');
    }

    if (messageIndex >= this.messages.length) {
      throw new Error(`Message index ${messageIndex} out of range (0-${this.messages.length - 1})`);
    }

    const message = this.messages[messageIndex];
    const section3 = message.sections.section3;

    if (!section3) {
      throw new Error('No grid definition section found');
    }

    const gridTemplate = section3.gridTemplate;
    if (!gridTemplate) {
      throw new Error('No grid template found');
    }

    const gridTemplateNumber = section3.gridDefinitionTemplateNumber;

    // Determine wind convention (grid-relative vs earth-relative)
    const resolutionFlags = gridTemplate.resolutionAndComponentFlags || 0;
    const isGridRelative = (resolutionFlags & 0x08) !== 0;
    const windConvention = isGridRelative ? 'grid relative' : 'earth relative';

    // Determine scanning order
    const scanningMode = gridTemplate.scanningMode || 0;
    const iScansPositively = (scanningMode & 0x80) === 0; // 0 = W to E, 1 = E to W
    const jScansPositively = (scanningMode & 0x40) !== 0; // 0 = N to S, 1 = S to N

    const iDirection = iScansPositively ? 'WE' : 'EW';
    const jDirection = jScansPositively ? 'SN' : 'NS';
    const scanOrder = `${iDirection}:${jDirection}`;

    // Get grid type name
    let gridType = 'unknown';
    if (gridTemplateNumber === 0) {
      gridType = 'lat-lon grid';
    } else if (gridTemplateNumber === 30) {
      gridType = 'Lambert Conformal';
    } else if (gridTemplateNumber === 20) {
      gridType = 'Polar Stereographic';
    }

    // Build result object
    const gridInfo = {
      gridTemplate: gridTemplateNumber,
      gridType: gridType,
      winds: windConvention,
      dimensions: {
        ni: gridTemplate.ni,
        nj: gridTemplate.nj
      },
      totalPoints: section3.numberOfDataPoints,
      latitude: {
        first: gridTemplate.latitudeOfFirstGridPoint,
        last: gridTemplate.latitudeOfLastGridPoint,
        increment: gridTemplate.jDirectionIncrement
      },
      longitude: {
        first: gridTemplate.longitudeOfFirstGridPoint,
        last: gridTemplate.longitudeOfLastGridPoint,
        increment: gridTemplate.iDirectionIncrement
      },
      scanning: {
        mode: scanningMode,
        inputOrder: scanOrder,
        outputOrder: scanOrder  // WGrib2JS preserves input order
      },
      resolution: resolutionFlags,
      units: '1e-06'  // GRIB2 standard scaling for lat/lon
    };

    return gridInfo;
  }

  /**
   * Get short inventory (like wgrib2 -s)
   * Returns a formatted inventory list of all messages in the GRIB file
   *
   * @returns {Array<Object>} Array of inventory entries with:
   *   - messageNumber: Message index (1-based like wgrib2)
   *   - offset: Byte offset in file
   *   - date: Reference date (format: YYYYMMDDHH)
   *   - parameter: Parameter name (e.g., 'UGRD', 'VGRD')
   *   - level: Level description (e.g., '10 m above ground')
   *   - forecastTime: Forecast time description (e.g., '33 hour fcst')
   *   - inventoryLine: Full wgrib2-compatible inventory line
   *
   * Example output:
   * [
   *   {
   *     messageNumber: 1,
   *     offset: 0,
   *     date: '2025101312',
   *     parameter: 'UGRD',
   *     level: '10 m above ground',
   *     forecastTime: '33 hour fcst',
   *     inventoryLine: '1:0:d=2025101312:UGRD:10 m above ground:33 hour fcst:'
   *   },
   *   ...
   * ]
   */
  getInventory() {
    if (this.messages.length === 0) {
      throw new Error('No messages parsed. Call parse() first.');
    }

    const inventory = [];
    let currentOffset = 0;

    this.messages.forEach((message, index) => {
      const s1 = message.sections.section1;
      const s4 = message.sections.section4;

      // Format date as YYYYMMDDHH
      const dateStr = `${s1.year}${String(s1.month).padStart(2, '0')}${String(s1.day).padStart(2, '0')}${String(s1.hour).padStart(2, '0')}`;

      // Extract parameter information from Section 4
      let parameter = 'unknown';
      let level = 'unknown';
      let forecastTime = 'unknown';

      if (s4 && s4.templateData) {
        // Get parameter category and number (bytes 0-1 of template)
        const category = s4.templateData[0];
        const number = s4.templateData[1];
        parameter = this.getParameterName(category, number).toUpperCase();

        // For Product Definition Template 4.0 (Analysis/Forecast at horizontal level)
        // Based on GRIB2 specification (WMO Manual 306), template bytes are:
        // Octet 17 (byte 8): Indicator of unit of time range
        // Octets 18-21 (bytes 9-12): Forecast time (4 bytes, big-endian)
        // Octet 22 (byte 13): Type of first fixed surface
        // Octet 23 (byte 14): Scale factor of first fixed surface
        // Octets 24-27 (bytes 15-18): Scaled value of first fixed surface (4 bytes)

        // Get forecast time (4 bytes starting at offset 9)
        if (s4.templateData.length >= 13) {
          const timeUnit = s4.templateData[8]; // Unit indicator
          // Forecast time is 4 bytes (big-endian unsigned int)
          const forecastTimeValue = (s4.templateData[9] << 24) | (s4.templateData[10] << 16) |
                                    (s4.templateData[11] << 8) | s4.templateData[12];

          // Interpret time unit (based on Code Table 4.4)
          const timeUnitStr = this.getTimeUnitDescription(timeUnit);
          forecastTime = `${forecastTimeValue} ${timeUnitStr} fcst`;
        }

        // Get level information (starting at offset 13)
        if (s4.templateData.length >= 19) {
          const levelType = s4.templateData[13]; // Type of first fixed surface
          const scaleFactor = s4.templateData[14]; // Scale factor
          const scaledValue = (s4.templateData[15] << 24) | (s4.templateData[16] << 16) |
                              (s4.templateData[17] << 8) | s4.templateData[18];

          // Apply scale factor (can be negative for mb levels)
          const levelValue = scaledValue / Math.pow(10, scaleFactor);

          // Interpret level type (based on Code Table 4.5)
          level = this.getLevelDescription(levelType, levelValue);
        }
      }

      // Build inventory line (wgrib2 format)
      const inventoryLine = `${index + 1}:${currentOffset}:d=${dateStr}:${parameter}:${level}:${forecastTime}:`;

      inventory.push({
        messageNumber: index + 1,
        offset: currentOffset,
        date: dateStr,
        parameter: parameter,
        level: level,
        forecastTime: forecastTime,
        inventoryLine: inventoryLine
      });

      // Update offset for next message
      currentOffset += message.totalLength;
    });

    return inventory;
  }

  /**
   * Get level description from level type and value
   * Based on GRIB2 Code Table 4.5
   */
  getLevelDescription(levelType, levelValue) {
    // Helper to format float values (remove trailing zeros after decimal point only)
    const formatValue = (val) => {
      const rounded = Math.round(val * 1e10) / 1e10; // Round to avoid float precision issues
      const str = rounded.toString();
      // Only remove trailing zeros after a decimal point
      if (str.includes('.')) {
        return str.replace(/\.?0+$/, '');
      }
      return str;
    };

    switch (levelType) {
      case 1:
        return 'surface';
      case 2:
        return 'cloud base';
      case 3:
        return 'cloud top';
      case 4:
        return '0 deg isotherm';
      case 6:
        return 'max wind';
      case 7:
        return 'tropopause';
      case 8:
        return 'top of atmosphere';
      case 100:
        // Isobaric level in Pascals - convert to millibars
        // 1 mb = 100 Pa, so Pa * 0.01 = mb
        return `${formatValue(levelValue * 0.01)} mb`;
      case 101:
        return 'mean sea level';
      case 102:
        return `${formatValue(levelValue)} m above mean sea level`;
      case 103:
        return `${formatValue(levelValue)} m above ground`;
      case 104:
        return `${formatValue(levelValue)} sigma level`;
      case 105:
        return `${formatValue(levelValue)} hybrid level`;
      case 106:
        return `${formatValue(levelValue)} m below land surface`;
      case 107:
        return `${formatValue(levelValue)} K isentropic`;
      case 108:
        // Layer between two levels at specified height (in hPa) above ground
        // wgrib2 format: "30-0 mb above ground" for 3000 Pa
        // The value is in hPa (or mb), and wgrib2 shows it as "upper-0 mb above ground"
        return `${Math.round(levelValue / 100)}-0 mb above ground`;
      case 109:
        return `PV=${formatValue(levelValue)} PVU`;
      case 200:
        return 'entire atmosphere';
      case 201:
        return 'entire ocean';
      case 220:
        return 'planetary boundary layer';
      case 221:
        return 'layer between two isobaric surfaces';
      case 222:
        return 'layer between two levels at specified height above MSL';
      default:
        return `level ${levelType} = ${formatValue(levelValue)}`;
    }
  }

  /**
   * Get time unit description
   * Based on GRIB2 Code Table 4.4
   */
  getTimeUnitDescription(timeUnit) {
    switch (timeUnit) {
      case 0:
        return 'minute';
      case 1:
        return 'hour';
      case 2:
        return 'day';
      case 3:
        return 'month';
      case 4:
        return 'year';
      case 5:
        return 'decade';
      case 6:
        return 'normal (30 years)';
      case 7:
        return 'century';
      case 10:
        return '3 hour';
      case 11:
        return '6 hour';
      case 12:
        return '12 hour';
      case 13:
        return 'second';
      default:
        return `unit ${timeUnit}`;
    }
  }

  /**
   * Get parameter name from category and number
   */
  getParameterName(category, number) {
    // Discipline 0 = Meteorological products
    // Category 2 = Momentum
    if (category === 2) {
      if (number === 2) return 'ugrd'; // U-component of wind
      if (number === 3) return 'vgrd'; // V-component of wind
      if (number === 1) return 'vwnd'; // V-component of wind (alternative)
      if (number === 0) return 'uwnd'; // U-component of wind (alternative)
    }
    // Category 0 = Temperature
    if (category === 0) {
      if (number === 0) return 'temp'; // Temperature
    }
    // Category 1 = Moisture
    if (category === 1) {
      if (number === 0) return 'spfh'; // Specific humidity
      if (number === 1) return 'rh';   // Relative humidity
    }
    // Category 3 = Mass
    if (category === 3) {
      if (number === 0) return 'pres'; // Pressure
      if (number === 1) return 'pmsl'; // Pressure reduced to MSL
    }

    return `param_${category}_${number}`;
  }

  /**
   * Extract data in a structured format with easy access properties
   *
   * @param {Object} options - Options for data extraction
   * @param {Number} options.messageIndex - Index of message to use for grid (default: 0)
   * @param {String} options.match - Pattern matching like wgrib2 -match (regex applied to inventory line). Example: ":UGRD:", ":UGRD:10 m above ground:", ":.*:24 hour fcst:"
   * @param {Boolean} options.multiLevel - If true, returns arrays of parameters for each level (default: false)
   * @param {Boolean} options.firstParameterOnly - If true (default), keeps only first occurrence of each parameter (like wgrib2 -match)
   * @param {Array<String>} options.parameters - Filter by parameter names (e.g., ['ugrd', 'vgrd']). If specified, only these parameters are extracted
   * @param {Number} options.levelType - Filter by level type code (e.g., 103 for "m above ground", 100 for isobaric)
   * @param {Number} options.levelValue - Filter by level value (e.g., 10 for "10 m above ground")
   * @param {Boolean} options.asObjects - If true, returns array of objects with all properties per point (default: false)
   * @param {String} options.longitudeFormat - Longitude normalization format:
   *   - 'preserve' : Keep values exactly as calculated from GRIB (default, e.g., 351.75° → 373°)
   *   - '0-360' : Normalize to [0, 360) range (e.g., 351.75° → 359.75° → 0° → 13°)
   *   - '-180-180' : Normalize to [-180, +180] range like wgrib2 (e.g., 351.75° → -8.25° → 13°)
   * @param {Boolean} options.calculateWindSpeed - If true, automatically calculate wind_speed from UGRD and VGRD (like wgrib2 -wind_speed)
   * @param {Boolean} options.calculateWindDirection - If true, automatically calculate wind_dir from UGRD and VGRD (like wgrib2 -wind_dir)
   * @param {Boolean} options.earthRelativeWinds - If true, convert grid-relative winds to earth-relative (like wgrib2 -wind_uv) (default: auto-detect)
   *
   * @returns {Object|Array} Returns data in one of two formats:
   *
   * 1. Default format (asObjects: false) - Separate arrays for each property:
   *    {
   *      lat: Float32Array,      // Latitude for each point (degrees)
   *      lng: Float32Array,      // Longitude for each point (degrees)
   *      ugrd: Float32Array,     // U-component of wind (m/s)
   *      vgrd: Float32Array,     // V-component of wind (m/s)
   *      metadata: Object,       // File metadata and grid info
   *      numPoints: Number       // Total number of grid points
   *    }
   *
   * 2. Object format (asObjects: true) - Array of objects, one per grid point:
   *    [
   *      {
   *        lat: 42.750,          // Latitude (degrees)
   *        lng: 351.750,         // Longitude (degrees)
   *        ugrd: -0.492454,      // U-component of wind (m/s)
   *        vgrd: 0.789840,       // V-component of wind (m/s)
   *        // ... autres paramètres météorologiques disponibles
   *      },
   *      {
   *        lat: 42.750,
   *        lng: 352.000,
   *        ugrd: -0.532454,
   *        vgrd: -0.220161,
   *      },
   *      // ... un objet par point de grille (4042 objets pour meteo.grib)
   *    ]
   *
   * Note: Le format objet (asObjects: true) est plus pratique pour l'itération et l'accès
   * aux données, mais utilise plus de mémoire. Le format par défaut (tableaux séparés)
   * est plus efficace pour de grandes quantités de données.
   */
  getData(options = {}) {
    if (this.messages.length === 0) {
      throw new Error('No messages parsed. Call parse() first.');
    }

    const messageIndex = options.messageIndex || 0;
    const multiLevel = options.multiLevel || false;
    const firstParameterOnly = options.firstParameterOnly !== false; // default: true
    const filterParameters = options.parameters || null; // array of parameter names to extract
    const filterLevelType = options.levelType !== undefined ? options.levelType : null;
    const filterLevelValue = options.levelValue !== undefined ? options.levelValue : null;
    const matchPattern = options.match || null; // regex pattern like wgrib2 -match

    // If match pattern is provided, filter messages by inventory line
    let messageIndicesToProcess = null;
    if (matchPattern) {
      try {
        const regex = new RegExp(matchPattern);
        const inventory = this.getInventory();

        // Filter messages that match the pattern
        const matchedIndices = inventory
          .filter(entry => regex.test(entry.inventoryLine))
          .map(entry => entry.messageNumber - 1); // Convert to 0-based index

        if (matchedIndices.length === 0) {
          throw new Error(`No messages match pattern: ${matchPattern}`);
        }

        messageIndicesToProcess = matchedIndices;
      } catch (error) {
        if (error.message.startsWith('No messages match')) {
          throw error;
        }
        throw new Error(`Invalid match pattern: ${matchPattern} - ${error.message}`);
      }
    }

    // Get grid information from specified message
    const firstMessage = this.messages[messageIndex];
    const grid = firstMessage.sections.section3?.gridTemplate;

    if (!grid) {
      throw new Error('No grid template found in GRIB file');
    }

    const ni = grid.ni;
    const nj = grid.nj;
    const numPoints = ni * nj;

    // Generate latitude and longitude arrays based on scanning mode
    const lat = new Float32Array(numPoints);
    const lng = new Float32Array(numPoints);

    // Bit 7 (0x80): 0 = +i direction (W to E), 1 = -i direction (E to W)
    // Bit 6 (0x40): 0 = -j direction (N to S), 1 = +j direction (S to N)
    const scanningMode = grid.scanningMode || 0;
    const iScansPositively = (scanningMode & 0x80) === 0;
    const jScansPositively = (scanningMode & 0x40) !== 0;

    // Direction multipliers
    const iMultiplier = iScansPositively ? 1 : -1;
    const jMultiplier = jScansPositively ? 1 : -1;

    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const idx = j * ni + i;

        // Calculate lat/lng based on scanning direction
        lat[idx] = grid.latitudeOfFirstGridPoint + j * grid.jDirectionIncrement * jMultiplier;
        lng[idx] = grid.longitudeOfFirstGridPoint + i * grid.iDirectionIncrement * iMultiplier;
      }
    }

    // Apply longitude normalization based on longitudeFormat option
    const longitudeFormat = options.longitudeFormat || 'preserve';

    if (longitudeFormat === '0-360') {
      // Normalize to [0, 360) range
      for (let i = 0; i < numPoints; i++) {
        while (lng[i] >= 360) lng[i] -= 360;
        while (lng[i] < 0) lng[i] += 360;
      }
    } else if (longitudeFormat === '-180-180') {
      // Normalize to [-180, +180] range (like wgrib2)
      for (let i = 0; i < numPoints; i++) {
        while (lng[i] > 180) lng[i] -= 360;
        while (lng[i] <= -180) lng[i] += 360;
      }
    }
    // else: 'preserve' - keep values as calculated

    // Extract metadata
    const s1 = firstMessage.sections.section1;

    // Calculate lat/lon min/max from real data after normalization
    // This correctly handles grids that cross the 0° meridian
    let latMin = Infinity, latMax = -Infinity;
    let lngMin = Infinity, lngMax = -Infinity;

    for (let i = 0; i < numPoints; i++) {
      if (lat[i] < latMin) latMin = lat[i];
      if (lat[i] > latMax) latMax = lat[i];
      if (lng[i] < lngMin) lngMin = lng[i];
      if (lng[i] > lngMax) lngMax = lng[i];
    }

    const metadata = {
      date: new Date(Date.UTC(s1.year, s1.month - 1, s1.day, s1.hour, s1.minute, s1.second)),
      year: s1.year,
      month: s1.month,
      day: s1.day,
      hour: s1.hour,
      minute: s1.minute,
      second: s1.second,
      centreId: s1.centreId,
      grid: {
        ni: ni,
        nj: nj,
        latMin: latMin,
        latMax: latMax,
        lngMin: lngMin,
        lngMax: lngMax,
        latIncrement: grid.jDirectionIncrement,
        lngIncrement: grid.iDirectionIncrement,
        scanningMode: scanningMode  // Add scanning mode for reference
      }
    };

    // Extract parameter data
    const result = {
      lat: lat,
      lng: lng,
      metadata: metadata,
      numPoints: numPoints
    };

    if (multiLevel) {
      // For multi-level data, store arrays of parameters
      result.levels = [];
    }

    // Parse each message and extract parameter data
    const paramCounts = {};

    this.messages.forEach((msg, idx) => {
      // If match pattern was provided, only process messages that matched
      if (messageIndicesToProcess && !messageIndicesToProcess.includes(idx)) {
        return; // Skip this message
      }

      const s4 = msg.sections.section4;
      const s7 = msg.sections.section7;

      if (s4 && s4.templateData && s7 && s7.data) {
        const category = s4.templateData[0];
        const number = s4.templateData[1];
        const paramName = this.getParameterName(category, number);

        // Extract level information if available (bytes 11-15 of template data)
        let levelType = 'unknown';
        let levelValue = null;

        if (s4.templateData.length >= 14) {
          levelType = s4.templateData[9]; // Type of first fixed surface
          levelValue = (s4.templateData[11] << 24) | (s4.templateData[12] << 16) |
                      (s4.templateData[13] << 8) | s4.templateData[14];
        }

        // Apply filters (like wgrib2 -match)
        // 1. Filter by parameter names
        if (filterParameters && !filterParameters.includes(paramName)) {
          return; // Skip this message
        }

        // 2. Filter by level type
        if (filterLevelType !== null && levelType !== filterLevelType) {
          return; // Skip this message
        }

        // 3. Filter by level value
        if (filterLevelValue !== null && levelValue !== filterLevelValue) {
          return; // Skip this message
        }

        if (multiLevel) {
          // Store all levels
          result.levels.push({
            messageIndex: idx,
            parameter: paramName,
            category: category,
            number: number,
            levelType: levelType,
            levelValue: levelValue,
            data: s7.data
          });
        } else {
          // For single level mode, check if we should keep first only
          if (firstParameterOnly) {
            if (!paramCounts[paramName]) {
              paramCounts[paramName] = 0;
              result[paramName] = s7.data;
            }
            paramCounts[paramName]++;
          } else {
            // Keep all occurrences (will overwrite previous)
            result[paramName] = s7.data;
            paramCounts[paramName] = (paramCounts[paramName] || 0) + 1;
          }
        }
      }
    });

    // Add info about duplicate parameters
    if (!multiLevel) {
      const duplicates = Object.entries(paramCounts)
        .filter(([name, count]) => count > 1)
        .map(([name, count]) => ({ parameter: name, count: count }));

      if (duplicates.length > 0) {
        result._warnings = {
          multiplelevels: true,
          duplicates: duplicates,
          message: 'File contains multiple levels. Use getData({multiLevel: true}) to access all levels.'
        };
      }
    }

    // Convert grid-relative winds to earth-relative if needed (like wgrib2 -wind_uv)
    const resolutionFlags = grid.resolutionAndComponentFlags || 0;
    const isGridRelative = (resolutionFlags & 0x08) !== 0; // Bit 3: 1 = grid-relative, 0 = earth-relative

    if (options.earthRelativeWinds !== false && isGridRelative && !multiLevel) {
      if (result.ugrd && result.vgrd) {
        // Convert grid-relative winds to earth-relative
        this.convertWindsToEarthRelative(result.ugrd, result.vgrd, lat, lng, grid, numPoints);
      }
    }

    // Calculate wind_speed if requested (like wgrib2 -wind_speed)
    if (options.calculateWindSpeed && !multiLevel) {
      if (result.ugrd && result.vgrd) {
        const wind_speed = new Float32Array(numPoints);
        for (let i = 0; i < numPoints; i++) {
          const u = result.ugrd[i];
          const v = result.vgrd[i];
          wind_speed[i] = Math.sqrt(u * u + v * v);
        }
        result.wind_speed = wind_speed;
      }
    }

    // Calculate wind_dir if requested (like wgrib2 -wind_dir)
    if (options.calculateWindDirection && !multiLevel) {
      if (result.ugrd && result.vgrd) {
        const wind_dir = new Float32Array(numPoints);
        for (let i = 0; i < numPoints; i++) {
          const u = result.ugrd[i];
          const v = result.vgrd[i];
          // Meteorological convention: direction wind comes FROM
          // 0° = North, 90° = East, 180° = South, 270° = West
          let dir = Math.atan2(-u, -v) * 180 / Math.PI;
          if (dir < 0) dir += 360;
          wind_dir[i] = dir;
        }
        result.wind_dir = wind_dir;
      }
    }

    // Convert to object format if requested
    // Structure des objets retournés : chaque objet représente un point de grille avec :
    // - lat (Number) : latitude du point en degrés
    // - lng (Number) : longitude du point en degrés
    // - ugrd, vgrd, temp, etc. : paramètres météorologiques disponibles
    if (options.asObjects && !multiLevel) {
      const objectArray = [];

      // Collect all parameter names (excluding metadata and special properties)
      const paramNames = Object.keys(result).filter(key =>
        key !== 'lat' &&
        key !== 'lng' &&
        key !== 'metadata' &&
        key !== 'numPoints' &&
        !key.startsWith('_')
      );

      // Create an object for each grid point
      for (let i = 0; i < numPoints; i++) {
        const point = {
          lat: lat[i],
          lng: lng[i]
        };

        // Add all available parameters for this point
        paramNames.forEach(paramName => {
          if (result[paramName] && result[paramName][i] !== undefined) {
            point[paramName] = result[paramName][i];
          }
        });

        objectArray.push(point);
      }

      return objectArray;
    }

    return result;
  }

  /**
   * Calculate wind speed and direction from U and V components
   * Returns array of objects with speed and direction for each point
   */
  calculateWind(data) {
    if (!data.ugrd || !data.vgrd) {
      throw new Error('UGRD and VGRD data required for wind calculation');
    }

    const numPoints = data.ugrd.length;
    const wind = new Array(numPoints);

    for (let i = 0; i < numPoints; i++) {
      const u = data.ugrd[i];
      const v = data.vgrd[i];

      // Calculate wind speed: sqrt(u² + v²)
      const speed = Math.sqrt(u * u + v * v);

      // Calculate wind direction (meteorological: where wind comes from)
      // 0° = North, 90° = East, 180° = South, 270° = West
      let direction = Math.atan2(-u, -v) * 180 / Math.PI;
      if (direction < 0) direction += 360;

      wind[i] = {
        speed: speed,
        direction: direction,
        u: u,
        v: v
      };
    }

    return wind;
  }

  /**
   * Convert grid-relative winds to earth-relative winds (like wgrib2 -wind_uv)
   * Modifies ugrd and vgrd arrays in place
   *
   * For lat-lon grids (template 0), no rotation is needed as grid is already aligned with earth
   * For projected grids (Lambert, Polar Stereographic), rotation angle depends on longitude
   *
   * @param {Float32Array} ugrd - U component array (modified in place)
   * @param {Float32Array} vgrd - V component array (modified in place)
   * @param {Float32Array} lat - Latitude array
   * @param {Float32Array} lng - Longitude array
   * @param {Object} grid - Grid template object
   * @param {Number} numPoints - Number of grid points
   */
  convertWindsToEarthRelative(ugrd, vgrd, lat, lng, grid, numPoints) {
    // For grid template 0 (lat-lon), winds are already earth-relative by definition
    // No rotation needed as grid lines align with meridians and parallels
    if (grid.gridDefinitionTemplateNumber === undefined) {
      // Assuming template 0 if not specified
      return;
    }

    // For other grid templates (Lambert Conformal, Polar Stereographic, etc.),
    // rotation would be needed. This would be implemented here.
    // For now, we only support lat-lon grids which don't need rotation.

    // Example rotation formula for projected grids:
    // For each point i:
    //   angle = calculateConvergenceAngle(lat[i], lng[i], grid);
    //   u_earth = u_grid * cos(angle) - v_grid * sin(angle);
    //   v_earth = u_grid * sin(angle) + v_grid * cos(angle);
  }

  /**
   * Perform bilinear interpolation at a specific lat/lng point (like wgrib2 -new_grid_interpolation bilinear)
   *
   * @param {Object} data - Data object from getData() with lat, lng, and parameter arrays
   * @param {Number} targetLat - Target latitude for interpolation
   * @param {Number} targetLng - Target longitude for interpolation
   * @param {Array<String>} parameters - Array of parameter names to interpolate (e.g., ['ugrd', 'vgrd', 'temp'])
   * @returns {Object} Interpolated values for each parameter, or null if point is outside grid
   */
  bilinearInterpolate(data, targetLat, targetLng, parameters) {
    if (!data.lat || !data.lng || !data.metadata || !data.metadata.grid) {
      throw new Error('Invalid data object. Use getData() first.');
    }

    const grid = data.metadata.grid;
    const ni = grid.ni;
    const nj = grid.nj;

    // Find the grid cell containing the target point
    // Assuming regular lat-lon grid with consistent spacing
    const latMin = grid.latMin;
    const latMax = grid.latMax;
    const lngMin = grid.lngMin;
    const lngMax = grid.lngMax;
    const latInc = grid.latIncrement;
    const lngInc = grid.lngIncrement;

    // Check if point is within grid bounds
    if (targetLat < Math.min(latMin, latMax) || targetLat > Math.max(latMin, latMax) ||
        targetLng < lngMin || targetLng > lngMax) {
      return null; // Outside grid
    }

    // Find surrounding grid points
    // Calculate grid indices (fractional)
    const iFloat = (targetLng - lngMin) / lngInc;
    const jFloat = (targetLat - latMin) / latInc;

    // Get integer indices of surrounding points
    const i0 = Math.floor(iFloat);
    const i1 = Math.min(i0 + 1, ni - 1);
    const j0 = Math.floor(jFloat);
    const j1 = Math.min(j0 + 1, nj - 1);

    // Calculate interpolation weights
    const wx = iFloat - i0; // Weight in x direction (0 to 1)
    const wy = jFloat - j0; // Weight in y direction (0 to 1)

    // Get indices in 1D array
    const idx00 = j0 * ni + i0; // Bottom-left
    const idx10 = j0 * ni + i1; // Bottom-right
    const idx01 = j1 * ni + i0; // Top-left
    const idx11 = j1 * ni + i1; // Top-right

    const result = {
      lat: targetLat,
      lng: targetLng,
      indices: { i0, i1, j0, j1, wx, wy }
    };

    // Interpolate each requested parameter
    parameters.forEach(param => {
      if (data[param]) {
        const arr = data[param];

        // Bilinear interpolation formula:
        // f(x,y) = f00*(1-wx)*(1-wy) + f10*wx*(1-wy) + f01*(1-wx)*wy + f11*wx*wy
        const v00 = arr[idx00];
        const v10 = arr[idx10];
        const v01 = arr[idx01];
        const v11 = arr[idx11];

        result[param] = v00 * (1 - wx) * (1 - wy) +
                        v10 * wx * (1 - wy) +
                        v01 * (1 - wx) * wy +
                        v11 * wx * wy;
      }
    });

    return result;
  }

  /**
   * Interpolate data to a new regular grid using bilinear interpolation
   *
   * @param {Object} data - Data object from getData()
   * @param {Object} newGrid - New grid specification
   * @param {Number} newGrid.latMin - Minimum latitude of new grid
   * @param {Number} newGrid.latMax - Maximum latitude of new grid
   * @param {Number} newGrid.lngMin - Minimum longitude of new grid
   * @param {Number} newGrid.lngMax - Maximum longitude of new grid
   * @param {Number} newGrid.latStep - Latitude step/increment
   * @param {Number} newGrid.lngStep - Longitude step/increment
   * @param {Array<String>} parameters - Array of parameters to interpolate
   * @returns {Object} New data object with interpolated values
   */
  regridBilinear(data, newGrid, parameters) {
    const { latMin, latMax, lngMin, lngMax, latStep, lngStep } = newGrid;

    // Calculate new grid dimensions
    const newNi = Math.round((lngMax - lngMin) / lngStep) + 1;
    const newNj = Math.round((latMax - latMin) / latStep) + 1;
    const newNumPoints = newNi * newNj;

    // Create new arrays
    const newLat = new Float32Array(newNumPoints);
    const newLng = new Float32Array(newNumPoints);
    const newData = {
      lat: newLat,
      lng: newLng,
      numPoints: newNumPoints,
      metadata: {
        ...data.metadata,
        grid: {
          ...data.metadata.grid,
          ni: newNi,
          nj: newNj,
          latMin,
          latMax,
          lngMin,
          lngMax,
          latIncrement: latStep,
          lngIncrement: lngStep
        }
      }
    };

    // Initialize parameter arrays
    parameters.forEach(param => {
      newData[param] = new Float32Array(newNumPoints);
    });

    // Fill new grid with interpolated values
    let idx = 0;
    for (let j = 0; j < newNj; j++) {
      for (let i = 0; i < newNi; i++) {
        const targetLat = latMin + j * latStep;
        const targetLng = lngMin + i * lngStep;

        newLat[idx] = targetLat;
        newLng[idx] = targetLng;

        // Interpolate values at this point
        const interpolated = this.bilinearInterpolate(data, targetLat, targetLng, parameters);

        if (interpolated) {
          parameters.forEach(param => {
            if (interpolated[param] !== undefined) {
              newData[param][idx] = interpolated[param];
            }
          });
        } else {
          // Point outside original grid - fill with NaN
          parameters.forEach(param => {
            newData[param][idx] = NaN;
          });
        }

        idx++;
      }
    }

    return newData;
  }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GribReader;
}
