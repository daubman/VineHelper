/*global chrome*/
/**
 * Robust master/slave coordination system using localStorage + BroadcastChannel hybrid approach.
 * 
 * Key improvements over the original MasterSlave.js:
 * - Persistent state in localStorage to handle tab closures and browser crashes
 * - Heartbeat mechanism with 3-second timeout for master failure detection
 * - UUID + timestamp for deterministic conflict resolution
 * - Fallback to polling for browsers without BroadcastChannel support
 * - Prevents race conditions where multiple monitors can become master
 * 
 * pre-requisites:
 * - a "beforeunload" hook to executed when the master role should be passed along.
 * - this._monitor.setMasterMonitor()
 * - this._monitor.setSlaveMonitor()
 */

class RobustMasterSlave {
	static #instance = null;
	static #STORAGE_KEY = 'vinehelper-master-monitor';
	static #HEARTBEAT_INTERVAL = 1000; // 1 second
	static #MASTER_TIMEOUT = 3000; // 3 seconds
	static #POLLING_INTERVAL = 500; // 500ms for localStorage polling fallback
	
	_monitor = null;
	#tabId = null;
	#isMaster = false;
	#heartbeatInterval = null;
	#healthCheckInterval = null;
	#pollingInterval = null;
	#channel = null;
	#messageHandler = null;
	#beforeUnloadHandler = null;
	#storageHandler = null;
	#hasBroadcastChannel = false;

	constructor(monitor) {
		if (RobustMasterSlave.#instance) {
			return RobustMasterSlave.#instance;
		}

		RobustMasterSlave.#instance = this;
		this._monitor = monitor;
		this.#tabId = this.#generateTabId();
		
		// Check for BroadcastChannel support
		this.#hasBroadcastChannel = typeof BroadcastChannel !== "undefined";
		
		if (!this.#hasBroadcastChannel) {
			console.warn("[RobustMasterSlave] BroadcastChannel API not available. Using localStorage polling fallback.");
		}

		this.#initialize();
	}

