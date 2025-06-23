# VineHelper Testing Guide

## Overview

This guide provides comprehensive documentation for testing VineHelper, covering unit tests, integration tests, browser-specific testing, and end-to-end testing strategies.

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [Browser Testing](#browser-testing)
5. [End-to-End Testing](#end-to-end-testing)
6. [Code Coverage](#code-coverage)
7. [Performance Testing](#performance-testing)
8. [Debugging Tests](#debugging-tests)

## Testing Philosophy

VineHelper follows these testing principles:

- **Test behavior, not implementation** - Tests should verify what the code does, not how it does it
- **Isolation** - Unit tests should test components in isolation using mocks
- **Real-world scenarios** - Integration tests should simulate actual usage patterns
- **Browser compatibility** - Test across all supported browsers
- **Performance awareness** - Include performance benchmarks for critical paths

## Unit Testing

### Setup and Configuration

VineHelper uses Jest for unit testing. The configuration is in `jest.config.js`:

```javascript
module.exports = {
	testEnvironment: "jsdom",
	setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
	moduleNameMapper: {
		"^/scripts/(.*)$": "<rootDir>/scripts/$1",
	},
	collectCoverageFrom: [
		"scripts/**/*.js",
		"!scripts/**/*.test.js",
		"!scripts/bootloader*.js", // Difficult to test in isolation
	],
};
```

### Mocking Browser APIs

Browser extension APIs need to be mocked for testing:

```javascript
// tests/mocks/chrome.js
global.chrome = {
	runtime: {
		getManifest: jest.fn(() => ({ version: "1.0.0" })),
		sendMessage: jest.fn(),
		onMessage: {
			addListener: jest.fn(),
			removeListener: jest.fn(),
		},
	},
	storage: {
		local: {
			get: jest.fn((keys, callback) => callback({})),
			set: jest.fn((items, callback) => callback?.()),
			remove: jest.fn((keys, callback) => callback?.()),
		},
		onChanged: {
			addListener: jest.fn(),
			removeListener: jest.fn(),
		},
	},
};
```

### Testing DI Components

Example test for a service using dependency injection:

```javascript
// tests/infrastructure/SettingsMgrDI.test.js
import { SettingsMgrDI } from "/scripts/core/services/SettingsMgrDI.js";
import { MemoryStorageAdapter } from "/scripts/infrastructure/StorageAdapter.js";

describe("SettingsMgrDI", () => {
	let settingsMgr;
	let storageAdapter;

	beforeEach(() => {
		storageAdapter = new MemoryStorageAdapter();
		settingsMgr = new SettingsMgrDI(storageAdapter);
	});

	test("should get default value when key not exists", async () => {
		const value = await settingsMgr.get("nonexistent", "default");
		expect(value).toBe("default");
	});

	test("should store and retrieve settings", async () => {
		await settingsMgr.set("test.key", "test value");
		const value = await settingsMgr.get("test.key");
		expect(value).toBe("test value");
	});

	test("should maintain stable array references", async () => {
		const keywords = ["test1", "test2"];
		await settingsMgr.set("keywords", keywords);

		const ref1 = await settingsMgr.get("keywords");
		const ref2 = await settingsMgr.get("keywords");

		expect(ref1).toBe(ref2); // Same reference
	});
});
```

### Testing Stream Processing

```javascript
// tests/notifications-monitor/stream/NewItemStreamProcessing.test.js
import { dataStream } from "/scripts/notifications-monitor/stream/NewItemStreamProcessing.js";

describe("NewItemStreamProcessing", () => {
	test("should filter hidden items", (done) => {
		const mockItem = {
			asin: "TEST123",
			title: "Test Item",
			hidden: true,
		};

		dataStream.output((data) => {
			// Should not reach here for hidden items
			done.fail("Hidden item was not filtered");
		});

		dataStream.input(mockItem);

		// Give time for async processing
		setTimeout(() => done(), 100);
	});

	test("should transform items with keywords", (done) => {
		const mockItem = {
			asin: "TEST123",
			title: "Special Keyword Item",
			hidden: false,
		};

		dataStream.output((data) => {
			expect(data.highlighted).toBe(true);
			done();
		});

		dataStream.input(mockItem);
	});
});
```

### Testing Memory Management

```javascript
// tests/notifications-monitor/services/ItemsMgr.test.js
describe("ItemsMgr Memory Management", () => {
	test("should use WeakMap for DOM references", () => {
		const itemsMgr = new ItemsMgr(mockSettings);
		const element = document.createElement("div");

		itemsMgr.addItem("TEST123", mockItem, element);

		// Verify WeakMap usage
		expect(itemsMgr.domElements.has(element)).toBe(true);

		// Simulate element removal
		element.remove();

		// WeakMap should allow garbage collection
		// (actual GC testing requires memory profiling)
	});

	test("should cleanup references on removeAsin", () => {
		const itemsMgr = new ItemsMgr(mockSettings);
		const element = document.createElement("div");

		itemsMgr.addItem("TEST123", mockItem, element);
		itemsMgr.removeAsin("TEST123");

		expect(itemsMgr.items.has("TEST123")).toBe(false);
		expect(itemsMgr.domElements.has(element)).toBe(false);
	});
});
```

## Integration Testing

### Testing Master/Slave Coordination

```javascript
// tests/integration/MasterSlaveCoordination.test.js
describe("Master/Slave Coordination", () => {
	let master, slave1, slave2;
	let broadcastChannel;

	beforeEach(() => {
		// Mock BroadcastChannel
		broadcastChannel = new MockBroadcastChannel("vinehelper");

		master = new NotificationMonitor({ isMaster: true });
		slave1 = new NotificationMonitor({ isMaster: false });
		slave2 = new NotificationMonitor({ isMaster: false });
	});

	test("should elect new master when current master disconnects", async () => {
		// Simulate master disconnect
		master.destroy();

		// Wait for election timeout (2 seconds)
		await new Promise((resolve) => setTimeout(resolve, 2100));

		// One slave should become master
		const newMasterCount = [slave1, slave2].filter((s) => s.isMaster).length;

		expect(newMasterCount).toBe(1);
	});

	test("should relay items from master to slaves", (done) => {
		const testItem = { asin: "TEST123", title: "Test" };

		slave1.on("newItem", (item) => {
			expect(item).toEqual(testItem);
			done();
		});

		// Master receives and broadcasts item
		master.processNewItem(testItem);
	});
});
```

### Testing WebSocket Communication

```javascript
// tests/integration/WebSocketIntegration.test.js
import { io } from "socket.io-client";
import { Websocket } from "/scripts/notifications-monitor/stream/Websocket.js";

jest.mock("socket.io-client");

describe("WebSocket Integration", () => {
	let mockSocket;
	let websocket;

	beforeEach(() => {
		mockSocket = {
			connected: false,
			on: jest.fn(),
			emit: jest.fn(),
			disconnect: jest.fn(),
			removeAllListeners: jest.fn(),
		};

		io.mockReturnValue(mockSocket);
		websocket = new Websocket(mockMonitor);
	});

	test("should handle connection lifecycle", () => {
		// Simulate connection
		mockSocket.connected = true;
		mockSocket.on.mock.calls.find(([event]) => event === "connect")[1]();

		expect(mockMonitor._channel.postMessage).toHaveBeenCalledWith({ type: "wsStatus", status: "wsConnected" });
	});

	test("should request last 100 items on connect", () => {
		mockSocket.connected = true;

		websocket.processMessage({ type: "fetchLatestItems" });

		expect(mockSocket.emit).toHaveBeenCalledWith(
			"getLast100",
			expect.objectContaining({
				limit: 100,
				countryCode: expect.any(String),
			})
		);
	});
});
```

## Browser Testing

### Chrome Extension Testing

```javascript
// tests/browser/chrome/extension.test.js
const puppeteer = require("puppeteer");
const path = require("path");

describe("Chrome Extension", () => {
	let browser;
	let page;

	beforeAll(async () => {
		const extensionPath = path.join(__dirname, "../../../");

		browser = await puppeteer.launch({
			headless: false,
			args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
		});
	});

	afterAll(async () => {
		await browser.close();
	});

	test("should inject content script on Vine pages", async () => {
		page = await browser.newPage();
		await page.goto("https://www.amazon.com/vine/vine-items");

		// Check if VineHelper UI elements are injected
		const toolbar = await page.$(".vh-toolbar");
		expect(toolbar).toBeTruthy();
	});

	test("should open settings page", async () => {
		// Get extension ID
		const targets = await browser.targets();
		const extensionTarget = targets.find((target) => target.type() === "background_page");
		const extensionId = extensionTarget.url().split("/")[2];

		// Open settings
		await page.goto(`chrome-extension://${extensionId}/page/settings.html`);

		const title = await page.title();
		expect(title).toContain("VineHelper Settings");
	});
});
```

### Firefox Add-on Testing

```javascript
// tests/browser/firefox/addon.test.js
const { Builder, By, until } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");

describe("Firefox Add-on", () => {
	let driver;

	beforeAll(async () => {
		const options = new firefox.Options();
		options.addExtensions(path.join(__dirname, "../../../vinehelper.xpi"));

		driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).build();
	});

	afterAll(async () => {
		await driver.quit();
	});

	test("should work with Firefox containers", async () => {
		// Firefox-specific: test with container tabs
		await driver.get("https://www.amazon.com/vine/vine-items");

		// Verify extension works in container
		const toolbar = await driver.findElement(By.className("vh-toolbar"));
		expect(await toolbar.isDisplayed()).toBe(true);
	});
});
```

### Cross-Browser Compatibility Testing

```javascript
// tests/browser/compatibility.test.js
const browsers = ["chrome", "firefox", "safari"];

