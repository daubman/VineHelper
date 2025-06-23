# Browser Compatibility Guide

## Overview

VineHelper is designed to work across multiple browsers, but each browser has unique characteristics and limitations. This guide documents browser-specific requirements, known issues, and workarounds.

## Supported Browsers

### Primary Support

| Browser | Minimum Version | Status          | Notes                        |
| ------- | --------------- | --------------- | ---------------------------- |
| Chrome  | 90+             | ✅ Full Support | Primary development target   |
| Edge    | 90+             | ✅ Full Support | Chromium-based versions only |

### Secondary Support

| Browser | Minimum Version | Status             | Notes                   |
| ------- | --------------- | ------------------ | ----------------------- |
| Firefox | 89+             | ✅ Full Support    | Some API differences    |
| Safari  | 14+             | ⚠️ Limited Support | Performance limitations |
| Opera   | 76+             | ✅ Full Support    | Chromium-based          |
| Brave   | 1.25+           | ✅ Full Support    | Chromium-based          |

### Not Supported

- Internet Explorer (all versions)
- Edge Legacy (pre-Chromium)
- Safari < 14
- Mobile browsers (extension APIs not available)

## Feature Support Matrix

| Feature            | Chrome | Firefox | Safari | Edge |
| ------------------ | ------ | ------- | ------ | ---- |
| WebSocket          | ✅     | ✅      | ✅     | ✅   |
| BroadcastChannel   | ✅     | ✅      | ❌     | ✅   |
| Performance.memory | ✅     | ❌      | ❌     | ✅   |
| WeakMap/WeakSet    | ✅     | ✅      | ✅     | ✅   |
| MutationObserver   | ✅     | ✅      | ✅     | ✅   |
| Manifest V3        | ✅     | ⚠️      | ❌     | ✅   |
| Service Workers    | ✅     | ✅      | ⚠️     | ✅   |
| chrome.storage     | ✅     | ✅\*    | ❌     | ✅   |

\*Firefox uses `browser.storage` API

## Known Issues by Browser

### Chrome

#### Memory Profiling API

**Issue**: `performance.memory` requires command-line flag

**Solution**:

```bash
# Launch Chrome with memory profiling
chrome --enable-precise-memory-info
```

**Workaround in code**:

```javascript
function getMemoryInfo() {
	if (performance.memory) {
		return {
			usedJSHeapSize: performance.memory.usedJSHeapSize,
			totalJSHeapSize: performance.memory.totalJSHeapSize,
			jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
		};
	}
	return null; // Not available
}
```

#### Extension Context Isolation

**Issue**: Content scripts can't access page variables directly

**Solution**:

```javascript
// Inject script into page context
function injectScript(func) {
	const script = document.createElement("script");
	script.textContent = "(" + func + ")();";
	(document.head || document.documentElement).appendChild(script);
	script.remove();
}
```

### Firefox

#### BroadcastChannel in Private Browsing

**Issue**: BroadcastChannel may not work in private windows

**Detection and Fallback**:

```javascript
async function initializeCommunication() {
	try {
		const channel = new BroadcastChannel("vinehelper");
		// Test channel
		channel.postMessage({ type: "test" });
		return channel;
	} catch (error) {
		console.warn("BroadcastChannel not available, using fallback");
		return createFallbackChannel();
	}
}

function createFallbackChannel() {
	// Use chrome.runtime messaging as fallback
	return {
		postMessage: (data) => {
			chrome.runtime.sendMessage({ channel: "vinehelper", data });
		},
		addEventListener: (event, handler) => {
			chrome.runtime.onMessage.addListener((message) => {
				if (message.channel === "vinehelper") {
					handler({ data: message.data });
				}
			});
		},
	};
}
```

#### API Namespace Differences

**Issue**: Firefox uses `browser.*` instead of `chrome.*`

**Solution**:

```javascript
// Universal API wrapper
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Usage
browserAPI.storage.local.get(["key"], (result) => {
	// Handle result
});
```

