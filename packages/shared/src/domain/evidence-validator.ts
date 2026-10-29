import { ALLOWED_DOCUMENT_MIME_TYPES, BLOCKED_EXTENSIONS, MAX_DOCUMENT_SIZE_BYTES } from '../schemas/document.js';

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  code?: 'FILE_TOO_LARGE' | 'DISGUISED_EXECUTABLE' | 'BLOCKED_EXTENSION' | 'UNSUPPORTED_MIME' | 'CONTENT_TYPE_MISMATCH';
  detectedMime?: string;
}

/**
 * Sniffs binary magic bytes from the buffer header to detect actual content type.
 */
export function sniffMimeType(buffer: Uint8Array | { [index: number]: number; length: number }): string | null {
  if (!buffer || buffer.length < 4) return null;

  // Windows PE Executable (MZ)
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    return 'application/x-dosexec';
  }

  // ELF Executable
  if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    return 'application/x-executable';
  }

  // Shell script with shebang #!
  if (buffer[0] === 0x23 && buffer[1] === 0x21) {
    return 'text/x-shellscript';
  }

  // Java Bytecode class CAFEBABE
  if (buffer[0] === 0xCA && buffer[1] === 0xFE && buffer[2] === 0xBA && buffer[3] === 0xBE) {
    return 'application/java-vm';
  }

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // PNG: \x89PNG (0x89 0x50 0x4E 0x47)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: \xFF\xD8\xFF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // ZIP / DOCX / XLSX / JAR: PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'application/zip';
  }

  return null;
}

/**
 * Rigorously validates evidence file properties against size limits, extension blocklists,
 * and content sniffing to prevent executable spoofing (e.g. malicious.exe renamed to doc.pdf).
 */
export function validateEvidenceFile(params: {
  name: string;
  fileSize: number;
  declaredMimeType?: string;
  buffer?: Uint8Array | { [index: number]: number; length: number };
  maxSizeBytes?: number;
}): FileValidationResult {
  const { name, fileSize, declaredMimeType, buffer, maxSizeBytes = MAX_DOCUMENT_SIZE_BYTES } = params;

  // 1. File size check
  if (fileSize > maxSizeBytes) {
    return {
      isValid: false,
      code: 'FILE_TOO_LARGE',
      error: `File size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds maximum allowed limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`,
    };
  }

  // 2. Extension check
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot !== -1 ? name.substring(lastDot).toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.includes(ext as any)) {
    return {
      isValid: false,
      code: 'BLOCKED_EXTENSION',
      error: `Uploading executable, batch, or script files with extension "${ext}" is strictly forbidden.`,
    };
  }

  // 3. MIME allow-list check if declared
  if (declaredMimeType && declaredMimeType !== 'application/octet-stream') {
    const isAllowed = (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(declaredMimeType);
    if (!isAllowed) {
      return {
        isValid: false,
        code: 'UNSUPPORTED_MIME',
        error: `Declared MIME type "${declaredMimeType}" is not permitted for evidence attachments.`,
      };
    }
  }

  // 4. Content sniffing on binary buffer if available
  if (buffer && buffer.length >= 4) {
    const detected = sniffMimeType(buffer);

    // Immediate rejection of binary executables
    if (
      detected === 'application/x-dosexec' ||
      detected === 'application/x-executable' ||
      detected === 'application/java-vm' ||
      detected === 'text/x-shellscript'
    ) {
      return {
        isValid: false,
        code: 'DISGUISED_EXECUTABLE',
        detectedMime: detected,
        error: `Security violation: File contains executable binary signatures (${detected}) disguised as "${name}".`,
      };
    }

    // Specific format verification: if declared as PDF, must start with %PDF
    if (declaredMimeType === 'application/pdf' && detected && detected !== 'application/pdf') {
      return {
        isValid: false,
        code: 'CONTENT_TYPE_MISMATCH',
        detectedMime: detected,
        error: `Content mismatch: Declared as PDF, but binary header matches "${detected}".`,
      };
    }

    // If declared as PNG, must match PNG header
    if (declaredMimeType === 'image/png' && detected && detected !== 'image/png') {
      return {
        isValid: false,
        code: 'CONTENT_TYPE_MISMATCH',
        detectedMime: detected,
        error: `Content mismatch: Declared as PNG image, but header does not match PNG signature.`,
      };
    }

    // If declared as JPEG, must match JPEG header
    if ((declaredMimeType === 'image/jpeg' || declaredMimeType === 'image/jpg') && detected && detected !== 'image/jpeg') {
      return {
        isValid: false,
        code: 'CONTENT_TYPE_MISMATCH',
        detectedMime: detected,
        error: `Content mismatch: Declared as JPEG image, but header does not match JPEG signature.`,
      };
    }
  }

  return { isValid: true };
}