	#generateTabId() {
		// Generate a unique tab ID using timestamp + random UUID
		// This ensures uniqueness and provides ordering for conflict resolution
		return `${Date.now()}-${crypto.randomUUID()}`;
	}

	#initialize() {
		try {
			// Set up BroadcastChannel if available
			if (this.#hasBroadcastChannel && this._monitor?._channel) {
				this.#channel = this._monitor._channel;
				this.#setupBroadcastHandlers();
			}

			// Set up localStorage handlers (always used for persistent state)
			this.#setupStorageHandlers();

			// Set up beforeunload handler
			this.#setupBeforeUnloadHandler();

			// Check if we should become master
			this.#checkMasterStatus();

			// Start health monitoring
			this.#startHealthCheck();

			// If no BroadcastChannel, start polling
			if (!this.#hasBroadcastChannel) {
				this.#startPolling();
			}
		} catch (error) {
			console.error("[RobustMasterSlave] Initialization failed:", error);
			// Fallback to single-tab mode
			this.#becomeMaster();
		}
	}

	#setupBroadcastHandlers() {
		this.#messageHandler = (event) => {
			const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
			
			if (debugCoordination && event.data.type !== "heartbeat") {
				console.log("[RobustMasterSlave] Received broadcast:", event.data);
			}

			switch (event.data.type) {
				case "master-changed":
					this.#handleMasterChange(event.data.masterId);
					break;
				case "election-request":
					this.#participateInElection();
					break;
				case "heartbeat":
					// Heartbeats are handled via localStorage for persistence
					break;
			}
		};

		this.#channel.addEventListener("message", this.#messageHandler);
	}

	#setupStorageHandlers() {
		// Listen for storage changes (works across tabs)
		this.#storageHandler = (event) => {
			if (event.key === RobustMasterSlave.#STORAGE_KEY) {
				const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
				if (debugCoordination) {
					console.log("[RobustMasterSlave] Storage changed:", {
						oldValue: event.oldValue,
						newValue: event.newValue,
						timestamp: Date.now()
					});
				}
				
				// Check if we need to handle master change
				if (!this.#isMaster) {
					this.#checkMasterStatus();
				}
			}
		};

		if (typeof window !== 'undefined') {
			window.addEventListener("storage", this.#storageHandler);
		}
	}

	#setupBeforeUnloadHandler() {
		this.#beforeUnloadHandler = () => {
			const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
			if (debugCoordination) {
				console.log("[RobustMasterSlave] Tab unloading:", {
					tabId: this.#tabId,
					isMaster: this.#isMaster,
					timestamp: Date.now()
				});
			}

			if (this.#isMaster) {
				// Clear master state to allow immediate takeover
				this.#clearMasterState();
				
				// Broadcast that master is leaving
				if (this.#hasBroadcastChannel && this.#channel) {
					try {
						this.#channel.postMessage({
							type: "election-request",
							sender: this.#tabId
						});
					} catch (error) {
						console.warn("[RobustMasterSlave] Failed to send election request:", error);
					}
				}
			}
		};

		if (this._monitor._hookMgr) {
			this._monitor._hookMgr.hookBind("beforeunload", this.#beforeUnloadHandler);
		} else if (typeof window !== 'undefined') {
			window.addEventListener("beforeunload", this.#beforeUnloadHandler);
		}
	}

	#getMasterState() {
		try {
			const state = localStorage.getItem(RobustMasterSlave.#STORAGE_KEY);
			return state ? JSON.parse(state) : null;
		} catch (error) {
			console.error("[RobustMasterSlave] Failed to get master state:", error);
			return null;
		}
	}

	#setMasterState() {
		try {
			const state = {
				id: this.#tabId,
				timestamp: Date.now()
			};
			localStorage.setItem(RobustMasterSlave.#STORAGE_KEY, JSON.stringify(state));
			return true;
		} catch (error) {
			console.error("[RobustMasterSlave] Failed to set master state:", error);
			return false;
		}
	}

	#clearMasterState() {
		try {
			localStorage.removeItem(RobustMasterSlave.#STORAGE_KEY);
		} catch (error) {
			console.error("[RobustMasterSlave] Failed to clear master state:", error);
		}
	}

	#checkMasterStatus() {
		const masterState = this.#getMasterState();
		const now = Date.now();
		const debugCoordination = this._monitor._settings?.get("general.debugCoordination");

		if (debugCoordination) {
			console.log("[RobustMasterSlave] Checking master status:", {
				currentMaster: masterState,
				myTabId: this.#tabId,
				timestamp: now
			});
		}

		// No master or master timed out
		if (!masterState || (now - masterState.timestamp > RobustMasterSlave.#MASTER_TIMEOUT)) {
			if (debugCoordination) {
				console.log("[RobustMasterSlave] No active master detected, initiating election");
			}
			this.#initiateElection();
		} 
		// We are the master
		else if (masterState.id === this.#tabId) {
			if (!this.#isMaster) {
				this.#becomeMaster();
			}
		}
		// Someone else is master
		else {
			if (debugCoordination) {
				console.log("[RobustMasterSlave] Another master exists, becoming slave:", masterState);
			}
			if (this.#isMaster) {
				this.#becomeSlave();
			} else if (!this._monitor._isMasterMonitor && !this._monitor._isSlaveMonitor) {
				// Ensure we're marked as slave if we're not already
				this.#becomeSlave();
			}
		}
	}

	#initiateElection() {
		const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
		
		// Try to claim master role
		const currentMaster = this.#getMasterState();
		const now = Date.now();
		
		// Check if current master is still valid
		if (currentMaster && (now - currentMaster.timestamp <= RobustMasterSlave.#MASTER_TIMEOUT)) {
			// Another tab claimed master while we were checking
			if (debugCoordination) {
				console.log("[RobustMasterSlave] Another tab claimed master during election:", currentMaster);
			}
			return;
		}

		// Attempt to become master
		if (this.#setMasterState()) {
			// Double-check we won the election (handle race conditions)
			setTimeout(() => {
				const verifyMaster = this.#getMasterState();
				if (verifyMaster && verifyMaster.id === this.#tabId) {
					if (debugCoordination) {
						console.log("[RobustMasterSlave] Won election, becoming master");
					}
					this.#becomeMaster();
				} else {
					if (debugCoordination) {
						console.log("[RobustMasterSlave] Lost election to:", verifyMaster);
					}
					this.#becomeSlave();
				}
			}, 50); // Small delay to handle simultaneous writes
		}
	}

	#participateInElection() {
		// Only participate if we're not already master
		if (!this.#isMaster) {
			// Small random delay to prevent thundering herd
			setTimeout(() => {
				this.#checkMasterStatus();
			}, Math.random() * 100);
		}
	}

	#becomeMaster() {
		const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
		
		if (this.#isMaster) {
			return; // Already master
		}

		if (debugCoordination) {
			console.log("[RobustMasterSlave] Becoming MASTER:", {
				tabId: this.#tabId,
				timestamp: Date.now()
			});
		}

		this.#isMaster = true;
		
		// Start heartbeat
		this.#startHeartbeat();
		
		// Notify monitor
		this._monitor.setMasterMonitor();
		
		// Broadcast master change
		if (this.#hasBroadcastChannel && this.#channel) {
			try {
				this.#channel.postMessage({
					type: "master-changed",
					masterId: this.#tabId
				});
			} catch (error) {
				console.warn("[RobustMasterSlave] Failed to broadcast master change:", error);
			}
		}

		// Update server status
		if (this._monitor._serverComMgr?.updateServicesStatus) {
			this._monitor._serverComMgr.updateServicesStatus();
		}
	}

	#becomeSlave() {
		const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
		
		// Allow becoming slave even if not currently master
		// This handles initial setup when another master exists

		if (debugCoordination) {
			console.log("[RobustMasterSlave] Becoming SLAVE:", {
				tabId: this.#tabId,
				timestamp: Date.now()
			});
		}

		this.#isMaster = false;
		
		// Stop heartbeat
		this.#stopHeartbeat();
		
		// Notify monitor
		this._monitor.setSlaveMonitor();
	}

	#startHeartbeat() {
		this.#stopHeartbeat(); // Clear any existing interval
		
		// Update heartbeat immediately
		this.#updateHeartbeat();
		
		// Set up regular heartbeat
		this.#heartbeatInterval = setInterval(() => {
			this.#updateHeartbeat();
		}, RobustMasterSlave.#HEARTBEAT_INTERVAL);
	}

	#stopHeartbeat() {
		if (this.#heartbeatInterval) {
			clearInterval(this.#heartbeatInterval);
			this.#heartbeatInterval = null;
		}
	}

	#updateHeartbeat() {
		if (this.#isMaster) {
			this.#setMasterState();
			
			// Also send heartbeat via BroadcastChannel if available
			if (this.#hasBroadcastChannel && this.#channel) {
				try {
					this.#channel.postMessage({
						type: "heartbeat",
						masterId: this.#tabId,
						timestamp: Date.now()
					});
				} catch (error) {
					// Ignore heartbeat broadcast errors
				}
			}
		}
	}

	#startHealthCheck() {
		this.#healthCheckInterval = setInterval(() => {
			if (!this.#isMaster) {
				const masterState = this.#getMasterState();
				const now = Date.now();
				
				if (!masterState || (now - masterState.timestamp > RobustMasterSlave.#MASTER_TIMEOUT)) {
					const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
					if (debugCoordination) {
						console.log("[RobustMasterSlave] Master timeout detected:", {
							lastMaster: masterState,
							timeout: RobustMasterSlave.#MASTER_TIMEOUT,
							timeSinceLastHeartbeat: masterState ? now - masterState.timestamp : 'N/A'
						});
					}
					this.#initiateElection();
				}
			}
		}, RobustMasterSlave.#HEARTBEAT_INTERVAL);
	}

	#startPolling() {
		// For browsers without BroadcastChannel, poll localStorage
		this.#pollingInterval = setInterval(() => {
			this.#checkMasterStatus();
		}, RobustMasterSlave.#POLLING_INTERVAL);
	}

	#handleMasterChange(newMasterId) {
		const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
		
		if (debugCoordination) {
			console.log("[RobustMasterSlave] Master changed notification:", {
				newMasterId,
				myTabId: this.#tabId,
				wasIMaster: this.#isMaster
			});
		}

		if (newMasterId !== this.#tabId && this.#isMaster) {
			this.#becomeSlave();
		}
	}

	destroy() {
		// Stop all intervals
		this.#stopHeartbeat();
		
		if (this.#healthCheckInterval) {
			clearInterval(this.#healthCheckInterval);
			this.#healthCheckInterval = null;
		}
		
		if (this.#pollingInterval) {
			clearInterval(this.#pollingInterval);
			this.#pollingInterval = null;
		}

		// Remove event listeners
		if (this.#messageHandler && this.#channel) {
			this.#channel.removeEventListener("message", this.#messageHandler);
			this.#messageHandler = null;
		}

		if (this.#storageHandler && typeof window !== 'undefined') {
			window.removeEventListener("storage", this.#storageHandler);
			this.#storageHandler = null;
		}

		// Unbind beforeunload
		if (this.#beforeUnloadHandler) {
			if (this._monitor._hookMgr?.unbind) {
				this._monitor._hookMgr.unbind("beforeunload", this.#beforeUnloadHandler);
			} else if (typeof window !== 'undefined') {
				window.removeEventListener("beforeunload", this.#beforeUnloadHandler);
			}
			this.#beforeUnloadHandler = null;
		}

		// Clear master state if we were master
		if (this.#isMaster) {
			this.#clearMasterState();
		}

		// Clear static instance
		RobustMasterSlave.#instance = null;
	}

	// Static method to reset singleton for testing
	static resetInstance() {
		if (RobustMasterSlave.#instance) {
			RobustMasterSlave.#instance.destroy();
		}
		RobustMasterSlave.#instance = null;
	}

	// Public method to check if this tab is master (for debugging)
	isMaster() {
		return this.#isMaster;
	}

	// Public method to get current master info (for debugging)
	getMasterInfo() {
		return this.#getMasterState();
	}
}

export { RobustMasterSlave };