describe.each(browsers)("%s compatibility", (browserName) => {
	test("should support required APIs", async () => {
		const browser = await launchBrowser(browserName);
		const page = await browser.newPage();

		// Check API availability
		const hasAPIs = await page.evaluate(() => {
			return {
				broadcastChannel: typeof BroadcastChannel !== "undefined",
				weakMap: typeof WeakMap !== "undefined",
				mutationObserver: typeof MutationObserver !== "undefined",
				performance: typeof performance !== "undefined",
			};
		});

		expect(hasAPIs.weakMap).toBe(true);
		expect(hasAPIs.mutationObserver).toBe(true);

		// BroadcastChannel might not be available in all browsers
		if (browserName !== "safari") {
			expect(hasAPIs.broadcastChannel).toBe(true);
		}

		await browser.close();
	});
});
```

## End-to-End Testing

### User Workflow Testing

```javascript
// tests/e2e/userWorkflows.test.js
describe("User Workflows", () => {
	test("complete item ordering workflow", async () => {
		// 1. Navigate to Vine page
		await page.goto("https://www.amazon.com/vine/vine-items");

		// 2. Wait for VineHelper to load
		await page.waitForSelector(".vh-toolbar");

		// 3. Search for item
		await page.type("#vh-search", "electronics");
		await page.keyboard.press("Enter");

		// 4. Click on item
		const item = await page.$(".vvp-item-tile:first-child");
		await item.click();

		// 5. Order item
		const orderButton = await page.$(".vh-order-button");
		await orderButton.click();

		// 6. Verify order success
		await page.waitForSelector(".vh-order-success", { timeout: 5000 });

		// 7. Check order count updated
		const orderCount = await page.$eval(".vh-order-count", (el) => el.textContent);
		expect(parseInt(orderCount)).toBeGreaterThan(0);
	});

	test("notification monitor workflow", async () => {
		// 1. Open notification monitor
		await page.goto("chrome-extension://[id]/page/notification_monitor.html");

		// 2. Wait for WebSocket connection
		await page.waitForSelector(".vh-connection-status.connected");

		// 3. Simulate new item notification
		await page.evaluate(() => {
			window.postMessage(
				{
					type: "newItem",
					item: { asin: "TEST123", title: "Test Item" },
				},
				"*"
			);
		});

		// 4. Verify item appears
		await page.waitForSelector('[data-asin="TEST123"]');

		// 5. Test filtering
		await page.type("#vh-keyword-filter", "electronics");

		// 6. Verify filtering works
		const visibleItems = await page.$$('.vvp-item-tile:not([style*="display: none"])');
		expect(visibleItems.length).toBeGreaterThan(0);
	});
});
```

### Performance Testing

```javascript
// tests/e2e/performance.test.js
describe("Performance Benchmarks", () => {
	test("should process 300 items in under 2 seconds", async () => {
		const startTime = Date.now();

		// Generate test items
		const items = Array.from({ length: 300 }, (_, i) => ({
			asin: `TEST${i}`,
			title: `Test Item ${i}`,
			thumbnail: `https://example.com/img${i}.jpg`,
		}));

		// Process through stream
		for (const item of items) {
			dataStream.input(item);
		}

		// Wait for processing
		await new Promise((resolve) => {
			let processed = 0;
			dataStream.output(() => {
				processed++;
				if (processed === 300) resolve();
			});
		});

		const duration = Date.now() - startTime;
		expect(duration).toBeLessThan(2000);
	});

	test("memory usage should stay under 50MB for 1000 items", async () => {
		// Enable memory debugging
		await page.evaluate(() => {
			localStorage.setItem("vh_debug_memory", "true");
		});

		await page.reload();

		// Add 1000 items
		for (let i = 0; i < 1000; i++) {
			await page.evaluate((i) => {
				window.addTestItem({
					asin: `TEST${i}`,
					title: `Test Item ${i}`,
				});
			}, i);
		}

		// Check memory usage
		const memoryInfo = await page.evaluate(() => {
			return performance.memory;
		});

		const usedMB = memoryInfo.usedJSHeapSize / 1048576;
		expect(usedMB).toBeLessThan(50);
	});
});
```

## Code Coverage

### Running Coverage Reports

```bash
# Run tests with coverage
npm run test:coverage

