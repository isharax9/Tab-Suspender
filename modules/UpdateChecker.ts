'use strict';

/**
 * UpdateChecker
 * Checks GitHub Releases API for new versions of Tab Suspender (sideloaded/unpacked extension).
 */

interface UpdateInfo {
	updateAvailable: boolean;
	currentVersion: string;
	latestVersion: string;
	releaseName: string;
	releaseUrl: string;
	downloadUrl: string;
	publishedAt?: string;
	releaseNotes?: string;
	lastChecked: number;
}

const UPDATE_GITHUB_REPO = 'isharax9/Tab-Suspender';
const UPDATE_RELEASES_API_URL = `https://api.github.com/repos/${UPDATE_GITHUB_REPO}/releases/latest`;
const UPDATE_STORAGE_KEY_LATEST_RELEASE = 'latestReleaseInfo';
const UPDATE_STORAGE_KEY_LAST_NOTIFIED = 'lastNotifiedVersion';
const UPDATE_MIN_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour throttle for automatic checks

class UpdateChecker {
	private static checkPromise: Promise<UpdateInfo> | null = null;
	private static isInitialized = false;

	public static async getCachedInfo(): Promise<UpdateInfo | null> {
		try {
			if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
			const data = await chrome.storage.local.get(UPDATE_STORAGE_KEY_LATEST_RELEASE);
			return data[UPDATE_STORAGE_KEY_LATEST_RELEASE] || null;
		} catch (e) {
			console.error('UpdateChecker getCachedInfo error:', e);
			return null;
		}
	}

	public static async check(force = false): Promise<UpdateInfo> {
		if (UpdateChecker.checkPromise) {
			return UpdateChecker.checkPromise;
		}

		UpdateChecker.checkPromise = UpdateChecker.doCheck(force)
			.finally(() => {
				UpdateChecker.checkPromise = null;
			});

		return UpdateChecker.checkPromise;
	}

	private static async doCheck(force = false): Promise<UpdateInfo> {
		const currentVersion = typeof chrome !== 'undefined' && chrome.runtime?.getManifest
			? chrome.runtime.getManifest().version
			: '1.0.0';

		const cached = await UpdateChecker.getCachedInfo();
		const now = Date.now();

		if (!force && cached && (now - (cached.lastChecked || 0)) < UPDATE_MIN_CHECK_INTERVAL_MS) {
			return cached;
		}

		try {
			const response = await fetch(UPDATE_RELEASES_API_URL, {
				headers: {
					'Accept': 'application/vnd.github.v3+json'
				}
			});

			if (!response.ok) {
				throw new Error(`GitHub API responded with status ${response.status}`);
			}

			const release = await response.json();
			const tagName = (release.tag_name || '').trim();
			const cleanLatestVersion = tagName.replace(/^v/, '').trim();
			const releaseName = release.name || tagName || 'Latest Release';
			const releaseUrl = release.html_url || `https://github.com/${UPDATE_GITHUB_REPO}/releases/latest`;

			// Find unpacked zip asset or any zip asset
			let downloadUrl = releaseUrl;
			if (Array.isArray(release.assets)) {
				const zipAsset = release.assets.find((a: any) =>
					typeof a.name === 'string' && a.name.endsWith('.zip')
				);
				if (zipAsset && zipAsset.browser_download_url) {
					downloadUrl = zipAsset.browser_download_url;
				}
			}

			// Compare versions
			let updateAvailable = false;
			if (cleanLatestVersion && currentVersion) {
				updateAvailable = UpdateChecker.compareVersions(cleanLatestVersion, currentVersion) > 0;
			}

			const updateInfo: UpdateInfo = {
				updateAvailable,
				currentVersion,
				latestVersion: cleanLatestVersion || currentVersion,
				releaseName,
				releaseUrl,
				downloadUrl,
				publishedAt: release.published_at,
				releaseNotes: release.body || '',
				lastChecked: now
			};

			// Save to storage
			if (typeof chrome !== 'undefined' && chrome.storage?.local) {
				await chrome.storage.local.set({ [UPDATE_STORAGE_KEY_LATEST_RELEASE]: updateInfo });
			}

			// Update extension badge & send notification if update available
			if (typeof chrome !== 'undefined') {
				if (updateAvailable) {
					await UpdateChecker.applyUpdateBadge(cleanLatestVersion);
					await UpdateChecker.notifyUser(cleanLatestVersion, downloadUrl || releaseUrl);
				} else {
					await UpdateChecker.clearUpdateBadge();
				}
			}

			return updateInfo;
		} catch (error) {
			console.error('UpdateChecker failed to check for updates:', error);
			if (cached) {
				return cached;
			}
			return {
				updateAvailable: false,
				currentVersion,
				latestVersion: currentVersion,
				releaseName: '',
				releaseUrl: `https://github.com/${UPDATE_GITHUB_REPO}/releases`,
				downloadUrl: `https://github.com/${UPDATE_GITHUB_REPO}/releases`,
				lastChecked: now
			};
		}
	}