#### Promise vs Callback APIs

**Issue**: Firefox supports promises, Chrome traditionally uses callbacks

**Solution**:

```javascript
// Promisify Chrome APIs for consistency
function promisify(fn) {
	return (...args) => {
		return new Promise((resolve, reject) => {
			fn(...args, (result) => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve(result);
				}
			});
		});
	};
}

// Usage
const storageGet = promisify(chrome.storage.local.get);
const data = await storageGet(["key"]);
```

### Safari

#### getComputedStyle Performance

**Issue**: `getComputedStyle()` is significantly slower in Safari

**Detection**:

```javascript
function isSafari() {
	return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}
```

**Optimized Solution**:

```javascript
function getVisibleElements(container) {
	const elements = container.querySelectorAll(".vvp-item-tile");

	if (isSafari() || elements.length > 50) {
		// Batch read computed styles for Safari
		const styles = Array.from(elements).map((el) => ({
			element: el,
			display: window.getComputedStyle(el).display,
		}));

		return styles.filter(({ display }) => display !== "none").map(({ element }) => element);
	} else {
		// Direct approach for other browsers
		return Array.from(elements).filter((el) => window.getComputedStyle(el).display !== "none");
	}
}
```

#### BroadcastChannel Not Supported

**Issue**: Safari doesn't support BroadcastChannel API

**Fallback Implementation**:

```javascript
class SafariBroadcastChannel {
	constructor(name) {
		this.name = name;
		this.handlers = [];

		// Use localStorage events as fallback
		window.addEventListener("storage", (e) => {
			if (e.key === `broadcast_${this.name}`) {
				const data = JSON.parse(e.newValue);
				this.handlers.forEach((handler) => handler({ data }));
			}
		});
	}

	postMessage(data) {
		localStorage.setItem(`broadcast_${this.name}`, JSON.stringify({ data, timestamp: Date.now() }));
	}

	addEventListener(event, handler) {
		if (event === "message") {
			this.handlers.push(handler);
		}
	}

	close() {
		this.handlers = [];
	}
}

// Polyfill
if (typeof BroadcastChannel === "undefined") {
	window.BroadcastChannel = SafariBroadcastChannel;
}
```

#### Extension API Limitations

**Issue**: Safari has limited extension APIs

**Workarounds**:

- Use Safari App Extensions format
- Implement fallbacks for missing APIs
- Test thoroughly on Safari

### Edge (Chromium)

Generally follows Chrome behavior, but with some differences:

#### Legacy Edge Detection

```javascript
function isLegacyEdge() {
	return navigator.userAgent.indexOf("Edge/") > -1;
}

if (isLegacyEdge()) {
	alert("Please upgrade to the new Microsoft Edge for VineHelper support");
}
```

## Feature Detection Strategies

### API Availability Checks

```javascript
const FeatureDetection = {
	hasBroadcastChannel() {
		return typeof BroadcastChannel !== "undefined";
	},

	hasPerformanceMemory() {
		return typeof performance !== "undefined" && typeof performance.memory !== "undefined";
	},

	hasWeakMap() {
		return typeof WeakMap !== "undefined";
	},

	hasServiceWorker() {
		return "serviceWorker" in navigator;
	},

	hasMutationObserver() {
		return typeof MutationObserver !== "undefined";
	},

	getStorageAPI() {
		if (typeof browser !== "undefined" && browser.storage) {
			return browser.storage;
		} else if (typeof chrome !== "undefined" && chrome.storage) {
			return chrome.storage;
		}
		return null;
	},
};
```

### Progressive Enhancement

```javascript
class VineHelperCore {
	constructor() {
		this.features = {
			broadcastChannel: FeatureDetection.hasBroadcastChannel(),
			performanceMemory: FeatureDetection.hasPerformanceMemory(),
			serviceWorker: FeatureDetection.hasServiceWorker(),
		};

		this.initializeWithAvailableFeatures();
	}

	initializeWithAvailableFeatures() {
		// Core functionality always available
		this.initializeCore();

		// Enhanced features when available
		if (this.features.broadcastChannel) {
			this.initializeMultiTabSync();
		} else {
			console.info("Multi-tab sync not available");
		}

		if (this.features.performanceMemory) {
			this.initializeMemoryMonitoring();
		}

		if (this.features.serviceWorker) {
			this.initializeBackgroundSync();
		}
	}
}
```

