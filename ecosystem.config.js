module.exports = {
    apps: [{
        name: "invoice-sync",
        script: "./scheduler.js",
        instances: 1,
        exec_mode: "fork",
        watch: false,
        autorestart: false, // Don't auto restart when completed
        cron_restart: "*/15 * * * *", // Run every 15 minutes
    }]
};