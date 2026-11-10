import { unzipSync, strFromU8 } from 'fflate';
import { MaterialType } from './pricingEngine';

export interface ParsedSlicerFilament {
  slotIndex: number;
  material: MaterialType;
  colorHex: string;
  usedGrams: number;
}

export interface ParsedSlicerResult {
  sourceType: 'gcode' | '3mf-sliced' | '3mf-mesh' | 'stl-mesh' | 'slicer-text';
  fileName: string;
  productNameSuggestion: string;
  printHours: number;
  printMinutes: number;
  totalModelGrams: number;
  totalSupportGrams: number;
  totalPurgeGrams: number;
  objectCount: number;
  filaments: ParsedSlicerFilament[];
  summaryNote: string;
}

function cleanProductName(fileName: string): string {
  return fileName
    .replace(/\.(gcode|3mf|stl)$/i, '')
    .replace(/_\d+(\.\d+)?mm_[A-Z0-9]+_[A-Z0-9]+_\d+h\d+m$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function normalizeMaterial(raw?: string): MaterialType {
  const up = (raw || '').toUpperCase();
  if (up.includes('SILK')) return 'Silk PLA';
  if (up.includes('MATTE')) return 'Matte PLA';
  if (up.includes('PLA-CF') || up.includes('PLACF')) return 'PLA-CF';
  if (up.includes('PETG-CF') || up.includes('PETGCF')) return 'PETG-CF';
  if (up.includes('PETG')) return 'PETG';
  if (up.includes('TPU') || up.includes('TPE') || up.includes('FLEX')) return 'TPU';
  if (up.includes('ASA')) return 'ASA';
  if (up.includes('ABS')) return 'ABS';
  if (up.includes('PA') || up.includes('NYLON')) return 'PA-CF';
  return 'PLA';
}

export function parseDurationString(raw: string): { hours: number; minutes: number } | null {
  const daysMatch = raw.match(/(\d+)\s*d(?:ays?)?/i);
  const hoursMatch = raw.match(/(\d+)\s*h(?:ours?|rs?)?/i);
  const minsMatch = raw.match(/(\d+)\s*m(?:in(?:ute)?s?)?/i);
  const secsMatch = raw.match(/(\d+)\s*s(?:ec(?:ond)?s?)?/i);

  if (!daysMatch && !hoursMatch && !minsMatch) return null;

  const days = daysMatch ? parseInt(daysMatch[1], 10) : 0;
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
  const secs = secsMatch ? parseInt(secsMatch[1], 10) : 0;

  const totalMinutes = days * 24 * 60 + hours * 60 + mins + (secs >= 30 ? 1 : 0);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

export function parseGcodeContent(content: string, fileName = 'print.gcode'): ParsedSlicerResult {
  let totalModelGrams = 0;
  let totalPurgeGrams = 0;
  let printHours = 0;
  let printMinutes = 0;
  const filaments: ParsedSlicerFilament[] = [];

  // Check filename first for quick fallback (e.g. uniflood_0.2mm_PLA_MK3S_19h2m.gcode)
  const fnDuration = parseDurationString(fileName);
  if (fnDuration) {
    printHours = fnDuration.hours;
    printMinutes = fnDuration.minutes;
  }

  // Scan header and footer lines
  const lines = content.split(/\r?\n/);
  let filamentWeightsList: number[] = [];
  let filamentTypesList: string[] = [];
  let filamentColorsList: string[] = [];

  for (const line of lines) {
    if (!line.startsWith(';')) continue;

    // PrusaSlicer / Bambu / Orca filament used [g] = 12.4, 8.2
    const filGramsMatch = line.match(/^;\s*filament used \[g\]\s*=\s*(.+)$/i);
    if (filGramsMatch) {
      filamentWeightsList = filGramsMatch[1]
        .split(',')
        .map((v) => parseFloat(v.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    }

    const totalGramsMatch = line.match(/^;\s*total filament used \[g\]\s*=\s*([\d.]+)/i);
    if (totalGramsMatch) {
      const val = parseFloat(totalGramsMatch[1]);
      if (Number.isFinite(val) && val > 0) {
        totalModelGrams = val;
      }
    }

    const wipeTowerMatch = line.match(
      /^;\s*total filament used for wipe tower \[g\]\s*=\s*([\d.]+)/i
    );
    if (wipeTowerMatch) {
      const val = parseFloat(wipeTowerMatch[1]);
      if (Number.isFinite(val) && val > 0) {
        totalPurgeGrams += val;
      }
    }

    // Estimated printing time
    const timeMatch = line.match(
      /^;\s*(?:estimated printing time|model printing time|total estimated time).*=\s*(.+)$/i
    );
    if (timeMatch) {
      const parsed = parseDurationString(timeMatch[1]);
      if (parsed) {
        printHours = parsed.hours;
        printMinutes = parsed.minutes;
      }
    }

    // Cura ;TIME:14520
    const curaTimeMatch = line.match(/^;TIME:(\d+)/i);
    if (curaTimeMatch && printHours === 0 && printMinutes === 0) {
      const totalSecs = parseInt(curaTimeMatch[1], 10);
      if (totalSecs > 0) {
        const totalMins = Math.round(totalSecs / 60);
        printHours = Math.floor(totalMins / 60);
        printMinutes = totalMins % 60;
      }
    }

    const typeMatch = line.match(/^;\s*filament_type\s*=\s*(.+)$/i);
    if (typeMatch) {
      filamentTypesList = typeMatch[1].split(/[;,]/).map((s) => s.replace(/["']/g, '').trim());
    }

    const colorMatch = line.match(/^;\s*(?:filament_colour|extruder_colour)\s*=\s*(.+)$/i);
    if (colorMatch) {
      filamentColorsList = colorMatch[1].split(/[;,]/).map((s) => s.replace(/["']/g, '').trim());
    }
  }

  if (filamentWeightsList.length > 0) {
    const sumWeights = filamentWeightsList.reduce((a, b) => a + b, 0);
    if (totalModelGrams === 0) {
      totalModelGrams = Math.max(0, sumWeights - totalPurgeGrams);
    } else if (totalPurgeGrams > 0 && totalModelGrams >= sumWeights) {
      totalModelGrams = Math.max(0, sumWeights - totalPurgeGrams);
    }

    filamentWeightsList.forEach((grams, idx) => {
      filaments.push({
        slotIndex: idx + 1,
        material: normalizeMaterial(filamentTypesList[idx]),
        colorHex: filamentColorsList[idx] || '#10B981',
        usedGrams: Number(grams.toFixed(1)),
      });
    });
  } else if (totalModelGrams > 0) {
    filaments.push({
      slotIndex: 1,
      material: normalizeMaterial(filamentTypesList[0]),
      colorHex: filamentColorsList[0] || '#10B981',
      usedGrams: Number(totalModelGrams.toFixed(1)),
    });
  }

  return {
    sourceType: 'gcode',
    fileName,
    productNameSuggestion: cleanProductName(fileName),
    printHours,
    printMinutes,
    totalModelGrams: Number(totalModelGrams.toFixed(1)),
    totalSupportGrams: 0,
    totalPurgeGrams: Number(totalPurgeGrams.toFixed(1)),
    objectCount: 1,
    filaments,
    summaryNote: `Parsed G-code: ${totalModelGrams.toFixed(1)}g filament, ${printHours}h ${printMinutes}m print time.`,
  };
}

/**
 * Computes signed 3D mesh volume in cm³ from XML `<vertices>` and `<triangles>` inside a `.3mf` model file.
 */
function calculate3mfModelVolumeCm3(xmlContent: string): { volumeCm3: number; objectCount: number } {
  let totalVolumeMm3 = 0;
  let meshCount = 0;

  const meshRegex = /<mesh>([\s\S]*?)<\/mesh>/gi;
  let meshMatch: RegExpExecArray | null;

  while ((meshMatch = meshRegex.exec(xmlContent)) !== null) {
    meshCount++;
    const meshXml = meshMatch[1];
    const vertices: Array<[number, number, number]> = [];

    const vertexRegex = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/gi;
    let vMatch: RegExpExecArray | null;
    while ((vMatch = vertexRegex.exec(meshXml)) !== null) {
      vertices.push([
        parseFloat(vMatch[1]) || 0,
        parseFloat(vMatch[2]) || 0,
        parseFloat(vMatch[3]) || 0,
      ]);
    }

    let signedVol6 = 0;
    const triRegex = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/gi;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = triRegex.exec(meshXml)) !== null) {
      const p1 = vertices[parseInt(tMatch[1], 10)];
      const p2 = vertices[parseInt(tMatch[2], 10)];
      const p3 = vertices[parseInt(tMatch[3], 10)];
      if (!p1 || !p2 || !p3) continue;

      signedVol6 +=
        p1[0] * (p2[1] * p3[2] - p2[2] * p3[1]) +
        p1[1] * (p2[2] * p3[0] - p2[0] * p3[2]) +
        p1[2] * (p2[0] * p3[1] - p2[1] * p3[0]);
    }

    totalVolumeMm3 += Math.abs(signedVol6) / 6.0;
  }

  return {
    volumeCm3: totalVolumeMm3 / 1000.0,
    objectCount: Math.max(1, meshCount),
  };
}

export function parse3mfArchive(bytes: Uint8Array, fileName = 'project.3mf'): ParsedSlicerResult {
  const unzipped = unzipSync(bytes);
  const filaments: ParsedSlicerFilament[] = [];

  // 1. Check if sliced metadata exists in Metadata/slice_info.config (Bambu Studio / OrcaSlicer)
  const sliceInfoBytes = unzipped['Metadata/slice_info.config'];
  if (sliceInfoBytes) {
    const sliceXml = strFromU8(sliceInfoBytes);
    const predMatch = sliceXml.match(/<metadata\s+key="prediction"\s+value="(\d+)"/i);
    const weightMatch = sliceXml.match(/<metadata\s+key="weight"\s+value="([\d.]+)"/i);

    let printHours = 0;
    let printMinutes = 0;
    if (predMatch) {
      const secs = parseInt(predMatch[1], 10);
      const mins = Math.round(secs / 60);
      printHours = Math.floor(mins / 60);
      printMinutes = mins % 60;
    }

    const filRegex =
      /<filament\s+[^>]*?type="([^"]*)"[^>]*?color="([^"]*)"[^>]*?used_g="([\d.]+)"/gi;
    let fMatch: RegExpExecArray | null;
    let slotIdx = 1;
    let sumGrams = 0;

    while ((fMatch = filRegex.exec(sliceXml)) !== null) {
      const g = parseFloat(fMatch[3]) || 0;
      if (g > 0) {
        sumGrams += g;
        filaments.push({
          slotIndex: slotIdx++,
          material: normalizeMaterial(fMatch[1]),
          colorHex: fMatch[2] || '#10B981',
          usedGrams: Number(g.toFixed(1)),
        });
      }
    }

    const totalGrams =
      sumGrams > 0 ? sumGrams : weightMatch ? parseFloat(weightMatch[1]) || 0 : 0;

    if (totalGrams > 0 || printHours > 0 || printMinutes > 0) {
      // Estimate multicolor flush if multiple filaments are present
      const estimatedPurge =
        filaments.length > 1 ? Number((totalGrams * 0.22).toFixed(1)) : 0;
      const modelGrams = Number(Math.max(1, totalGrams - estimatedPurge).toFixed(1));

      return {
        sourceType: '3mf-sliced',
        fileName,
        productNameSuggestion: cleanProductName(fileName),
        printHours,
        printMinutes,
        totalModelGrams: modelGrams,
        totalSupportGrams: 0,
        totalPurgeGrams: estimatedPurge,
        objectCount: 1,
        filaments,
        summaryNote: `Parsed sliced .3mf: ${totalGrams.toFixed(1)}g across ${Math.max(1, filaments.length)} color(s), ${printHours}h ${printMinutes}m.`,
      };
    }
  }

  // 2. Check project_settings.config for AMS colors / filament types even in unsliced .3mf
  let projectColors: string[] = [];
  let projectTypes: string[] = [];
  const projSettingsBytes = unzipped['Metadata/project_settings.config'];
  if (projSettingsBytes) {
    try {
      const projJson = JSON.parse(strFromU8(projSettingsBytes));
      if (Array.isArray(projJson.filament_colour)) {
        projectColors = projJson.filament_colour;
      }
      if (Array.isArray(projJson.filament_type)) {
        projectTypes = projJson.filament_type;
      }
    } catch {
      // ignore non-JSON config
    }
  }

  // 3. Compute exact 3D mesh volume from 3D/*.model files
  let totalVolumeCm3 = 0;
  let totalObjects = 0;
  for (const [path, fileBytes] of Object.entries(unzipped)) {
    if (path.endsWith('.model')) {
      const xml = strFromU8(fileBytes);
      const { volumeCm3, objectCount } = calculate3mfModelVolumeCm3(xml);
      totalVolumeCm3 += volumeCm3;
      totalObjects += objectCount;
    }
  }

  // Standard 3D print effective density (2 walls + 15% gyroid infill ≈ 38% effective solid volume * 1.24 g/cm³ PLA)
  const effectiveGrams = Math.max(2, Number((totalVolumeCm3 * 0.46).toFixed(1)));
  // Average modern high-speed printer rate ~ 18g/hour for single color, 11g/hour for multicolor
  const isMulticolor = projectColors.length > 1 || /ams|multicolor|color/i.test(fileName);
  const estPurgeGrams = isMulticolor ? Number((effectiveGrams * 0.35).toFixed(1)) : 0;
  const estTotalMinutes = Math.max(
    12,
    Math.round(((effectiveGrams + estPurgeGrams) / (isMulticolor ? 11 : 18)) * 60)
  );

  if (isMulticolor && projectColors.length > 1) {
    const slotsCount = Math.min(4, projectColors.length);
    const perSlot = Number((effectiveGrams / slotsCount).toFixed(1));
    for (let i = 0; i < slotsCount; i++) {
      filaments.push({
        slotIndex: i + 1,
        material: normalizeMaterial(projectTypes[i]),
        colorHex: projectColors[i] || '#10B981',
        usedGrams: perSlot,
      });
    }
  } else {
    filaments.push({
      slotIndex: 1,
      material: normalizeMaterial(projectTypes[0]),
      colorHex: projectColors[0] || '#10B981',
      usedGrams: effectiveGrams,
    });
  }

  return {
    sourceType: '3mf-mesh',
    fileName,
    productNameSuggestion: cleanProductName(fileName),
    printHours: Math.floor(estTotalMinutes / 60),
    printMinutes: estTotalMinutes % 60,
    totalModelGrams: effectiveGrams,
    totalSupportGrams: 0,
    totalPurgeGrams: estPurgeGrams,
    objectCount: Math.max(1, totalObjects),
    filaments,
    summaryNote: `Analyzed 3D geometry (${totalVolumeCm3.toFixed(1)} cm³ solid volume): ~${effectiveGrams}g model${estPurgeGrams > 0 ? ` + ~${estPurgeGrams}g AMS purge` : ''}.`,
  };
}

/**
 * Parses text extracted from a slicer preview screenshot or pasted summary
 * (e.g. Bambu Studio / OrcaSlicer / PrusaSlicer table).
 */
export function parseSlicerPreviewText(rawText: string): ParsedSlicerResult {
  let modelGrams = 0;
  let supportGrams = 0;
  let purgeGrams = 0;
  let totalGrams = 0;

  const modelMatch = rawText.match(/(?:model|part|object)\s*[:=-]?\s*([\d.]+)\s*g/i);
  if (modelMatch) modelGrams = parseFloat(modelMatch[1]) || 0;

  const supportMatch = rawText.match(/(?:support)\s*[:=-]?\s*([\d.]+)\s*g/i);
  if (supportMatch) supportGrams = parseFloat(supportMatch[1]) || 0;

  const purgeMatch = rawText.match(
    /(?:flush|flushed|purge|poop|wipe\s*tower|prime\s*tower)\s*[:=-]?\s*([\d.]+)\s*g/i
  );
  if (purgeMatch) purgeGrams = parseFloat(purgeMatch[1]) || 0;

  const totalMatch = rawText.match(/(?:total\s*filament|total\s*weight|total)\s*[:=-]?\s*([\d.]+)\s*g/i);
  if (totalMatch) totalGrams = parseFloat(totalMatch[1]) || 0;

  if (modelGrams === 0 && totalGrams > 0) {
    modelGrams = Math.max(0, totalGrams - supportGrams - purgeGrams);
  } else if (modelGrams === 0) {
    // Fallback: sum all Xg mentions if labeled fields aren't present
    const allGrams = [...rawText.matchAll(/(\d+(?:\.\d+)?)\s*g\b/gi)].map((m) =>
      parseFloat(m[1])
    );
    if (allGrams.length === 1) {
      modelGrams = allGrams[0];
    } else if (allGrams.length >= 2) {
      modelGrams = allGrams[0];
      purgeGrams = allGrams[1];
    }
  }

  const duration = parseDurationString(rawText) || { hours: 1, minutes: 30 };

  return {
    sourceType: 'slicer-text',
    fileName: 'Slicer Scan',
    productNameSuggestion: 'Scanned Slicer Job',
    printHours: duration.hours,
    printMinutes: duration.minutes,
    totalModelGrams: Number(modelGrams.toFixed(1)),
    totalSupportGrams: Number(supportGrams.toFixed(1)),
    totalPurgeGrams: Number(purgeGrams.toFixed(1)),
    objectCount: 1,
    filaments: [
      {
        slotIndex: 1,
        material: normalizeMaterial(rawText),
        colorHex: '#10B981',
        usedGrams: Number(modelGrams.toFixed(1)),
      },
    ],
    summaryNote: `Extracted from slicer scan: ${modelGrams.toFixed(1)}g model, ${purgeGrams.toFixed(1)}g flush/tower, ${duration.hours}h ${duration.minutes}m.`,
  };
}