	public static compareVersions(v1: string, v2: string): number {
		const v1Parts = v1.split('.').map(Number);
		const v2Parts = v2.split('.').map(Number);
		const maxLen = Math.max(v1Parts.length, v2Parts.length);

		for (let i = 0; i < maxLen; i++) {
			const p1 = v1Parts[i] || 0;
			const p2 = v2Parts[i] || 0;
			if (p1 > p2) return 1;
			if (p1 < p2) return -1;
		}
		return 0;
	}

	public static async applyUpdateBadge(version: string) {
		try {
			if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
				await chrome.action.setBadgeText({ text: 'NEW' });
				if (chrome.action.setBadgeBackgroundColor) {
					await chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
				}
				if (chrome.action.setTitle) {
					await chrome.action.setTitle({ title: `Tab Suspender: New version v${version} available!` });
				}
			}
		} catch (e) {
			console.error('Failed to set update badge:', e);
		}
	}

	public static async clearUpdateBadge() {
		try {
			if (typeof chrome !== 'undefined' && chrome.action?.getBadgeText && chrome.action?.setBadgeText) {
				const badge = await chrome.action.getBadgeText({});
				if (badge === 'NEW') {
					await chrome.action.setBadgeText({ text: '' });
				}
			}
		} catch (e) {
			console.error('Failed to clear update badge:', e);
		}
	}

	private static async notifyUser(version: string, targetUrl: string) {
		try {
			if (typeof chrome === 'undefined' || !chrome.notifications?.create) return;

			const data = await chrome.storage.local.get(UPDATE_STORAGE_KEY_LAST_NOTIFIED);
			if (data[UPDATE_STORAGE_KEY_LAST_NOTIFIED] === version) {
				return; // Already notified user about this specific version
			}

			chrome.notifications.create('ts-update-' + version, {
				type: 'basic',
				iconUrl: chrome.runtime.getURL('img/icon128.png'),
				title: 'Tab Suspender Update Available',
				message: `Version v${version} is now available! Click here to download.`,
				priority: 1
			});

			await chrome.storage.local.set({ [UPDATE_STORAGE_KEY_LAST_NOTIFIED]: version });
		} catch (e) {
			console.error('Failed to create update notification:', e);
		}
	}

	public static init() {
		if (UpdateChecker.isInitialized) return;
		UpdateChecker.isInitialized = true;

		// Listen for notification clicks
		if (typeof chrome !== 'undefined' && chrome.notifications?.onClicked) {
			chrome.notifications.onClicked.addListener((notificationId) => {
				if (notificationId.startsWith('ts-update-')) {
					void UpdateChecker.getCachedInfo().then((info) => {
						const url = info?.downloadUrl || info?.releaseUrl || `https://github.com/${UPDATE_GITHUB_REPO}/releases/latest`;
						chrome.tabs.create({ url });
					});
				}
			});
		}

		// Set up alarm for periodic background checks
		if (typeof chrome !== 'undefined' && chrome.alarms) {
			try {
				chrome.alarms.create('checkTabSuspenderUpdates', {
					periodInMinutes: 360 // Check every 6 hours
				});
				chrome.alarms.onAlarm.addListener((alarm) => {
					if (alarm.name === 'checkTabSuspenderUpdates') {
						void UpdateChecker.check(false);
					}
				});
			} catch (e) {
				console.error('Failed to register alarm for update check:', e);
			}
		}

		// Check if a badge should be restored from cached update
		void UpdateChecker.getCachedInfo().then((cached) => {
			if (cached && cached.updateAvailable) {
				void UpdateChecker.applyUpdateBadge(cached.latestVersion);
			}
		});

		// Trigger check on startup after initial grace period
		setTimeout(() => {
			void UpdateChecker.check(false);
		}, 10000);
	}
}

// @ts-ignore
if (typeof global !== 'undefined') global.UpdateChecker = UpdateChecker;
// @ts-ignore
if (typeof globalThis !== 'undefined') globalThis.UpdateChecker = UpdateChecker;
// @ts-ignore
if (typeof window !== 'undefined') window.UpdateChecker = UpdateChecker;
// @ts-ignore
if (typeof module !== 'undefined' && module.exports) module.exports = { UpdateChecker };
