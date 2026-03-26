/**
 * Activity Logger Module for AMS
 * Tracks user actions and system events
 */

class ActivityLogger {
    constructor() {
        this.STORAGE_KEY = 'ams_activity_logs';
        this.maxLogs = 2000; // Increased to 2000 logs for better cloud sharing
    }

    /**
     * Log an action
     * @param {string} action - Short action name (e.g., "Login", "Delete")
     * @param {string} details - detailed description
     * @param {string} type - 'info', 'warning', 'error', 'success'
     */
    log(action, details, type = 'info') {
        const logs = this.getLogs();

        const newLog = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            user: localStorage.getItem('logged_in_user') || 'System',
            role: localStorage.getItem('user_role') || 'Unknown',
            action: action,
            details: details,
            type: type
        };

        logs.unshift(newLog); // Add to beginning

        // Trim logs if needed
        if (logs.length > this.maxLogs) {
            logs.length = this.maxLogs;
        }

        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
            console.log(`[Logger] ${action}: ${details}`);

            
        } catch (e) {
            console.error('Failed to save log:', e);
        }
    }

    /**
     * Retrieve all logs
     * @returns {Array} Array of log objects
     */
    getLogs() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    }

    /**
     * Clear all logs
     */
    clearLogs() {
        localStorage.removeItem(this.STORAGE_KEY);
    }

    /**
     * Export logs as CSV
     */
    exportLogsCSV() {
        const logs = this.getLogs();
        if (logs.length === 0) return null;

        const headers = ['Timestamp', 'User', 'Role', 'Action', 'Details', 'Type'];
        const rows = logs.map(log => [
            new Date(log.timestamp).toLocaleString(),
            log.user,
            log.role,
            log.action,
            `"${log.details.replace(/"/g, '""')}"`, // Escape quotes
            log.type
        ]);

        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
}

// Global Instance
window.activityLogger = new ActivityLogger();

