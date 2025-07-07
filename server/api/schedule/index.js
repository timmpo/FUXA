/**
 * Schedules API: Manage schedules in FUXA project storage
 */

'use strict';

const express = require("express");
const authJwt = require('../jwt-helper');
const schedule = require('node-schedule');
const moment = require('moment');

var runtime;
var secureFnc;
var checkGroupsFnc;

let schedules = [];
let jobs = [];

/**
 * Load schedules from FUXA project storage
 */
async function loadSchedules() {
    try {
        schedules = await runtime.project.getSchedules();
        console.log('Loaded schedules from project storage:', schedules);
        schedules.forEach(scheduleJobs);
    } catch (err) {
        console.error('Error loading schedules from project storage:', err);
        schedules = [];
    }
}

/**
 * Save schedules to FUXA project storage
 */
async function saveSchedules() {
    try {
        const { ProjectDataCmdType } = runtime.project;
        for (const sched of schedules) {
            await runtime.project.setProjectData(ProjectDataCmdType.SetSchedule, sched);
        }
        console.log('Schedules saved to project storage');
    } catch (err) {
        console.error('Error saving schedules to project storage:', err);
        throw err;
    }
}

/**
 * Schedule jobs for a given schedule object
 * @param {Object} schedObj - The schedule object
 */
function scheduleJobs(schedObj) {
    if (!runtime) {
        console.error('Runtime not initialized!');
        return;
    }

    const { tagId, periods, onValue, offValue } = schedObj;

    periods.forEach(period => {
        const { dayOfWeek, startTime, endTime } = period;

        const [startHour, startMinute] = startTime.split(':');
        const startCron = `${startMinute} ${startHour} * * ${dayOfWeek}`;
        const startJob = schedule.scheduleJob(startCron, async () => {
            console.log(`Started ON period for ${tagId} at ${moment().format('YYYY-MM-DD HH:mm:ss')} with value ${onValue}`);
            try {
                const success = await runtime.devices.setTagValue(tagId, onValue);
                if (!success) {
                    console.warn(`${tagId} could not be set to ${onValue}`);
                }
            } catch (err) {
                console.error(`Error setting ${tagId} to ${onValue}:`, err);
            }
        });
        jobs.push({ name: `${tagId}-start-${dayOfWeek}`, job: startJob });

        const [endHour, endMinute] = endTime.split(':');
        const endCron = `${endMinute} ${endHour} * * ${dayOfWeek}`;
        const endJob = schedule.scheduleJob(endCron, async () => {
            console.log(`Ended OFF period for ${tagId} at ${moment().format('YYYY-MM-DD HH:mm:ss')} with value ${offValue}`);
            try {
                const success = await runtime.devices.setTagValue(tagId, offValue);
                if (!success) {
                    console.warn(`${tagId} could not be set to ${offValue}`);
                }
            } catch (err) {
                console.error(`Error setting ${tagId} to ${offValue}:`, err);
            }
        });
        jobs.push({ name: `${tagId}-end-${dayOfWeek}`, job: endJob });
    });
}

/**
 * Apply current states based on schedule periods
 */
async function applyCurrentStates() {
    if (!runtime) {
        console.error('Runtime not initialized!');
        return;
    }

    const now = moment();
    for (const schedule of schedules) {
        const { tagId, periods, onValue, offValue } = schedule;
        const isOn = periods.some(p => {
            const today = now.day();
            if (parseInt(p.dayOfWeek) !== today) return false;

            const start = moment(p.startTime, 'HH:mm');
            const end = moment(p.endTime, 'HH:mm');
            const nowTime = moment(now.format('HH:mm'), 'HH:mm');

            return nowTime.isBetween(start, end);
        });

        try {
            const value = isOn ? onValue : offValue;
            const success = await runtime.devices.setTagValue(tagId, value);
            if (success) {
                console.log(`Set ${tagId} to ${value} based on current time`);
            } else {
                console.warn(`Could not set ${tagId} to ${value}`);
            }
        } catch (err) {
            console.error(`Error setting ${tagId} to ${value}:`, err);
        }
    }
}

/**
 * Create Express app for schedule endpoints
 */
