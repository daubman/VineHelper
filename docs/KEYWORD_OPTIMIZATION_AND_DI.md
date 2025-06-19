# Keyword Optimization and Dependency Injection Implementation

## Overview

This PR implements two major improvements to VineHelper's keyword system:

1. **Keyword Regex Pre-compilation and Caching** - Optimizes performance by compiling regex patterns once and caching them
2. **Dependency Injection Architecture** - Enables sharing compiled keywords across browser extension contexts (service worker, content scripts, main page)

## Key Features

### 1. Keyword Pre-compilation (Already Committed)

- **WeakMap Caching**: Automatically garbage-collected cache for compiled regex patterns
- **Automatic Pre-compilation**: Keywords are compiled on first use and cached
- **ETV Optimization**: Added `hasEtvCondition` flag to skip unnecessary re-evaluations
- **Array Caching**: Settings manager caches keyword arrays to maintain stable references

### 2. Dependency Injection Implementation (New)

- **KeywordCompilationService**: Centralized service that compiles keywords once and shares results
- **Cross-Context Sharing**: Compiled patterns are serialized and shared via storage/messages
- **RuntimeAdapter**: Abstraction for Chrome APIs enabling unit testing
- **Backward Compatibility**: KeywordMatchDI maintains compatibility with existing code

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Service Worker    │     │  Content Script  │     │    Main Page    │
│                     │     │                  │     │                 │
│ KeywordCompilation  │◄────┤ KeywordMatchDI   │◄────┤ KeywordMatchDI  │
│     Service         │     │                  │     │                 │
│                     │     └──────────────────┘     └─────────────────┘
│  (Compiles Once)    │              ▲                        ▲
│                     │              │                        │
└──────────┬──────────┘              │                        │
           │                         │                        │
           ▼                         │                        │
    ┌──────────────┐                 │                        │
    │   Storage    │                 │                        │
    │              │                 │                        │
    │  Serialized  │─────────────────┴────────────────────────┘
    │  Compiled    │         (Shared via Storage/Messages)
    │  Keywords    │
    └──────────────┘
```

## Bug Fixes

### 1. Notification Count Not Updating

**Problem**: Items arriving without ETV data weren't properly counted when ETV arrived later

**Solution**:

- Always set `typeZeroETV = 1` when ETV is 0 (not just on first detection)
- Clear `typeZeroETV = 0` when item is not zero ETV
- Always re-evaluate keywords when ETV changes (removed skip check)
- Clear `typeHighlight` flag when item no longer matches keywords

### 2. ETV-Dependent Keywords

**Problem**: Keywords with ETV conditions weren't re-evaluated when ETV changed

**Solution**:

- Removed the skip check that prevented re-evaluation of highlighted items
- Added logic to clear highlight flag when conditions no longer match
- Re-apply filtering after flag changes to update visibility

## Performance Improvements

1. **Regex Compilation**: Patterns compiled once instead of on every match
2. **WeakMap Caching**: Automatic garbage collection prevents memory leaks
3. **Shared Compilation**: Single compilation shared across all contexts
4. **ETV Optimization**: Only re-evaluate keywords with ETV conditions when needed

## Code Quality Improvements

1. **Shared Utilities** (`KeywordUtils.js`):

    - `hasEtvCondition()` - Check if keyword has ETV conditions
    - `areEtvConditionsSatisfied()` - Check both ETV conditions
    - `fnv1aHash()` - Better hash distribution for cache keys
    - Named constants for clarity

2. **DRY Refactoring**:

    - Extracted common item found logic into `#handleItemFound()`
    - Eliminated ~60 lines of duplicate code
    - Consistent ETV checking across all files

3. **Cache Key Optimization**:
    - Replaced JSON.stringify with manual string building
    - Better performance with large keyword arrays

## Testing

- All 188 tests passing
- Comprehensive test coverage for:
    - Keyword compilation and caching
    - DI container and services
    - ETV optimization
    - Array caching behavior

## Migration Guide

For existing code:

```javascript
// Old way (still works)
import { keywordMatch } from "/scripts/core/utils/KeywordMatch.js";
const match = keywordMatch(keywords, title, etv_min, etv_max);

// New way (with DI - for cross-context sharing)
import { KeywordMatchDI } from "/scripts/core/utils/KeywordMatchDI.js";
const matcher = container.resolve("keywordMatch");
const match = await matcher.match(keywords, title, etv_min, etv_max);
```

## Files Modified

### Core Implementation

- `scripts/core/utils/KeywordMatch.js` - Pre-compilation and caching
- `scripts/core/utils/KeywordUtils.js` - Shared utility functions
- `scripts/core/services/KeywordCompilationService.js` - DI compilation service
- `scripts/core/utils/KeywordMatchDI.js` - DI-compatible keyword matching
- `scripts/notifications-monitor/core/NotificationMonitor.js` - Bug fixes and optimizations

### Infrastructure

- `scripts/infrastructure/RuntimeAdapter.js` - Chrome API abstraction
- `scripts/infrastructure/SettingsFactoryEnhanced.js` - DI container setup
- `scripts/vh_service_worker_di.js` - Service worker with DI

### Tests

- `tests/keywordCompilationService.test.js` - DI service tests
- `tests/keywordPrecompile.test.js` - Pre-compilation tests
- `tests/keywordCacheInvalidation.test.js` - Cache behavior tests

## Impact

- **Memory**: Reduced duplication across contexts
- **Performance**: Faster keyword matching with pre-compiled patterns
- **Reliability**: Fixed notification count bugs
- **Maintainability**: Better code organization with DI
- **Testability**: All services can be mocked for testing
