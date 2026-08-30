import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type { MediaType, ImageMeta, VideoMeta, PdfMeta, TextMeta } from './scanner.js';

const execFileAsync = promisify(execFile);

export async function extractMetadata(
  filePath: string,
  type: MediaType,
): Promise<ImageMeta | VideoMeta | PdfMeta | TextMeta> {
  switch (type) {
    case 'image': return extractImageMetadata(filePath);
    case 'video': return extractVideoMetadata(filePath);
    case 'pdf':   return extractPdfMetadata(filePath);
    case 'text':  return extractTextMetadata(filePath);
  }
}

async function extractImageMetadata(filePath: string): Promise<ImageMeta> {
  try {
    // Dynamic import so sharp is not bundled by Vite at build time
    const sharp = (await import('sharp')).default;
    const info = await sharp(filePath).metadata();
    const meta: ImageMeta = {
      width: info.width,
      height: info.height,
    };

    // EXIF via exifr (supports JPEG, TIFF, HEIC)
    try {
      const exifr = (await import('exifr')).default;
      const exif = await exifr.parse(filePath, {
        pick: ['Make', 'Model', 'DateTimeOriginal', 'GPSLatitude', 'GPSLongitude', 'FNumber', 'ISO', 'ExposureTime'],
      });
      if (exif) meta.exif = exif as Record<string, unknown>;
    } catch {
      // EXIF not available for all image types
    }

    return meta;
  } catch {
    return {};
  }
}

async function extractVideoMetadata(filePath: string): Promise<VideoMeta> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ]);

    const data = JSON.parse(stdout) as {
      format?: { duration?: string; bit_rate?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        duration?: string;
      }>;
    };

    const videoStream = data.streams?.find((s) => s.codec_type === 'video');
    const duration = parseFloat(data.format?.duration || '0') || undefined;
    const bitrate = parseInt(data.format?.bit_rate || '0', 10) || undefined;

    return {
      duration,
      width: videoStream?.width,
      height: videoStream?.height,
      codec: videoStream?.codec_name,
      bitrate,
    };
  } catch {
    return {};
  }
}

async function extractPdfMetadata(filePath: string): Promise<PdfMeta> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [filePath]);
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    const pageCount = match ? parseInt(match[1], 10) : undefined;
    return { pageCount };
  } catch {
    return {};
  }
}

// Skip line-counting past this size — a multi-GB log dropped into the
// library shouldn't stall the scan; it's still browsable, just without a
// line count on the card.
const TEXT_METADATA_MAX_BYTES = 20 * 1024 * 1024;

async function extractTextMetadata(filePath: string): Promise<TextMeta> {
  try {
    const stats = await stat(filePath);
    if (stats.size > TEXT_METADATA_MAX_BYTES) return {};

    let lineCount = 0;
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const _line of rl) lineCount++;
    return { lineCount };
  } catch {
    return {};
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
