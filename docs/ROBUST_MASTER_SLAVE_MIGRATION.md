# RobustMasterSlave Migration Guide

## Overview

The `RobustMasterSlave` class is a complete rewrite of the original `MasterSlave` coordination system, designed to address critical race conditions and improve reliability across browser tabs.

## Key Improvements

### 1. **Persistent State via localStorage**
- Master state is stored in localStorage with format: `{id: "timestamp-uuid", timestamp: lastHeartbeat}`
- Survives tab crashes and provides immediate master detection on new tab opens
- Enables deterministic conflict resolution using timestamp-based tab IDs

### 2. **Heartbeat Mechanism**
- Masters update their timestamp every second
- Slaves check master health every second
- 3-second timeout triggers automatic election if master fails

### 3. **Race Condition Prevention**
- Double-verification after election attempts
- 50ms delay to handle simultaneous localStorage writes
- Deterministic winner selection based on tab ID (timestamp + UUID)

### 4. **Cross-Browser Compatibility**
- Graceful degradation for browsers without BroadcastChannel
- Falls back to localStorage polling (500ms intervals)
- Works on Chrome, Firefox, and Safari

### 5. **Improved Debugging**
- All coordination logs respect `general.debugCoordination` setting
- Public methods for inspecting state: `isMaster()`, `getMasterInfo()`
- Detailed logging of elections, timeouts, and state changes

## Migration Steps

1. **Update Import Statement**
   ```javascript
   // Old
   import { MasterSlave } from "/scripts/notifications-monitor/coordination/MasterSlave.js";
   
   // New
   import { RobustMasterSlave } from "/scripts/notifications-monitor/coordination/RobustMasterSlave.js";
   ```

2. **Update Class Instantiation**
   ```javascript
   // Old
   this._masterSlave = new MasterSlave(this);
   
   // New
   this._masterSlave = new RobustMasterSlave(this);
   ```

3. **No API Changes Required**
   - The new class maintains the same interface
   - `setMasterMonitor()` and `setSlaveMonitor()` work identically
   - `_hookMgr` integration remains the same

## Edge Cases Handled

### Single Tab Scenario
- Tab immediately becomes master
- No elections or negotiations needed
- Heartbeat still runs for consistency

### Multiple Tabs Open Simultaneously
- First tab to write to localStorage wins
- Other tabs detect existing master and become slaves
- No split-brain scenarios possible

### Master Tab Closes Normally
- Master clears its state in localStorage
- Broadcasts election request via BroadcastChannel
- Slaves detect missing master and elect new one

### Master Tab Crashes
- Heartbeat stops updating
- Slaves detect timeout after 3 seconds
- Automatic election triggered
- First slave to detect timeout typically wins

### Browser Without BroadcastChannel
- Falls back to localStorage polling
- Slightly higher latency (500ms vs immediate)
- All other features work identically

### Network Partitions
- Not applicable (all coordination is local)
- Each browser instance has independent master/slave setup

## Performance Considerations

- **Memory**: Minimal overhead (single interval per tab)
- **CPU**: Negligible (1 localStorage read/write per second for master)
- **Storage**: ~100 bytes in localStorage
- **Cleanup**: Automatic on tab close or crash

## Debugging

Enable debug logs:
```javascript
// In settings
general.debugCoordination = true
```

Check current state:
```javascript
// In console
monitor._masterSlave.isMaster()
monitor._masterSlave.getMasterInfo()
```

## Rollback Plan

If issues arise, simply revert the import changes in `MonitorCore.js`. The old `MasterSlave.js` file remains unchanged and can be restored immediately.

## Testing

Comprehensive test suite included in `tests/notifications-monitor/coordination/RobustMasterSlave.test.js` covering:
- Election scenarios
- Timeout handling
- Race conditions
- Browser compatibility
- Edge cases

Run tests:
```bash
npm test -- RobustMasterSlave
```

## Known Limitations

1. **localStorage Quota**: Extremely unlikely to hit, but possible in theory
2. **Browser Privacy Modes**: May not persist across tabs in incognito/private mode
3. **Cross-Origin**: Only works within same origin (by design)

## Future Enhancements

- Consider adding election priority based on tab age or resource usage
- Add metrics collection for coordination performance
- Implement exponential backoff for election attempts