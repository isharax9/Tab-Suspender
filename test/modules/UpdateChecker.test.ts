import '../lib/Chrome';
const { UpdateChecker } = require('../../modules/UpdateChecker');

describe('UpdateChecker', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		jest.clearAllMocks();
		(global as any).chrome.runtime.getManifest = jest.fn(() => ({ version: '2.1' }));
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	describe('compareVersions', () => {
		it('should return 1 when remote version is newer', () => {
			expect(UpdateChecker.compareVersions('2.2', '2.1')).toBe(1);
			expect(UpdateChecker.compareVersions('2.1.1', '2.1')).toBe(1);
			expect(UpdateChecker.compareVersions('3.0.0', '2.1')).toBe(1);
		});

		it('should return 0 when versions are equal', () => {
			expect(UpdateChecker.compareVersions('2.1', '2.1')).toBe(0);
			expect(UpdateChecker.compareVersions('2.1.0', '2.1')).toBe(0);
		});

		it('should return -1 when remote version is older', () => {
			expect(UpdateChecker.compareVersions('2.0.12', '2.1')).toBe(-1);
			expect(UpdateChecker.compareVersions('1.9.99', '2.1')).toBe(-1);
		});
	});

	describe('check()', () => {
		it('should detect when an update is available', async () => {
			const mockRelease = {
				tag_name: 'v2.2',
				name: 'Release v2.2',
				html_url: 'https://github.com/isharax9/Tab-Suspender/releases/tag/v2.2',
				published_at: '2026-10-05T00:00:00Z',
				body: 'New features and bug fixes',
				assets: [
					{
						name: 'tab-suspender-v2.2-unpacked.zip',
						browser_download_url: 'https://github.com/isharax9/Tab-Suspender/releases/download/v2.2/tab-suspender-v2.2-unpacked.zip'
					}
				]
			};

			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: jest.fn().mockResolvedValue(mockRelease)
			}) as any;

			const result = await UpdateChecker.check(true);

			expect(result.updateAvailable).toBe(true);
			expect(result.latestVersion).toBe('2.2');
			expect(result.currentVersion).toBe('2.1');
			expect(result.downloadUrl).toBe('https://github.com/isharax9/Tab-Suspender/releases/download/v2.2/tab-suspender-v2.2-unpacked.zip');
			expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'NEW' });
			expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#28a745' });
			expect(chrome.notifications.create).toHaveBeenCalled();
		});

		it('should detect when current version is already up to date', async () => {
			const mockRelease = {
				tag_name: 'v2.1',
				name: 'Release v2.1',
				html_url: 'https://github.com/isharax9/Tab-Suspender/releases/tag/v2.1',
				assets: []
			};

			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: jest.fn().mockResolvedValue(mockRelease)
			}) as any;

			const result = await UpdateChecker.check(true);

			expect(result.updateAvailable).toBe(false);
			expect(result.latestVersion).toBe('2.1');
			expect(result.currentVersion).toBe('2.1');
		});

		it('should handle fetch failure gracefully', async () => {
			global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

			const result = await UpdateChecker.check(true);

			expect(result.updateAvailable).toBe(false);
			expect(result.currentVersion).toBe('2.1');
		});
	});

	describe('init()', () => {
		it('should register alarms and notification listeners', () => {
			UpdateChecker.init();

			expect(chrome.alarms.create).toHaveBeenCalledWith(
				'checkTabSuspenderUpdates',
				expect.objectContaining({ periodInMinutes: 360 })
			);
			expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
			expect(chrome.notifications.onClicked.addListener).toHaveBeenCalled();
		});
	});
});