## Polyfills and Workarounds

### Essential Polyfills

```javascript
// Array.from polyfill for older browsers
if (!Array.from) {
	Array.from = function (arrayLike) {
		return Array.prototype.slice.call(arrayLike);
	};
}

// Object.assign polyfill
if (!Object.assign) {
	Object.assign = function (target, ...sources) {
		sources.forEach((source) => {
			Object.keys(source).forEach((key) => {
				target[key] = source[key];
			});
		});
		return target;
	};
}

// Promise.allSettled polyfill
if (!Promise.allSettled) {
	Promise.allSettled = function (promises) {
		return Promise.all(
			promises.map((p) =>
				Promise.resolve(p).then(
					(value) => ({ status: "fulfilled", value }),
					(reason) => ({ status: "rejected", reason })
				)
			)
		);
	};
}
```

### Browser-Specific CSS

```css
/* Chrome-specific styles */
@supports (-webkit-appearance: none) and (not (overflow: -webkit-marquee)) {
	.vh-chrome-only {
		/* Chrome-specific styling */
	}
}

/* Firefox-specific styles */
@-moz-document url-prefix() {
	.vh-firefox-only {
		/* Firefox-specific styling */
	}
}

/* Safari-specific styles */
@supports (-webkit-backdrop-filter: none) and (not (-webkit-touch-callout: none)) {
	.vh-safari-only {
		/* Safari-specific styling */
	}
}
```

## Testing Guidelines

### Cross-Browser Testing Setup

```javascript
// karma.conf.js for automated testing
module.exports = function (config) {
	config.set({
		browsers: ["Chrome", "Firefox", "Safari", "Edge"],
		customLaunchers: {
			ChromeHeadlessCI: {
				base: "ChromeHeadless",
				flags: ["--no-sandbox", "--enable-precise-memory-info"],
			},
		},
	});
};
```

### Manual Testing Checklist

1. **Installation**

    - [ ] Extension installs without errors
    - [ ] All permissions granted correctly
    - [ ] Icon appears in toolbar

2. **Core Functionality**

    - [ ] Settings page loads
    - [ ] Notification monitor connects
    - [ ] Items display correctly
    - [ ] Filtering works
    - [ ] Keywords highlight/hide

3. **Browser-Specific Features**

    - [ ] Multi-tab sync (if supported)
    - [ ] Memory debugging (if supported)
    - [ ] Performance monitoring (if supported)

4. **Performance**
    - [ ] Page load time acceptable
    - [ ] Scrolling smooth with many items
    - [ ] Memory usage reasonable

### Automated Browser Testing

```javascript
// Puppeteer for Chrome
const puppeteer = require("puppeteer");

async function testChrome() {
	const browser = await puppeteer.launch({
		headless: false,
		args: ["--disable-extensions-except=./path/to/vinehelper", "--load-extension=./path/to/vinehelper"],
	});

	const page = await browser.newPage();
	await page.goto("https://www.amazon.com/vine/");

	// Run tests
	const hasToolbar = (await page.$(".vh-toolbar")) !== null;
	assert(hasToolbar, "VineHelper toolbar should be present");

	await browser.close();
}

// Selenium for cross-browser
const { Builder, By } = require("selenium-webdriver");

async function testFirefox() {
	const driver = await new Builder().forBrowser("firefox").build();

	// Load extension and run tests
	await driver.get("https://www.amazon.com/vine/");
	const toolbar = await driver.findElement(By.className("vh-toolbar"));
	assert(toolbar, "VineHelper toolbar should be present");

	await driver.quit();
}
```

## Performance Considerations

### Browser-Specific Optimizations

