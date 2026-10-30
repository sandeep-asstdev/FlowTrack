import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Repository Character Encoding & Anti-Mojibake Integrity', () => {
  const mojibakePatterns = [/ðŸ/g, /â€/g, /Ã[^\s]/g, /Â[^\s]/g];

  function scanDirectory(dir: string, fileList: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === 'ui-screenshots' ||
        entry.name.endsWith('.png') ||
        entry.name.endsWith('.docx') ||
        entry.name.endsWith('.ico')
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        scanDirectory(fullPath, fileList);
      } else if (/\.(tsx?|jsx?|html|css|json|md)$/.test(entry.name) && !entry.name.includes('no-mojibake.spec')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  it('ensures no source or documentation file contains mojibake sequences', () => {
    const rootDir = path.resolve(__dirname, '../../../../../');
    const filesToScan = scanDirectory(rootDir);
    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of mojibakePatterns) {
          if (pattern.test(lines[i])) {
            violations.push({
              file: path.relative(rootDir, filePath),
              line: i + 1,
              match: lines[i].trim(),
            });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('ensures phone input label does not rely on Windows-incompatible emoji flags', () => {
    const authModalPath = path.resolve(__dirname, 'AuthModal.tsx');
    const content = fs.readFileSync(authModalPath, 'utf-8');
    // Ensure no emoji flag or corrupted emoji remains
    expect(content).not.toContain('ðŸ');
    expect(content).not.toContain('🇮🇳');
  });
});
