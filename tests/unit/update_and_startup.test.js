import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { UpdateManager, UntrustedUpdateError } from '../../app/core/update-manager.js';
import { LifecycleManager } from '../../app/main/lifecycle.js';

describe('Phase 12: Production Packaging, Updates & Startup Subsystems', () => {
  let tempDir;
  let updateManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veoflow-update-test-'));
    updateManager = new UpdateManager({
      currentVersion: '1.0.0'
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    vi.restoreAllMocks();
  });

  describe('Task 4: Secure Update Verification', () => {
    it('compares semantic versions accurately', () => {
      expect(updateManager.compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(updateManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(updateManager.compareVersions('0.9.9', '1.0.0')).toBe(-1);
      expect(updateManager.compareVersions('2.0.0-rc1', '1.9.9')).toBe(1);
    });

    it('computes exact SHA-256 digest of update package', async () => {
      const testFile = path.join(tempDir, 'dummy_installer.exe');
      const payload = Buffer.from('VeoFlow binary release test payload bytes');
      fs.writeFileSync(testFile, payload);

      const expectedDigest = crypto.createHash('sha256').update(payload).digest('hex');
      const calculated = await updateManager.calculateSha256(testFile);

      expect(calculated).toBe(expectedDigest);
    });

    it('approves update package when SHA-256 checksum matches manifest exactly', async () => {
      const testFile = path.join(tempDir, 'verified_installer.exe');
      const payload = Buffer.from('Authentic signed VeoFlow installer package');
      fs.writeFileSync(testFile, payload);

      const validDigest = crypto.createHash('sha256').update(payload).digest('hex');
      const isVerified = await updateManager.verifyChecksum(testFile, validDigest);

      expect(isVerified).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);
    });

    it('strictly rejects and unlinks corrupt or tampered update packages (Never install unverified updates)', async () => {
      const testFile = path.join(tempDir, 'tampered_installer.exe');
      fs.writeFileSync(testFile, 'Altered malicious or corrupted package contents');

      const legitDigest = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // Hash of empty string

      await expect(
        updateManager.verifyChecksum(testFile, legitDigest)
      ).rejects.toThrow(UntrustedUpdateError);

      // Security requirement: Tampered file must be immediately deleted from disk
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('queries release manifest and identifies update availability', async () => {
      const mockManifest = {
        tag_name: 'v1.1.0',
        body: 'New voice shortcuts and performance enhancements',
        downloadUrl: 'https://example.com/VeoFlow-Setup-1.1.0.exe',
        sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0'
      };

      const result = await updateManager.checkForUpdates(mockManifest);
      expect(result.hasUpdate).toBe(true);
      expect(result.latestVersion).toBe('1.1.0');
      expect(result.downloadUrl).toBe(mockManifest.downloadUrl);
    });

    it('creates pre-update rollback snapshot using database backup', () => {
      const mockDb = {
        backupDatabase: vi.fn().mockReturnValue('C:\\Users\\User\\.veoflow\\backups\\pre_update.sqlite')
      };

      const backupPath = updateManager.prepareRollbackRecovery(mockDb);
      expect(backupPath).toBe('C:\\Users\\User\\.veoflow\\backups\\pre_update.sqlite');
      expect(mockDb.backupDatabase).toHaveBeenCalled();
    });
  });

  describe('Task 5: Windows Startup Management', () => {
    it('executes syncLaunchOnStartup without crashing in development mode', () => {
      const lifecycle = new LifecycleManager({ createSettingsWindow: vi.fn() });
      expect(() => lifecycle.syncLaunchOnStartup(true)).not.toThrow();
      expect(() => lifecycle.syncLaunchOnStartup(false)).not.toThrow();
    });
  });
});