# Generate HTML report
npm run coverage:report

# Check coverage thresholds
npm run coverage:check
```

### Coverage Requirements

```javascript
// jest.config.js
module.exports = {
	coverageThreshold: {
		global: {
			branches: 80,
			functions: 80,
			lines: 80,
			statements: 80,
		},
		"./scripts/core/": {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90,
		},
	},
};
```

### Interpreting Coverage Reports

- **Branches**: All conditional paths tested (if/else, switch, ternary)
- **Functions**: All functions called at least once
- **Lines**: All executable lines run
- **Statements**: All statements executed

Focus on:

1. Critical paths (notification processing, item management)
2. Error handling branches
3. Edge cases and boundary conditions

## Performance Testing

### Benchmarking Key Operations

```javascript
// tests/performance/benchmarks.test.js
describe("Performance Benchmarks", () => {
	test("keyword matching performance", () => {
		const keywords = Array.from({ length: 100 }, (_, i) => `keyword${i}`);
		const items = Array.from({ length: 1000 }, (_, i) => ({
			title: `Item with keyword${i % 100} in title`,
		}));

		const start = performance.now();

		items.forEach((item) => {
			keywords.some((keyword) => item.title.includes(keyword));
		});

		const duration = performance.now() - start;

		// Should complete in under 50ms
		expect(duration).toBeLessThan(50);
	});

	test("DOM manipulation performance", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		const start = performance.now();

		// Add 100 tiles
		for (let i = 0; i < 100; i++) {
			const tile = document.createElement("div");
			tile.className = "vvp-item-tile";
			tile.dataset.asin = `TEST${i}`;
			container.appendChild(tile);
		}

		// Batch visibility update
		const tiles = container.querySelectorAll(".vvp-item-tile");
		tiles.forEach((tile) => {
			tile.style.display = i % 2 === 0 ? "none" : "block";
		});

		const duration = performance.now() - start;

		// Should complete in under 100ms
		expect(duration).toBeLessThan(100);

		container.remove();
	});
});
```

## Debugging Tests

### Debugging Failing Tests

```javascript
// Enable verbose logging
DEBUG=* npm test

