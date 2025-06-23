# VineHelper Troubleshooting Guide

## Overview

This guide helps diagnose and resolve common issues with VineHelper. It's organized by symptom to help you quickly find solutions.

## Table of Contents

1. [Memory Issues](#memory-issues)
2. [Performance Problems](#performance-problems)
3. [Connection Issues](#connection-issues)
4. [Browser-Specific Issues](#browser-specific-issues)
5. [Configuration Problems](#configuration-problems)
6. [Display Issues](#display-issues)
7. [Notification Issues](#notification-issues)
8. [Diagnostic Tools](#diagnostic-tools)

## Memory Issues

### Symptom: Browser becomes slow after extended use

**Possible Causes:**

- Memory leaks from uncleaned event listeners
- Accumulated item data without cleanup
- Multiple notification monitor instances

**Solutions:**

1. **Enable Memory Debugging**

    ```javascript
    // In browser console
    localStorage.setItem("vh_debug_memory", "true");
    location.reload();

    // Check memory usage
    VH_MEMORY.generateReport();
    ```

2. **Check for Multiple Instances**

    ```javascript
    // In console
    VH_MEMORY.checkInstances();
    ```

3. **Manual Cleanup**

    - Close and reopen the notification monitor tab
    - Clear browser cache: Settings → Privacy → Clear browsing data
    - Restart the browser

4. **Preventive Measures**
    - Limit the number of items displayed (Settings → General → Max items)
    - Enable auto-cleanup (Settings → General → Auto cleanup after X hours)

### Symptom: "Out of Memory" errors

**Solutions:**

1. **Reduce Item Limit**

    ```javascript
    // Settings → General → Notification Settings
    // Set "Maximum items to display" to 100 or less
    ```

2. **Disable Thumbnail Caching**

    ```javascript
    // Settings → Performance → Disable image caching
    ```

3. **Use Virtual Scrolling** (if available)
    ```javascript
    // Settings → Experimental → Enable virtual scrolling
    ```

## Performance Problems

### Symptom: Slow keyword matching

**Diagnosis:**

```javascript
// Enable keyword performance logging
window.DEBUG_KEYWORD_CACHE = true;

// Check cache hit rate
// Look for "Cache hit" vs "Cache miss" in console
```

**Solutions:**

1. **Optimize Keywords**

    - Use specific keywords instead of generic ones
    - Limit total keywords to under 50
    - Avoid regex patterns when possible

2. **Clear Keyword Cache**

    ```javascript
    // In console
    localStorage.removeItem("vh_keyword_cache");
    location.reload();
    ```

3. **Check for Duplicate Keywords**
    - Settings → Keywords → Review and remove duplicates

### Symptom: UI lag with many items

**Solutions:**

1. **Enable Batch Updates**

    ```javascript
    // Already enabled by default, but verify:
    // Settings → Performance → Batch DOM updates
    ```

2. **Reduce Visible Items**

    - Use filters to show only relevant items
    - Enable pagination if available

3. **Disable Animations**
    ```javascript
    // Settings → Appearance → Disable animations
    ```

## Connection Issues

### Symptom: WebSocket disconnections

**Diagnosis:**

```javascript
// Check connection status
document.querySelector(".vh-connection-status").textContent;
```

**Solutions:**

1. **Check Network**

    - Verify internet connection
    - Check if api.vinehelper.ovh is accessible
    - Try disabling VPN/proxy

2. **Force Reconnect**

    ```javascript
    // In notification monitor console
    if (window.vinehelperMonitor) {
    	window.vinehelperMonitor._websocket.reconnect();
    }
    ```

3. **Clear Authentication**
    ```javascript
    // Reset UUID and fingerprint
    localStorage.removeItem("vh_uuid");
    localStorage.removeItem("vh_fingerprint");
    location.reload();
    ```

### Symptom: "Master/Slave coordination failed"

**Solutions:**

1. **Single Tab Mode**

    - Close all VineHelper tabs except one
    - Refresh the remaining tab

2. **Reset Coordination**

    ```javascript
    // Clear BroadcastChannel state
    localStorage.removeItem("vh_master_state");
    location.reload();
    ```

3. **Browser Compatibility**
    - Some browsers don't support BroadcastChannel
    - VineHelper will automatically fall back to single-tab mode

## Browser-Specific Issues

### Safari: Display styles not updating

**Problem:** Safari requires `getComputedStyle()` for accurate visibility checks

**Solution:**

```javascript
// VineHelper automatically detects Safari
// If issues persist, force Safari mode:
localStorage.setItem("vh_force_safari_mode", "true");
location.reload();
```

### Firefox: BroadcastChannel issues

**Problem:** Firefox may have restrictions on BroadcastChannel in private browsing

**Solution:**

- Use normal browsing mode for VineHelper
- Or disable multi-tab coordination:
    ```javascript
    // Settings → Advanced → Disable multi-tab sync
    ```

### Chrome: Memory profiling unavailable

**Problem:** `performance.memory` API requires specific flags

**Solution:**

```bash
# Launch Chrome with memory profiling enabled
chrome --enable-precise-memory-info
```

## Configuration Problems

### Symptom: Settings not saving

**Diagnosis:**

```javascript
// Check storage quota
navigator.storage.estimate().then((estimate) => {
	console.log(`Using ${estimate.usage} of ${estimate.quota} bytes`);
});
```

**Solutions:**

1. **Clear Storage**

    ```javascript
    // Backup settings first!
    // Settings → Import/Export → Export settings

    // Then clear
    chrome.storage.local.clear();
    location.reload();
    ```

2. **Check Permissions**

    - Ensure extension has storage permissions
    - Chrome: chrome://extensions → VineHelper → Details
    - Check "Site access" and permissions

3. **Reset to Defaults**
    ```javascript
    // Settings → General → Reset all settings
    ```

### Symptom: Keywords not working

**Solutions:**

1. **Verify Keyword Format**

    - Keywords are case-insensitive
    - Special characters need escaping for regex
    - Spaces are significant

2. **Test Keywords**

    ```javascript
    // In console
    const testTitle = "Your test product title";
    const keywords = ["keyword1", "keyword2"];
    keywords.some((k) => testTitle.toLowerCase().includes(k.toLowerCase()));
    ```

3. **Check Keyword Type**
    - Highlight keywords: Yellow background
    - Hide keywords: Hides items completely
    - Blur keywords: Blurs sensitive content

### Symptom: Notifications not appearing

**Solutions:**

1. **Check Browser Permissions**

    - Chrome: chrome://settings/content/notifications
    - Firefox: about:preferences#privacy → Notifications
    - Ensure VineHelper is allowed

2. **Verify Settings**

    ```javascript
    // Settings → Notifications
    // Ensure "Enable notifications" is checked
    // Check notification types (RFY, AFA, AI)
    ```

3. **Test Notifications**
    ```javascript
    // Force test notification
    new Notification("VineHelper Test", {
    	body: "If you see this, notifications work!",
    	icon: "/resource/image/icon-128.png",
    });
    ```

## Display Issues

### Symptom: Items not showing

**Diagnosis:**

```javascript
// Check visibility state
const tiles = document.querySelectorAll(".vvp-item-tile");
console.log(`Total tiles: ${tiles.length}`);
console.log(`Visible: ${Array.from(tiles).filter((t) => window.getComputedStyle(t).display !== "none").length}`);
```

**Solutions:**

1. **Check Filters**

    - Clear all filters and search terms
    - Verify hide keywords aren't too broad

2. **Refresh Grid**

    ```javascript
    // Force grid refresh
    if (window.vinehelperMonitor) {
    	window.vinehelperMonitor.refreshGrid();
    }
    ```

3. **Reset Display State**
    ```javascript
    // Clear hidden items
    localStorage.removeItem("vh_hidden_items");
    location.reload();
    ```

### Symptom: Incorrect item counts

**Solutions:**

1. **Recalculate Counts**

    ```javascript
    // Force recount
    if (window.vinehelperMonitor) {
    	window.vinehelperMonitor._visibilityMgr.recalculateCount();
    }
    ```

2. **Check Multi-Tab Sync**

    - Counts may differ between tabs (by design)
    - Refresh tab for accurate count

3. **Clear Count Cache**
    ```javascript
    sessionStorage.removeItem("vh_item_count");
    location.reload();
    ```

## Notification Issues

### Symptom: Push notifications not working

**Solutions:**

1. **Check Service Worker**

    ```javascript
    // Check registration
    navigator.serviceWorker.getRegistrations().then((regs) => {
    	console.log("Service workers:", regs.length);
    });
    ```

2. **Re-register Service Worker**

    ```javascript
    // Unregister and re-register
    navigator.serviceWorker.getRegistrations().then((regs) => {
    	regs.forEach((reg) => reg.unregister());
    });
    // Then reload extension
    ```

3. **Check Background Script**
    - Chrome: chrome://extensions → VineHelper → Inspect background page
    - Look for errors in console

## Diagnostic Tools

### VineHelper Memory Debugger

```javascript
// Enable memory debugging
localStorage.setItem("vh_debug_memory", "true");
location.reload();

// Available commands
VH_MEMORY.takeSnapshot("before-action");
VH_MEMORY.generateReport();
VH_MEMORY.detectLeaks();
VH_MEMORY.checkDetachedNodes();
VH_MEMORY.cleanup();
```

### Performance Profiling

```javascript
// Start profiling
console.profile("VineHelper Performance");

// Perform actions...

// Stop profiling
console.profileEnd("VineHelper Performance");
```

### Debug Logging

```javascript
// Enable verbose logging
localStorage.setItem("vh_debug", "true");
localStorage.setItem("vh_debug_websocket", "true");
localStorage.setItem("vh_debug_keywords", "true");
location.reload();

// Disable when done
localStorage.removeItem("vh_debug");
localStorage.removeItem("vh_debug_websocket");
localStorage.removeItem("vh_debug_keywords");
```

### Export Debug Info

```javascript
// Collect debug information
const debugInfo = {
	version: chrome.runtime.getManifest().version,
	browser: navigator.userAgent,
	settings: await chrome.storage.local.get(),
	memory: performance.memory,
	errors: console.getErrors?.() || [],
	timestamp: new Date().toISOString(),
};

// Copy to clipboard
copy(JSON.stringify(debugInfo, null, 2));
```

## Common Error Messages

### "BroadcastChannel is not defined"

- Browser doesn't support BroadcastChannel API
- VineHelper will work in single-tab mode
- No action needed

### "WebSocket connection failed"

- Check internet connection
- Verify firewall/antivirus isn't blocking
- Try disabling other extensions

### "Storage quota exceeded"

- Clear browser cache
- Export and backup VineHelper settings
- Remove old hidden/pinned items

### "Invalid authentication"

- Clear stored credentials and reload
- May need to re-authenticate with Amazon

## Getting Help

If these solutions don't resolve your issue:

1. **Collect Debug Info**

    - Use the debug export script above
    - Take screenshots of errors
    - Note steps to reproduce

2. **Check Known Issues**

    - GitHub issues: [VineHelper/issues](https://github.com/FMaz008/VineHelper/issues)
    - Look for similar problems

3. **Report New Issues**
    - Use the issue template
    - Include debug information
    - Specify browser and version
    - Describe expected vs actual behavior

## Prevention Tips

1. **Regular Maintenance**

    - Restart notification monitor daily
    - Clear cache weekly
    - Update extension when available

2. **Optimal Settings**

    - Limit keywords to essentials
    - Set reasonable item limits
    - Enable auto-cleanup features

3. **Browser Health**

    - Keep browser updated
    - Limit concurrent extensions
    - Use dedicated profile for Vine

4. **Monitor Performance**
    - Watch memory usage
    - Check console for errors
    - Report issues early
