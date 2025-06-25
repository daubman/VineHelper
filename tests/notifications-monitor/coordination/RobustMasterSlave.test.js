import { RobustMasterSlave } from '../../../scripts/notifications-monitor/coordination/RobustMasterSlave.js';

describe('RobustMasterSlave', () => {
	let mockMonitor;
	let instance;
	const originalLocalStorage = global.localStorage;
	const originalBroadcastChannel = global.BroadcastChannel;
	const originalWindow = global.window;

	beforeEach(() => {
		// Mock window object
		global.window = {
			addEventListener: jest.fn(),
			removeEventListener: jest.fn()
		};

		// Mock timers
		jest.useFakeTimers();
		// Reset singleton
		RobustMasterSlave.resetInstance();
		
		// Mock localStorage
		const localStorageData = {};
		global.localStorage = {
			getItem: jest.fn((key) => localStorageData[key] || null),
			setItem: jest.fn((key, value) => { localStorageData[key] = value; }),
			removeItem: jest.fn((key) => { delete localStorageData[key]; }),
			clear: jest.fn(() => { Object.keys(localStorageData).forEach(key => delete localStorageData[key]); })
		};

		// Mock BroadcastChannel
		global.BroadcastChannel = jest.fn().mockImplementation(() => ({
			postMessage: jest.fn(),
			addEventListener: jest.fn(),
			removeEventListener: jest.fn(),
			close: jest.fn()
		}));

		// Mock monitor
		mockMonitor = {
			_channel: new BroadcastChannel('test'),
			_settings: {
				get: jest.fn().mockReturnValue(false) // debugCoordination off by default
			},
			_hookMgr: {
				hookBind: jest.fn(),
				unbind: jest.fn()
			},
			_serverComMgr: {
				updateServicesStatus: jest.fn()
			},
			setMasterMonitor: jest.fn(),
			setSlaveMonitor: jest.fn()
		};

		// Mock crypto.randomUUID
		global.crypto = {
			randomUUID: jest.fn(() => 'test-uuid-' + Math.random())
		};
	});

	afterEach(() => {
		if (instance) {
			instance.destroy();
		}
		jest.clearAllMocks();
		jest.clearAllTimers();
		jest.useRealTimers();
		global.localStorage = originalLocalStorage;
		global.BroadcastChannel = originalBroadcastChannel;
		global.window = originalWindow;
	});

	describe('Initialization', () => {
		test('should create singleton instance', () => {
			const instance1 = new RobustMasterSlave(mockMonitor);
			const instance2 = new RobustMasterSlave(mockMonitor);
			expect(instance1).toBe(instance2);
		});

		test('should become master when no existing master', () => {
			instance = new RobustMasterSlave(mockMonitor);
			
			// Wait for initial setup
			jest.advanceTimersByTime(100);
			
			expect(mockMonitor.setMasterMonitor).toHaveBeenCalled();
			expect(localStorage.setItem).toHaveBeenCalledWith(
				'vinehelper-master-monitor',
				expect.stringContaining('"id":"')
			);
		});

		test('should handle BroadcastChannel not available', () => {
			delete global.BroadcastChannel;
			
			instance = new RobustMasterSlave(mockMonitor);
			
			// Should still become master
			jest.advanceTimersByTime(100);
			expect(mockMonitor.setMasterMonitor).toHaveBeenCalled();
		});

		test('should handle missing monitor channel', () => {
			mockMonitor._channel = null;
			
			instance = new RobustMasterSlave(mockMonitor);
			
			// Should still function
			jest.advanceTimersByTime(100);
			expect(mockMonitor.setMasterMonitor).toHaveBeenCalled();
		});
	});

	describe('Master Election', () => {
		test('should become slave when another master exists', () => {
			// Set existing master in localStorage
			const existingMaster = {
				id: 'existing-master-id',
				timestamp: Date.now()
			};
			localStorage.setItem('vinehelper-master-monitor', JSON.stringify(existingMaster));
			
			instance = new RobustMasterSlave(mockMonitor);
			// Don't advance timers here - the slave detection happens synchronously
			
			expect(mockMonitor.setSlaveMonitor).toHaveBeenCalled();
			expect(mockMonitor.setMasterMonitor).not.toHaveBeenCalled();
		});

		test('should take over when master times out', () => {
			// Set expired master
			const expiredMaster = {
				id: 'expired-master-id',
				timestamp: Date.now() - 4000 // 4 seconds ago
			};
			localStorage.setItem('vinehelper-master-monitor', JSON.stringify(expiredMaster));
			
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			expect(mockMonitor.setMasterMonitor).toHaveBeenCalled();
			
			// Verify new master state
			const newMasterState = JSON.parse(localStorage.getItem('vinehelper-master-monitor'));
			expect(newMasterState.id).toContain('test-uuid');
			expect(newMasterState.timestamp).toBeGreaterThan(expiredMaster.timestamp);
		});

		test('should handle race condition in election', () => {
			// Simulate another tab winning the election
			let callCount = 0;
			const originalGetItem = localStorage.getItem;
			localStorage.getItem = jest.fn((key) => {
				if (key !== 'vinehelper-master-monitor') {
					return originalGetItem(key);
				}
				callCount++;
				if (callCount <= 2) {
					return null; // No master initially
				} else {
					// Another tab became master
					return JSON.stringify({
						id: 'other-tab-id',
						timestamp: Date.now()
					});
				}
			});
			
			instance = new RobustMasterSlave(mockMonitor);
			// Advance past the 50ms delay for election verification
			jest.advanceTimersByTime(60);
			
			expect(mockMonitor.setSlaveMonitor).toHaveBeenCalled();
		});
	});

	describe('Heartbeat Mechanism', () => {
		test('should update heartbeat when master', () => {
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			const initialCalls = localStorage.setItem.mock.calls.length;
			
			// Advance time to trigger heartbeat
			jest.advanceTimersByTime(1000);
			
			expect(localStorage.setItem.mock.calls.length).toBeGreaterThan(initialCalls);
			
			// Verify heartbeat contains current timestamp
			const lastCall = localStorage.setItem.mock.calls[localStorage.setItem.mock.calls.length - 1];
			const state = JSON.parse(lastCall[1]);
			expect(Date.now() - state.timestamp).toBeLessThan(100);
		});

		test('should detect master failure and trigger election', () => {
			// Set up as slave with existing master
			const existingMaster = {
				id: 'master-id',
				timestamp: Date.now()
			};
			localStorage.setItem('vinehelper-master-monitor', JSON.stringify(existingMaster));
			
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			// Simulate master timeout
			jest.advanceTimersByTime(4000);
			
			expect(mockMonitor.setMasterMonitor).toHaveBeenCalled();
		});
	});

	describe('Tab Closure Handling', () => {
		test('should clear master state on beforeunload', () => {
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			// Verify beforeunload handler was registered
			expect(mockMonitor._hookMgr.hookBind).toHaveBeenCalledWith('beforeunload', expect.any(Function));
			
			// Get the handler and call it
			const handler = mockMonitor._hookMgr.hookBind.mock.calls[0][1];
			handler();
			
			expect(localStorage.removeItem).toHaveBeenCalledWith('vinehelper-master-monitor');
		});

		test('should broadcast election request on master exit', () => {
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			const handler = mockMonitor._hookMgr.hookBind.mock.calls[0][1];
			handler();
			
			expect(mockMonitor._channel.postMessage).toHaveBeenCalledWith({
				type: 'election-request',
				sender: expect.any(String)
			});
		});
	});

	describe('Cross-tab Communication', () => {
		test('should handle master-changed broadcast', () => {
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			// Get message handler
			const messageHandler = mockMonitor._channel.addEventListener.mock.calls[0][1];
			
			// Simulate master change from another tab
			messageHandler({
				data: {
					type: 'master-changed',
					masterId: 'other-tab-id'
				}
			});
			
			expect(mockMonitor.setSlaveMonitor).toHaveBeenCalled();
		});

		test('should participate in election when requested', () => {
			// Set up as slave
			const existingMaster = {
				id: 'master-id',
				timestamp: Date.now()
			};
			localStorage.setItem('vinehelper-master-monitor', JSON.stringify(existingMaster));
			
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			// Clear master state to simulate master exit
			localStorage.removeItem('vinehelper-master-monitor');
			
			// Get message handler
			const messageHandler = mockMonitor._channel.addEventListener.mock.calls[0][1];
			
			// Simulate election request
			messageHandler({
				data: {
					type: 'election-request'
				}
			});
			
			// Should check status after random delay
			jest.advanceTimersByTime(200);
			
			expect(mockMonitor.setMasterMonitor).toHaveBeenCalled();
		});
	});

	describe('Storage Event Handling', () => {
		test('should react to storage changes', () => {
			// Set up as slave
			const existingMaster = {
				id: 'master-id',
				timestamp: Date.now()
			};
			localStorage.setItem('vinehelper-master-monitor', JSON.stringify(existingMaster));
			
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			// Simulate storage event (master gone)
			const storageHandler = window.addEventListener.mock.calls.find(
				call => call[0] === 'storage'
			)[1];
			
			localStorage.removeItem('vinehelper-master-monitor');
			
			storageHandler({
				key: 'vinehelper-master-monitor',
				oldValue: JSON.stringify(existingMaster),
				newValue: null
			});
			
			jest.advanceTimersByTime(100);
			
			expect(mockMonitor.setMasterMonitor).toHaveBeenCalled();
		});
	});

	describe('Fallback Mode', () => {
		test('should use polling when BroadcastChannel unavailable', () => {
			delete global.BroadcastChannel;
			
			instance = new RobustMasterSlave(mockMonitor);
			
			// Allow initialization to complete
			jest.advanceTimersByTime(100);
			
			// Should become master initially
			expect(mockMonitor.setMasterMonitor).toHaveBeenCalledTimes(1);
			
			// Clear the mock to check polling doesn't cause re-election
			mockMonitor.setMasterMonitor.mockClear();
			
			// Advance time to trigger polling
			jest.advanceTimersByTime(1000);
			
			// Should still maintain master status without re-calling setMasterMonitor
			expect(mockMonitor.setMasterMonitor).not.toHaveBeenCalled();
		});
	});

	describe('Cleanup', () => {
		test('should properly clean up on destroy', () => {
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			instance.destroy();
			
			expect(mockMonitor._hookMgr.unbind).toHaveBeenCalledWith('beforeunload', expect.any(Function));
			expect(mockMonitor._channel.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
			expect(localStorage.removeItem).toHaveBeenCalledWith('vinehelper-master-monitor');
		});
	});

	describe('Debug Methods', () => {
		test('should provide master status', () => {
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			expect(instance.isMaster()).toBe(true);
			
			// Simulate becoming slave
			const messageHandler = mockMonitor._channel.addEventListener.mock.calls[0][1];
			messageHandler({
				data: {
					type: 'master-changed',
					masterId: 'other-tab-id'
				}
			});
			
			expect(instance.isMaster()).toBe(false);
		});

		test('should provide master info', () => {
			instance = new RobustMasterSlave(mockMonitor);
			jest.advanceTimersByTime(100);
			
			const masterInfo = instance.getMasterInfo();
			expect(masterInfo).toHaveProperty('id');
			expect(masterInfo).toHaveProperty('timestamp');
			expect(masterInfo.id).toContain('test-uuid');
		});
	});
});