// Run single test file
npm test -- tests/specific.test.js

// Run tests matching pattern
npm test -- --testNamePattern="WebSocket"

// Debug in Chrome DevTools
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Common Test Issues

1. **Async timing issues**

    ```javascript
    // Bad
    test("async test", () => {
    	asyncOperation();
    	expect(result).toBe(true); // Might run before operation completes
    });

    // Good
    test("async test", async () => {
    	await asyncOperation();
    	expect(result).toBe(true);
    });
    ```

2. **Mock cleanup**

    ```javascript
    afterEach(() => {
    	jest.clearAllMocks();
    	jest.restoreAllMocks();
    });
    ```

3. **Browser API availability**

    ```javascript
    beforeEach(() => {
    	global.BroadcastChannel = MockBroadcastChannel;
    });

    afterEach(() => {
    	delete global.BroadcastChannel;
    });
    ```

## Best Practices

1. **Test file naming**: Use `.test.js` suffix
2. **Test organization**: Mirror source file structure
3. **Test data**: Use factories for consistent test data
4. **Assertions**: One logical assertion per test
5. **Mocking**: Mock external dependencies, not internal modules
6. **Performance**: Keep tests fast (< 100ms per test)
7. **Flaky tests**: Fix immediately or mark as skipped
8. **Documentation**: Document complex test setups

## Continuous Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
    test:
        runs-on: ubuntu-latest
        strategy:
            matrix:
                browser: [chrome, firefox]

        steps:
            - uses: actions/checkout@v2
            - uses: actions/setup-node@v2
            - run: npm ci
            - run: npm test
            - run: npm run test:browser:${{ matrix.browser }}
            - uses: codecov/codecov-action@v2
```