function createApp() {
    const commandApp = express();

    // Middleware: Check that runtime is initialized
    commandApp.use((req, res, next) => {
        if (!runtime?.project) {
            res.status(404).end();
        } else {
            next();
        }
    });

    // Helper function: Check admin permission
    function requireAdmin(req, res) {
        const permission = checkGroupsFnc(req);

        if (res.statusCode === 403) {
            runtime.logger.error("Token expired");
            res.status(403).json({ error: "token_expired", message: "Token expired" });
            return false;
        }

        if (!authJwt.haveAdminPermission(permission)) {
            runtime.logger.error("Unauthorized access");
            res.status(401).json({ error: "unauthorized_error", message: "Unauthorized!" });
            return false;
        }

        return true;
    }

    // POST - Create new schedule
    commandApp.post('/api/schedules', secureFnc, async (req, res) => {
        if (!requireAdmin(req, res)) return;

        const { tagId, name, periods, onValue, offValue, timeFormat } = req.body;

        if (!tagId || !Array.isArray(periods) || !onValue || !offValue || !timeFormat) {
            return res.status(400).json({ error: 'tagId, periods, onValue, offValue, and timeFormat are required' });
        }

        jobs = jobs.filter(job => !job.name.startsWith(tagId));
        schedules = schedules.filter(sch => sch.tagId !== tagId);

        const newSchedule = { tagId, name: name || '', periods, onValue, offValue, timeFormat };
        schedules.push(newSchedule);
        scheduleJobs(newSchedule);
        try {
            await saveSchedules();
            await applyCurrentStates();
            res.json({ message: 'Schedule created', schedule: newSchedule });
        } catch (err) {
            res.status(500).json({ error: 'server_error', message: err.message });
            runtime.logger.error(`api post schedules: ${err.message}`);
        }
    });

    // PUT - Update schedule
    commandApp.put('/api/schedules/:tagId', secureFnc, async (req, res) => {
        if (!requireAdmin(req, res)) return;

        const tagId = req.params.tagId;
        const { name, periods, onValue, offValue, timeFormat } = req.body;

        if (!Array.isArray(periods) || !onValue || !offValue || !timeFormat) {
            return res.status(400).json({ error: 'Invalid periods, onValue, offValue, or timeFormat format' });
        }

        jobs = jobs.filter(job => !job.name.startsWith(tagId));
        schedules = schedules.filter(s => s.tagId !== tagId);

        const updatedSchedule = { tagId, name: name || '', periods, onValue, offValue, timeFormat };
        schedules.push(updatedSchedule);
        scheduleJobs(updatedSchedule);
        try {
            await saveSchedules();
            await applyCurrentStates();
            res.json({ message: 'Schedule updated', schedule: updatedSchedule });
        } catch (err) {
            res.status(500).json({ error: 'server_error', message: err.message });
            runtime.logger.error(`api put schedules: ${err.message}`);
        }
    });

    // DELETE - Remove schedule
    commandApp.delete('/api/schedules/:tagId', secureFnc, async (req, res) => {
        if (!requireAdmin(req, res)) return;

        const tagId = req.params.tagId;

        jobs = jobs.filter(job => {
            const match = job.name.startsWith(tagId);
            if (match && job.job) job.job.cancel();
            return !match;
        });

        schedules = schedules.filter(s => s.tagId !== tagId);
        try {
            const { ProjectDataCmdType } = runtime.project;
            await runtime.project.setProjectData(ProjectDataCmdType.DelSchedule, { tagId });
            res.json({ message: 'Schedule deleted', tagId });
        } catch (err) {
            res.status(500).json({ error: 'server_error', message: err.message });
            runtime.logger.error(`api delete schedules: ${err.message}`);
        }
    });

    // GET - Retrieve all schedules with status
    commandApp.get('/api/schedules', secureFnc, async (req, res) => {
        if (!requireAdmin(req, res)) return;

        try {
            const now = moment();
            const status = schedules.map(s => {
                const isOn = s.periods.some(p => {
                    const today = now.day();
                    if (parseInt(p.dayOfWeek) !== today) return false;

                    const start = moment(p.startTime, 'HH:mm');
                    const end = moment(p.endTime, 'HH:mm');
                    const nowTime = moment(now.format('HH:mm'), 'HH:mm');

                    return nowTime.isBetween(start, end, null, '[)');
                });
                return { ...s, isOn };
            });

            res.json(status);
        } catch (err) {
            res.status(500).json({ error: 'server_error', message: err.message });
            runtime.logger.error(`api get schedules: ${err.message}`);
        }
    });

    return commandApp;
}

module.exports = {
    init: async function (_runtime, _secureFnc, _checkGroupsFnc) {
        runtime = _runtime;
        secureFnc = _secureFnc;
        checkGroupsFnc = _checkGroupsFnc;

        await loadSchedules();

        // Wait some time before loading tags
        setTimeout(async () => {
            await applyCurrentStates();
        }, 5000); // ms delay
    },
    app: createApp
};