```javascript
class PerformanceOptimizer {
	static optimize() {
		const browser = this.detectBrowser();

		switch (browser) {
			case "safari":
				this.optimizeForSafari();
				break;
			case "firefox":
				this.optimizeForFirefox();
				break;
			default:
				this.applyDefaultOptimizations();
		}
	}

	static optimizeForSafari() {
		// Reduce getComputedStyle calls
		window.VH_BATCH_STYLE_READS = true;

		// Increase debounce delays
		window.VH_DEBOUNCE_DELAY = 500; // ms

		// Disable non-essential animations
		document.body.classList.add("vh-reduce-motion");
	}

	static optimizeForFirefox() {
		// Firefox handles animations well
		window.VH_ENABLE_ANIMATIONS = true;

		// Use Firefox-specific APIs when available
		if (browser.runtime) {
			window.VH_USE_BROWSER_API = true;
		}
	}

	static detectBrowser() {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes("safari") && !ua.includes("chrome")) return "safari";
		if (ua.includes("firefox")) return "firefox";
		if (ua.includes("edg")) return "edge";
		return "chrome";
	}
}
```

## Migration Guide

### Manifest V2 to V3 (Chrome)

```javascript
// Manifest V2
{
  "manifest_version": 2,
  "background": {
    "scripts": ["background.js"],
    "persistent": false
  }
}

// Manifest V3
{
  "manifest_version": 3,
  "background": {
    "service_worker": "background.js"
  }
}
```

### API Migration

```javascript
// V2: chrome.browserAction
chrome.browserAction.onClicked.addListener(() => {});

// V3: chrome.action
chrome.action.onClicked.addListener(() => {});
```

## Debugging Browser Issues

### Browser Detection

```javascript
const BrowserDetect = {
	getBrowser() {
		const ua = navigator.userAgent;
		let browser = "unknown";

		if (ua.includes("Chrome") && !ua.includes("Edg")) {
			browser = "chrome";
		} else if (ua.includes("Firefox")) {
			browser = "firefox";
		} else if (ua.includes("Safari") && !ua.includes("Chrome")) {
			browser = "safari";
		} else if (ua.includes("Edg")) {
			browser = "edge";
		}

		return {
			name: browser,
			version: this.getVersion(browser, ua),
			ua: ua,
		};
	},

	getVersion(browser, ua) {
		const patterns = {
			chrome: /Chrome\/(\d+)/,
			firefox: /Firefox\/(\d+)/,
			safari: /Version\/(\d+)/,
			edge: /Edg\/(\d+)/,
		};

		const match = ua.match(patterns[browser]);
		return match ? parseInt(match[1]) : 0;
	},
};
```

### Console Helpers

```javascript
// Add to console for debugging
window.VH_DEBUG = {
	browser: BrowserDetect.getBrowser(),
	features: FeatureDetection,

	testFeature(feature) {
		console.log(`Testing ${feature}:`, this.features[feature]());
	},

	logBrowserInfo() {
		console.table({
			Browser: this.browser.name,
			Version: this.browser.version,
			"User Agent": this.browser.ua,
			"Has BroadcastChannel": this.features.hasBroadcastChannel(),
			"Has Performance Memory": this.features.hasPerformanceMemory(),
			"Has Service Worker": this.features.hasServiceWorker(),
		});
	},
};
```

## Best Practices

1. **Always feature detect**, don't browser detect when possible
2. **Provide fallbacks** for missing APIs
3. **Test on real browsers**, not just emulators
4. **Monitor browser console** for errors
5. **Use progressive enhancement** - core features should work everywhere
6. **Document browser-specific code** with comments
7. **Keep polyfills minimal** - only include what's needed
8. **Update regularly** as browsers evolve

## Resources

- [MDN Browser Compatibility](https://developer.mozilla.org/en-US/docs/Web/API)
- [Can I Use](https://caniuse.com/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [Firefox Extension APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API)
- [Safari Extension Development](https://developer.apple.com/safari/extensions/)
