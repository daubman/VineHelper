# Contributing to VineHelper

Thank you for your interest in contributing to VineHelper! This guide will help you get started with development and ensure your contributions align with the project's standards.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Code Standards](#code-standards)
4. [Architecture Guidelines](#architecture-guidelines)
5. [Testing Requirements](#testing-requirements)
6. [Pull Request Process](#pull-request-process)
7. [Development Workflow](#development-workflow)
8. [Debugging Tips](#debugging-tips)

## Getting Started

### Prerequisites

- **Node.js** (v16 or higher)
- **Yarn** (v3.6.4) - This project uses Yarn 3
- **Git**
- **Chrome** and/or **Firefox** for testing
- A code editor (VS Code recommended)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:

    ```bash
    git clone https://github.com/YOUR_USERNAME/VineHelper.git
    cd VineHelper
    ```

3. Add upstream remote:
    ```bash
    git remote add upstream https://github.com/FMaz008/VineHelper.git
    ```

### Initial Setup

```bash
# Enable Yarn 3
corepack enable

# Install dependencies
yarn install

# Build the extension
yarn build

# Run tests
yarn test
```

## Development Setup

### Project Structure

```
VineHelper/
├── scripts/                 # Main extension code
│   ├── core/               # Core utilities and services
│   ├── infrastructure/     # DI container and adapters
│   ├── notifications-monitor/ # Notification system
│   └── ui/                 # UI components
├── page/                   # HTML pages (settings, monitor)
├── resource/               # Static assets (CSS, images)
├── tests/                  # Test files
├── docs/                   # Documentation
└── manifest.json          # Extension manifest
```

### Building the Extension

```bash
# Development build (with source maps)
yarn build:dev

# Production build
yarn build

# Watch mode (rebuilds on changes)
yarn watch
```

### Loading in Browser

#### Chrome

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the VineHelper directory

#### Firefox

1. Navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file

## Code Standards

### JavaScript Style Guide

We follow ES6+ standards with these conventions:

```javascript
// Use const/let, never var
const CONSTANT_VALUE = 42;
let mutableValue = "can change";

// Use arrow functions for callbacks
items.map((item) => item.id);

// Use async/await over promises
async function fetchData() {
	try {
		const data = await api.get();
		return data;
	} catch (error) {
		console.error("Failed to fetch:", error);
	}
}

// Use template literals
const message = `Hello ${name}!`;

// Use destructuring
const { id, title } = item;
const [first, ...rest] = array;
```

### File Organization

```javascript
// 1. Imports (grouped by type)
import { ExternalLib } from "external-lib";
import { CoreUtil } from "/scripts/core/utils/CoreUtil.js";
import { LocalComponent } from "./LocalComponent.js";

// 2. Constants
const MAX_RETRIES = 3;

// 3. Class definition
class MyService {
	// Private fields first
	#privateField = null;

	// Public fields
	publicField = "value";

	// Constructor
	constructor(dependencies) {
		this.#privateField = dependencies.storage;
	}

	// Public methods
	async publicMethod() {
		return this.#privateMethod();
	}

	// Private methods
	#privateMethod() {
		// Implementation
	}

	// Static methods last
	static createInstance() {
		return new MyService();
	}
}

// 4. Exports
export { MyService };
```

### Naming Conventions

```javascript
// Classes: PascalCase
class NotificationManager {}

// Files matching class names
// NotificationManager.js

// Methods and variables: camelCase
const itemCount = 0;
function calculateTotal() {}

// Constants: UPPER_SNAKE_CASE
const MAX_ITEMS = 100;
const API_ENDPOINT = 'https://api.example.com';

// Private fields: # prefix
#privateField = null;

// Event names: kebab-case
element.addEventListener('item-added', handler);

// CSS classes: kebab-case with vh- prefix
.vh-notification-badge {}
```

### Comment Standards

```javascript
/**
 * Service for managing WebSocket connections.
 * Handles reconnection logic and message processing.
 *
 * @class WebSocketService
 * @implements {ConnectionInterface}
 */
class WebSocketService {
	/**
	 * Connects to the WebSocket server
	 *
	 * @param {Object} options - Connection options
	 * @param {string} options.url - Server URL
	 * @param {number} [options.timeout=5000] - Connection timeout
	 * @returns {Promise<void>}
	 * @throws {ConnectionError} If connection fails
	 */
	async connect(options) {
		// Implementation
	}
}

// Use single-line comments for clarification
const delay = 1000; // 1 second delay for rate limiting
```

## Architecture Guidelines

### When to Use Dependency Injection

Use DI for:

- Services that need testing with mocks
- Components with external dependencies
- Shared services across multiple components

```javascript
// Good: Testable service with injected dependencies
class ItemService {
	constructor(storage, api) {
		this.storage = storage;
		this.api = api;
	}
}

// Register with DI container
container.register("itemService", ItemService, {
	dependencies: ["storage", "api"],
});
```

### Memory Management Requirements

Every component must:

1. **Implement cleanup**

    ```javascript
    class Component {
    	#listeners = [];
    	#timers = [];

    	constructor() {
    		const handler = this.#handleEvent.bind(this);
    		element.addEventListener("click", handler);
    		this.#listeners.push({ element, type: "click", handler });

    		const timer = setInterval(() => {}, 1000);
    		this.#timers.push(timer);
    	}

    	destroy() {
    		// Remove all listeners
    		this.#listeners.forEach(({ element, type, handler }) => {
    			element.removeEventListener(type, handler);
    		});
    		this.#listeners = [];

    		// Clear all timers
    		this.#timers.forEach((timer) => clearInterval(timer));
    		this.#timers = [];
    	}
    }
    ```

2. **Use WeakMap for DOM references**

    ```javascript
    const elementData = new WeakMap();

    function attachData(element, data) {
    	elementData.set(element, data);
    }
    ```

3. **Avoid memory leaks**
    - Always remove event listeners
    - Clear intervals and timeouts
    - Null out references when done
    - Use WeakMap/WeakSet for DOM associations

### Event Handling Patterns

```javascript
// Use event delegation for dynamic content
class GridManager {
	constructor(container) {
		// Single listener for all items
		container.addEventListener("click", this.#handleClick.bind(this));
	}

	#handleClick(event) {
		const tile = event.target.closest(".vvp-item-tile");
		if (!tile) return;

		const action = event.target.dataset.action;
		switch (action) {
			case "hide":
				this.hideItem(tile.dataset.asin);
				break;
			case "pin":
				this.pinItem(tile.dataset.asin);
				break;
		}
	}
}
```

### Performance Considerations

1. **Batch DOM operations**

    ```javascript
    // Bad: Multiple reflows
    items.forEach((item) => {
    	const element = createelement(item);
    	container.appendChild(element);
    });

    // Good: Single reflow
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
    	const element = createElement(item);
    	fragment.appendChild(element);
    });
    container.appendChild(fragment);
    ```

2. **Debounce expensive operations**

    ```javascript
    function debounce(func, wait) {
    	let timeout;
    	return function executedFunction(...args) {
    		const later = () => {
    			clearTimeout(timeout);
    			func(...args);
    		};
    		clearTimeout(timeout);
    		timeout = setTimeout(later, wait);
    	};
    }

    const debouncedSearch = debounce(search, 300);
    ```

3. **Use requestAnimationFrame for visual updates**
    ```javascript
    function updateUI() {
    	requestAnimationFrame(() => {
    		// DOM updates here
    	});
    }
    ```

## Testing Requirements

### Test Coverage

- Minimum coverage: **80%** overall
- Core modules: **90%** coverage
- New features must include tests

### Test Structure

```javascript
// tests/services/ItemService.test.js
import { ItemService } from "/scripts/services/ItemService.js";

describe("ItemService", () => {
	let service;
	let mockStorage;
	let mockApi;

	beforeEach(() => {
		mockStorage = {
			get: jest.fn(),
			set: jest.fn(),
		};
		mockApi = {
			fetch: jest.fn(),
		};
		service = new ItemService(mockStorage, mockApi);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("getItem", () => {
		it("should return item from storage if exists", async () => {
			mockStorage.get.mockResolvedValue({ id: "123", title: "Test" });

			const item = await service.getItem("123");

			expect(item).toEqual({ id: "123", title: "Test" });
			expect(mockStorage.get).toHaveBeenCalledWith("item:123");
			expect(mockApi.fetch).not.toHaveBeenCalled();
		});

		it("should fetch from API if not in storage", async () => {
			mockStorage.get.mockResolvedValue(null);
			mockApi.fetch.mockResolvedValue({ id: "123", title: "Test" });

			const item = await service.getItem("123");

			expect(item).toEqual({ id: "123", title: "Test" });
			expect(mockApi.fetch).toHaveBeenCalledWith("/items/123");
			expect(mockStorage.set).toHaveBeenCalledWith("item:123", { id: "123", title: "Test" });
		});
	});
});
```

### Performance Tests

```javascript
describe("Performance", () => {
	it("should process 1000 items in under 100ms", () => {
		const items = generateTestItems(1000);

		const start = performance.now();
		processItems(items);
		const duration = performance.now() - start;

		expect(duration).toBeLessThan(100);
	});
});
```

## Pull Request Process

### Branch Naming

- `feature/` - New features (e.g., `feature/advanced-filtering`)
- `fix/` - Bug fixes (e.g., `fix/memory-leak-websocket`)
- `docs/` - Documentation (e.g., `docs/api-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/di-migration`)
- `test/` - Test additions (e.g., `test/integration-suite`)

### Commit Messages

Follow conventional commits format:

```
type(scope): subject

body

footer
```

Examples:

```
feat(notifications): add sound customization options

- Add volume slider to settings
- Support custom notification sounds
- Store preferences in local storage

Closes #123
```

```
fix(memory): clear WebSocket listeners on disconnect

Previously, event listeners were not removed when WebSocket
disconnected, causing memory leaks over time.

Fixes #456
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or changes
- `chore`: Build process or auxiliary tool changes

### PR Description Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Memory leaks checked
- [ ] Performance impact considered

## Screenshots (if applicable)

Add screenshots for UI changes

## Related Issues

Closes #XXX
```

### Review Process

1. **Self-review first** - Check your own code
2. **Run all tests** - Ensure nothing is broken
3. **Update documentation** - If behavior changes
4. **Request review** - From maintainers
5. **Address feedback** - Make requested changes
6. **Squash commits** - Before merging

## Development Workflow

### Daily Development

```bash
# Start your day
git checkout main
git pull upstream main
git checkout -b feature/your-feature

# Make changes
yarn watch  # Auto-rebuild on changes

# Test your changes
yarn test
yarn test:browser

# Commit
git add .
git commit -m "feat: add new feature"

# Push to your fork
git push origin feature/your-feature
```

### Debugging Browser Extension

1. **Chrome DevTools**

    - Right-click extension icon → "Inspect popup"
    - chrome://extensions → "Inspect background page"
    - Use debugger statements

2. **Firefox Debugging**

    - about:debugging → "Inspect"
    - Browser Console for background scripts

3. **Console Access**

    ```javascript
    // In notification monitor
    window.vinehelperMonitor; // Access monitor instance

    // In settings page
    window.vinehelperSettings; // Access settings
    ```

### Testing Locally

```bash
# Run specific test file
yarn test ItemService.test.js

# Run tests in watch mode
yarn test:watch

# Debug tests
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Debugging Tips

### Memory Profiling

```javascript
// Enable memory debugging
localStorage.setItem("vh_debug_memory", "true");

// Take heap snapshots
VH_MEMORY.takeSnapshot("before");
// ... perform actions ...
VH_MEMORY.takeSnapshot("after");
VH_MEMORY.compareSnapshots("before", "after");
```

### Performance Profiling

```javascript
// Profile specific operations
console.time("operation");
performOperation();
console.timeEnd("operation");

// Use Performance API
performance.mark("myOperation-start");
performOperation();
performance.mark("myOperation-end");
performance.measure("myOperation", "myOperation-start", "myOperation-end");
```

### Network Debugging

```javascript
// Monitor WebSocket messages
localStorage.setItem("vh_debug_websocket", "true");

// Log all API calls
window.addEventListener("fetch", (event) => {
	console.log("Fetch:", event.request.url);
});
```

## Code Review Checklist

Before submitting PR, ensure:

- [ ] No `console.log` statements (use Logger service)
- [ ] No hardcoded values (use constants)
- [ ] Error handling for all async operations
- [ ] Memory cleanup in destroy() methods
- [ ] Tests for new functionality
- [ ] Documentation for public APIs
- [ ] No commented-out code
- [ ] Consistent naming conventions
- [ ] Performance considered for loops/iterations
- [ ] Browser compatibility checked

## Getting Help

- **Discord**: [VineHelper Discord](https://discord.gg/vinehelper)
- **GitHub Issues**: [Report bugs](https://github.com/FMaz008/VineHelper/issues)
- **Documentation**: Check `/docs` folder
- **Code Examples**: Look at existing implementations

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).
